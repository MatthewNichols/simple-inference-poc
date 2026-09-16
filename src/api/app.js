import { createServer } from "node:http";
import { extractFlightDetailsFromSource } from "../extractFlightDetails.js";
import { extractHotelDetailsFromSource, NonReservationDocumentError } from "../extractHotelDetails.js";
import { loadSourceTextFromBuffer, SOURCE_TYPES } from "../documentSource.js";
import { openapiDocument } from "./openapi.js";

class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

function sendError(res, err) {
  if (err instanceof ApiError) {
    sendJson(res, err.status, {
      error: { code: err.code, message: err.message, ...(err.reason ? { reason: err.reason } : {}) },
    });
    return;
  }
  console.error(err);
  sendJson(res, 500, { error: { code: "INTERNAL_ERROR", message: err.message ?? "Unexpected error" } });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "Request body must be valid JSON.");
  }
}

async function resolveSource(body) {
  const { sourceType, contentBase64 } = body;
  if (!SOURCE_TYPES.includes(sourceType)) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      `"sourceType" must be one of ${SOURCE_TYPES.join(", ")}.`
    );
  }
  if (typeof contentBase64 !== "string" || !contentBase64) {
    throw new ApiError(400, "BAD_REQUEST", '"contentBase64" is required.');
  }

  const buffer = Buffer.from(contentBase64, "base64");

  try {
    const { sourceText } = await loadSourceTextFromBuffer(sourceType, buffer);
    return { sourceType, sourceText, sourceFile: null };
  } catch (err) {
    throw new ApiError(400, "BAD_REQUEST", err.message);
  }
}

function checkAuth(req, apiKey) {
  if (req.headers["x-api-key"] !== apiKey) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid x-api-key header.");
  }
}

async function handleExtract(extractFromSource, req, res, apiKey) {
  checkAuth(req, apiKey);
  const body = await readJsonBody(req);
  const source = await resolveSource(body);
  const options = typeof body.model === "string" && body.model ? { model: body.model } : {};

  try {
    const result = await extractFromSource(source, options);
    sendJson(res, 200, result);
  } catch (err) {
    if (err instanceof NonReservationDocumentError) {
      throw new ApiError(422, "NON_RESERVATION_DOCUMENT", err.message, { reason: err.reason });
    }
    throw err;
  }
}

/**
 * Builds the stateless extraction API as a plain node:http server - no
 * framework dependency, no server-side session/file state. Every request
 * carries its own document bytes and is handled independently.
 *
 * `apiKey` is deliberately a single shared secret checked against the
 * `x-api-key` header - adequate for this POC, not for production.
 */
export function createApiServer({ apiKey = process.env.API_KEY ?? "poc-dev-key" } = {}) {
  return createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

      if (req.method === "GET" && pathname === "/healthz") {
        sendJson(res, 200, { status: "ok" });
        return;
      }
      if (req.method === "GET" && pathname === "/openapi.json") {
        sendJson(res, 200, openapiDocument);
        return;
      }
      if (req.method === "POST" && pathname === "/v1/extract/flight") {
        await handleExtract(extractFlightDetailsFromSource, req, res, apiKey);
        return;
      }
      if (req.method === "POST" && pathname === "/v1/extract/hotel") {
        await handleExtract(extractHotelDetailsFromSource, req, res, apiKey);
        return;
      }

      throw new ApiError(404, "NOT_FOUND", `No route for ${req.method} ${pathname}.`);
    } catch (err) {
      sendError(res, err);
    }
  });
}
