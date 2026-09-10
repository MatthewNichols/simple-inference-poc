import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { extractTextFromImage } from "./ocr.js";
import { generateJson, DEFAULT_MODEL } from "./ollamaClient.js";
import { FLIGHT_JSON_SCHEMA, normalizeFlightPayload } from "./schema.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);
const TEXT_EXTENSIONS = new Set([".txt", ".eml"]);

function detectSourceType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (TEXT_EXTENSIONS.has(ext)) return "email";
  throw new Error(
    `Cannot infer source type from extension "${ext}". Expected one of ${[
      ...IMAGE_EXTENSIONS,
      ...TEXT_EXTENSIONS,
    ].join(", ")}.`
  );
}

function buildPrompt(sourceText) {
  return `You are an information-extraction engine. Extract flight details from the text below, which comes from a flight confirmation email or a screenshot of one.

Rules:
- Return only the fields defined by the JSON schema you were given.
- If a field is not present in the text, use null - do not guess or invent values.
- flightNumber should combine airline code and number, e.g. "UA482".
- Airport fields should be 3-letter IATA codes if present in the text.
- Date/time fields should be ISO 8601 local time (no timezone offset), e.g. "2026-09-15T06:45:00". Infer the year from context if only month/day is given; if no year is present anywhere, use null for the date field rather than guessing.
- A round-trip or multi-city itinerary has multiple entries in "flights".

Text:
"""
${sourceText}
"""`;
}

/**
 * Extracts structured flight details from an email (text) or image file.
 * Returns a payload matching the shape documented in src/schema.js.
 */
export async function extractFlightDetails(filePath, { model = DEFAULT_MODEL } = {}) {
  const sourceType = detectSourceType(filePath);

  const sourceText =
    sourceType === "image"
      ? await extractTextFromImage(filePath)
      : await readFile(filePath, "utf8");

  const raw = await generateJson({
    prompt: buildPrompt(sourceText),
    schema: FLIGHT_JSON_SCHEMA,
    model,
  });

  const normalized = normalizeFlightPayload(raw);

  return {
    sourceType,
    sourceFile: filePath,
    ...normalized,
    modelUsed: model,
    extractedAt: new Date().toISOString(),
    rawTextExcerpt: sourceText.slice(0, 300),
  };
}
