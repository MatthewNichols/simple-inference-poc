import { loadSourceText } from "./documentSource.js";
import { runExtraction } from "./extractionCore.js";
import { DEFAULT_MODEL } from "./ollamaClient.js";
import { FLIGHT_JSON_SCHEMA, normalizeFlightPayload } from "./schemas/flight-schema.js";

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
 * Extracts structured flight details given source text that's already been
 * resolved (from disk or from an in-memory buffer). Returns a payload
 * matching the shape documented in src/schemas/flight-schema.js.
 */
export async function extractFlightDetailsFromSource(
  { sourceType, sourceText, sourceFile },
  { model = DEFAULT_MODEL } = {}
) {
  return runExtraction({
    sourceType,
    sourceText,
    sourceFile,
    model,
    buildPrompt,
    schema: FLIGHT_JSON_SCHEMA,
    normalize: normalizeFlightPayload,
  });
}

/** Extracts structured flight details from an email (text) or image file on disk. */
export async function extractFlightDetails(filePath, options = {}) {
  const { sourceType, sourceText } = await loadSourceText(filePath);
  return extractFlightDetailsFromSource(
    { sourceType, sourceText, sourceFile: filePath },
    options
  );
}
