import { loadSourceText } from "./documentSource.js";
import { runExtraction } from "./extractionCore.js";
import { DEFAULT_MODEL } from "./ollamaClient.js";
import { HOTEL_JSON_SCHEMA, normalizeHotelPayload } from "./schemas/hotel-schema.js";

// Documents that describe a cancellation (rather than an active reservation)
// have a fundamentally different shape - there is no stay to extract, just a
// reference to one that no longer exists. Detected on the raw text before
// the LLM call so callers get a clear, cheap, typed signal instead of either
// a crash or a normalized-but-meaningless "reservation".
const CANCELLATION_PATTERN =
  /cancellation\s+confirmed|cancellation\s+id\s*:|\b(?:stay|reservation|booking)\b[^.\n]{0,40}\bcancell?ed\b/i;

export class NonReservationDocumentError extends Error {
  constructor(message, { reason, sourceFile } = {}) {
    super(message);
    this.name = "NonReservationDocumentError";
    this.reason = reason;
    this.sourceFile = sourceFile;
  }
}

function buildPrompt(sourceText) {
  return `You are an information-extraction engine. Extract hotel stay details from the text below, which comes from a hotel reservation confirmation email or a screenshot of one.

Rules:
- Return only the fields defined by the JSON schema you were given.
- If a field is not present in the text, use null - do not guess or invent values.
- hotelAddress should be the full street address as written in the text, not just the city.
- If the document has both a booking/agency reference (e.g. "Stay ID", "Booking Reference") and a separate hotel-only confirmation number (e.g. "Hotel Confirmation"), use the booking/agency reference as confirmationNumber - that's the number the guest uses to identify their reservation.
- Date fields should be ISO 8601 calendar dates (no time), e.g. "2027-02-10". Infer the year from context if only month/day is given; if no year is present anywhere, use null for the date field rather than guessing.
- A document describing multiple properties (e.g. a multi-city trip) has multiple entries in "stays".

Text:
"""
${sourceText}
"""`;
}

/**
 * Extracts structured hotel-stay details given source text that's already
 * been resolved (from disk or from an in-memory buffer). Returns a payload
 * matching the shape documented in src/schemas/hotel-schema.js.
 *
 * Throws NonReservationDocumentError (instead of returning a payload) if the
 * document turns out to be a cancellation notice rather than a booking.
 */
export async function extractHotelDetailsFromSource(
  { sourceType, sourceText, sourceFile },
  { model = DEFAULT_MODEL } = {}
) {
  if (CANCELLATION_PATTERN.test(sourceText)) {
    throw new NonReservationDocumentError(
      `"${sourceFile}" looks like a cancellation notice, not an active reservation - there is no stay to extract. ` +
        "If you have the original booking confirmation, run extraction against that instead.",
      { reason: "cancellation", sourceFile }
    );
  }

  return runExtraction({
    sourceType,
    sourceText,
    sourceFile,
    model,
    buildPrompt,
    schema: HOTEL_JSON_SCHEMA,
    normalize: normalizeHotelPayload,
  });
}

/** Extracts structured hotel-stay details from an email (text) or image file on disk. */
export async function extractHotelDetails(filePath, options = {}) {
  const { sourceType, sourceText } = await loadSourceText(filePath);
  return extractHotelDetailsFromSource({ sourceType, sourceText, sourceFile: filePath }, options);
}
