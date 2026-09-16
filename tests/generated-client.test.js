import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApiServer } from "../src/api/app.js";
import { isOllamaAvailable, DEFAULT_MODEL } from "../src/ollamaClient.js";

// Exercises the client that `npm run generate-client` / `generate-client:npx`
// produces, to make sure the OpenAPI document actually yields a working
// client - not just a document that looks plausible.
//
// The generated client is TypeScript, and its runtime.ts uses parameter
// properties (`constructor(private configuration ...)`), which Node's
// built-in type-stripping can't handle (only erasure, not real
// transformation) - so it's loaded through tsx (a devDependency) instead.
//
// `./generated-client/` is gitignored build output, not something checked
// in, so it won't exist on a fresh checkout until someone runs the generate
// script. These tests detect that and skip themselves with a clear message
// rather than failing, the same way the Ollama-dependent tests do below.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientEntryPath = path.join(__dirname, "..", "generated-client", "index.ts");

let clientModulePromise;
async function loadGeneratedClient(t) {
  if (!existsSync(clientEntryPath)) {
    t.skip(
      `No generated client at ${path.relative(process.cwd(), clientEntryPath)} - run ` +
        "`npm run generate-client` (or `npm run generate-client:npx`) first. See README.md " +
        '"Generating a client library". Skipping this test.'
    );
    return null;
  }

  try {
    if (!clientModulePromise) {
      const { register } = await import("tsx/esm/api");
      register();
      clientModulePromise = import(pathToFileURL(clientEntryPath).href);
    }
    return await clientModulePromise;
  } catch (err) {
    t.skip(`Generated client exists but failed to load: ${err.message}. Skipping this test.`);
    return null;
  }
}

async function withServer(fn) {
  const server = createApiServer({ apiKey: "test-key" });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
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

test("generated client surfaces the 422 cancellation error with the documented shape", async (t) => {
  const client = await loadGeneratedClient(t);
  if (!client) return;
  const { DefaultApi, Configuration, ResponseError } = client;

  await withServer(async (basePath) => {
    const api = new DefaultApi(
      new Configuration({ basePath, headers: { "x-api-key": "test-key" } })
    );
    const content = await readFile("test-data/hotel-emails/stay-9.txt");

    let caught;
    try {
      await api.extractHotelDetails({
        extractionRequest: { sourceType: "email", contentBase64: content.toString("base64") },
      });
    } catch (err) {
      caught = err;
    }

    assert.ok(caught instanceof ResponseError, "expected a ResponseError to be thrown");
    assert.equal(caught.response.status, 422);
    const body = await caught.response.json();
    assert.equal(body.error.code, "NON_RESERVATION_DOCUMENT");
    assert.equal(body.error.reason, "cancellation");
  });
});

test("generated client extracts a real hotel reservation end-to-end", async (t) => {
  const client = await loadGeneratedClient(t);
  if (!client) return;
  if (skipIfNoOllama(t)) return;
  const { DefaultApi, Configuration } = client;

  await withServer(async (basePath) => {
    const api = new DefaultApi(
      new Configuration({ basePath, headers: { "x-api-key": "test-key" } })
    );
    const content = await readFile("test-data/hotel-emails/stay-4.txt");

    const result = await api.extractHotelDetails({
      extractionRequest: { sourceType: "email", contentBase64: content.toString("base64") },
    });

    assert.equal(result.sourceType, "email");
    assert.equal(result.confirmationNumber, "ACME-DV8N-MTHP4");
    assert.match(result.stays[0].hotelName, /Grandview Suites Charleston/i);
  });
});
