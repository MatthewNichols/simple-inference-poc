import { SOURCE_TYPES } from "../documentSource.js";
import { FLIGHT_JSON_SCHEMA } from "../schemas/flight-schema.js";
import { HOTEL_JSON_SCHEMA } from "../schemas/hotel-schema.js";

// FLIGHT_JSON_SCHEMA/HOTEL_JSON_SCHEMA use `type: [T, "null"]` for nullable
// fields, which is valid JSON Schema (and OpenAPI 3.1) but not OpenAPI 3.0 -
// there, nullability is a separate `nullable: true` keyword and `type` must
// be a single string. This walks a schema fragment and rewrites it so the
// same fragments can be embedded in a 3.0 document without hand-duplicating
// every field.
function toOpenApi30Schema(node) {
  if (Array.isArray(node)) return node.map(toOpenApi30Schema);
  if (node === null || typeof node !== "object") return node;

  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "type" && Array.isArray(value)) {
      const nonNullTypes = value.filter((t) => t !== "null");
      result.type = nonNullTypes.length === 1 ? nonNullTypes[0] : nonNullTypes;
      if (nonNullTypes.length !== value.length) result.nullable = true;
    } else {
      result[key] = toOpenApi30Schema(value);
    }
  }
  return result;
}

// Wraps a document-type's JSON Schema (already used to constrain the LLM's
// output) with the envelope fields every extraction response shares. Built
// from the same schema fragments the extractors validate against, rather
// than duplicating field lists by hand.
function extractionResultSchema(payloadSchema) {
  const { properties, required } = toOpenApi30Schema(payloadSchema);
  return {
    type: "object",
    properties: {
      sourceType: {
        type: "string",
        enum: SOURCE_TYPES,
        description: "Whether the document was treated as plain text or run through OCR first.",
      },
      sourceFile: {
        type: "string",
        nullable: true,
        description:
          "Always null for API-originated extractions - there is no server-side file. " +
          "(The CLI populates this with a real path when run locally.)",
      },
      ...properties,
      modelUsed: { type: "string" },
      extractedAt: { type: "string", format: "date-time" },
      rawTextExcerpt: {
        type: "string",
        description: "First 300 characters of the text fed to the model, for debugging.",
      },
    },
    required: [
      "sourceType",
      "sourceFile",
      ...required,
      "modelUsed",
      "extractedAt",
      "rawTextExcerpt",
    ],
  };
}

const extractionRequestSchema = {
  type: "object",
  required: ["sourceType", "contentBase64"],
  properties: {
    sourceType: {
      type: "string",
      enum: SOURCE_TYPES,
      description:
        '"email" for a plain-text document, "image" to run OCR on it first. The caller states ' +
        "this explicitly - it is not inferred from a filename.",
    },
    contentBase64: {
      type: "string",
      format: "byte",
      description: "Base64-encoded bytes of the document (a text file or an image).",
    },
    model: {
      type: "string",
      description: "Optional Ollama model override. Defaults to the server's configured model.",
    },
  },
};

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: {
          type: "string",
          enum: [
            "BAD_REQUEST",
            "UNAUTHORIZED",
            "NOT_FOUND",
            "NON_RESERVATION_DOCUMENT",
            "INTERNAL_ERROR",
          ],
        },
        message: { type: "string" },
        reason: {
          type: "string",
          nullable: true,
          description: 'Present for NON_RESERVATION_DOCUMENT errors, e.g. "cancellation".',
        },
      },
    },
  },
};

function extractionPath(documentType, { extraResponses = {} } = {}) {
  return {
    post: {
      operationId: `extract${documentType[0].toUpperCase()}${documentType.slice(1)}Details`,
      summary: `Extract structured ${documentType} details from a document`,
      security: [{ apiKeyAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: `#/components/schemas/ExtractionRequest` } },
        },
      },
      responses: {
        200: {
          description: "Extraction succeeded",
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${documentType[0].toUpperCase()}${documentType.slice(1)}ExtractionResult` },
            },
          },
        },
        400: {
          description: "Malformed request (missing fields, bad base64, unrecognized extension)",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        401: {
          description: "Missing or invalid API key",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        ...extraResponses,
        500: {
          description: "Extraction failed unexpectedly (e.g. the LLM backend is unreachable)",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
    },
  };
}

export const openapiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Simple Inference POC API",
    version: "1.0.0",
    description:
      "Stateless document-extraction service. Send document bytes, get back structured JSON. " +
      "This document is served at /openapi.json specifically so a client library can be " +
      "generated from it (e.g. via openapi-generator or a similar tool).",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description:
          "Trivial shared-secret auth for this POC - not suitable for production use.",
      },
    },
    schemas: {
      ExtractionRequest: extractionRequestSchema,
      FlightExtractionResult: extractionResultSchema(FLIGHT_JSON_SCHEMA),
      HotelExtractionResult: extractionResultSchema(HOTEL_JSON_SCHEMA),
      Error: errorSchema,
    },
  },
  paths: {
    "/healthz": {
      get: {
        operationId: "getHealth",
        summary: "Liveness check",
        security: [],
        responses: {
          200: {
            description: "Service is up",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { status: { type: "string", enum: ["ok"] } },
                },
              },
            },
          },
        },
      },
    },
    "/v1/extract/flight": extractionPath("flight"),
    "/v1/extract/hotel": extractionPath("hotel", {
      422: {
        description:
          "The document is well-formed but isn't an active reservation (e.g. a cancellation notice)",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    }),
  },
};
