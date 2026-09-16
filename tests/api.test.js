import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createApiServer } from "../src/api/app.js";
import { isOllamaAvailable, DEFAULT_MODEL } from "../src/ollamaClient.js";

const API_KEY = "test-key";

async function withServer(fn) {
  const server = createApiServer({ apiKey: API_KEY });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function authHeaders(extra = {}) {
  return { "Content-Type": "application/json", "x-api-key": API_KEY, ...extra };
}

// See tests/extractFlightDetails.test.js for why these tests skip themselves
// when Ollama isn't set up locally.
const ollamaReady = await isOllamaAvailable();
function skipIfNoOllama(t) {
  if (!ollamaReady) {
    t.skip(
      `Ollama not reachable at localhost:11434 with model "${DEFAULT_MODEL}" pulled. ` +
        "See README.md for setup steps - skipping live extraction test."
    );
    return true;
  }
  return false;
}

test("GET /healthz responds without auth", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  });
});

test("GET /openapi.json serves metadata a client generator can consume", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/openapi.json`);
    assert.equal(res.status, 200);
    const doc = await res.json();
    assert.equal(doc.openapi, "3.0.3");
    assert.ok(doc.paths["/v1/extract/flight"]);
    assert.ok(doc.paths["/v1/extract/hotel"]);
    assert.ok(doc.components.schemas.FlightExtractionResult);
    assert.ok(doc.components.schemas.HotelExtractionResult);
    assert.ok(doc.components.securitySchemes.apiKeyAuth);
  });
});

test("GET /openapi.json has no array-valued `type` fields (invalid in OpenAPI 3.0)", async () => {
  // FLIGHT_JSON_SCHEMA/HOTEL_JSON_SCHEMA use `type: [T, "null"]` for the
  // Ollama-facing JSON Schema, which is valid JSON Schema but not OpenAPI
  // 3.0 - there, nullability must be `nullable: true` with a single-string
  // `type`. openapi.js converts this when embedding those fragments; this
  // guards against that conversion silently regressing (a real generator
  // - openapi-generator via Docker - rejected the unconverted spec outright).
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/openapi.json`);
    const doc = await res.json();

    const offendingPaths = [];
    function walk(node, path) {
      if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, `${path}[${i}]`));
      } else if (node && typeof node === "object") {
        if (Array.isArray(node.type)) offendingPaths.push(`${path}.type`);
        for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
      }
    }
    walk(doc, "openapi.json");

    assert.deepEqual(offendingPaths, []);
  });
});

test("POST /v1/extract/flight without an API key is rejected", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/v1/extract/flight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType: "email", contentBase64: "aGk=" }),
    });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, "UNAUTHORIZED");
  });
});

test("POST /v1/extract/hotel rejects a wrong API key", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/v1/extract/hotel`, {
      method: "POST",
      headers: authHeaders({ "x-api-key": "nope" }),
      body: JSON.stringify({ sourceType: "email", contentBase64: "aGk=" }),
    });
    assert.equal(res.status, 401);
  });
});

test("POST /v1/extract/flight rejects a request missing contentBase64", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/v1/extract/flight`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sourceType: "email" }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "BAD_REQUEST");
  });
});

test("POST /v1/extract/flight rejects an invalid sourceType", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/v1/extract/flight`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sourceType: "pdf", contentBase64: "aGk=" }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "BAD_REQUEST");
  });
});

test("POST /v1/extract/hotel returns 422 for a cancellation notice, without calling the model", async () => {
  await withServer(async (baseUrl) => {
    const content = await readFile("test-data/hotel-emails/stay-9.txt");
    const res = await fetch(`${baseUrl}/v1/extract/hotel`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sourceType: "email", contentBase64: content.toString("base64") }),
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.error.code, "NON_RESERVATION_DOCUMENT");
    assert.equal(body.error.reason, "cancellation");
  });
});

test("POST /v1/extract/hotel extracts a real reservation end-to-end", async (t) => {
  if (skipIfNoOllama(t)) return;
  await withServer(async (baseUrl) => {
    const content = await readFile("test-data/hotel-emails/stay-4.txt");
    const res = await fetch(`${baseUrl}/v1/extract/hotel`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sourceType: "email", contentBase64: content.toString("base64") }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.sourceType, "email");
    assert.equal(body.sourceFile, null);
    assert.equal(body.confirmationNumber, "ACME-DV8N-MTHP4");
    assert.match(body.stays[0].hotelName, /Grandview Suites Charleston/i);
  });
});

test("POST /v1/extract/flight extracts from an image buffer end-to-end (OCR over the wire)", async (t) => {
  if (skipIfNoOllama(t)) return;
  await withServer(async (baseUrl) => {
    const content = await readFile("test-data/flight-images/boardingpass-southwest.png");
    const res = await fetch(`${baseUrl}/v1/extract/flight`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        sourceType: "image",
        contentBase64: content.toString("base64"),
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.sourceType, "image");
    assert.equal(body.confirmationNumber, "N4T7QX");
  });
});
