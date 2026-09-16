/**
 * Canonical output shape for hotel-stay extraction.
 *
 * One JSON payload per source document (one email, one image). A document
 * may describe multiple properties (e.g. a multi-city trip booked in one
 * confirmation), so stays are always an array, even for a single stay.
 *
 * {
 *   sourceType: "email" | "image",
 *   sourceFile: string,
 *   confirmationNumber: string | null,
 *   guestName: string | null,
 *   stays: [
 *     {
 *       hotelName: string | null,      // e.g. "Grandview Suites Charleston"
 *       hotelAddress: string | null,   // full street address as given
 *       hotelPhone: string | null,     // as given, no normalization
 *       checkInDate: string | null,    // ISO 8601 date, e.g. "2027-02-10"
 *       checkOutDate: string | null,   // ISO 8601 date, e.g. "2027-02-13"
 *       roomType: string | null        // e.g. "Deluxe King Suite"
 *     }
 *   ],
 *   modelUsed: string,
 *   extractedAt: string,   // ISO 8601 timestamp of when extraction ran
 *   rawTextExcerpt: string // first 300 chars of the text fed to the LLM, for debugging
 * }
 *
 * Dates are emitted without a time component - check-in/check-out are
 * calendar dates, not specific moments, even when the source document also
 * gives an estimated check-in time.
 */

export const HOTEL_STAY_FIELDS = [
  "hotelName",
  "hotelAddress",
  "hotelPhone",
  "checkInDate",
  "checkOutDate",
  "roomType",
];

export const HOTEL_PAYLOAD_FIELDS = [
  "confirmationNumber",
  "guestName",
  "stays",
];

// JSON Schema handed to the LLM (Ollama's `format` parameter) so the model
// is constrained to emit valid, correctly-typed JSON.
export const HOTEL_JSON_SCHEMA = {
  type: "object",
  properties: {
    confirmationNumber: { type: ["string", "null"] },
    guestName: { type: ["string", "null"] },
    stays: {
      type: "array",
      items: {
        type: "object",
        properties: {
          hotelName: { type: ["string", "null"] },
          hotelAddress: { type: ["string", "null"] },
          hotelPhone: { type: ["string", "null"] },
          checkInDate: { type: ["string", "null"] },
          checkOutDate: { type: ["string", "null"] },
          roomType: { type: ["string", "null"] },
        },
        required: [
          "hotelName",
          "hotelAddress",
          "hotelPhone",
          "checkInDate",
          "checkOutDate",
          "roomType",
        ],
      },
    },
  },
  required: ["confirmationNumber", "guestName", "stays"],
};

/** Fills in any missing fields with `null` so consumers get a stable shape. */
export function normalizeHotelPayload(raw) {
  const normalizedStays = Array.isArray(raw?.stays)
    ? raw.stays.map((stay) => {
        const normalizedStay = {};
        for (const field of HOTEL_STAY_FIELDS) {
          normalizedStay[field] = stay?.[field] ?? null;
        }
        return normalizedStay;
      })
    : [];

  return {
    confirmationNumber: raw?.confirmationNumber ?? null,
    guestName: raw?.guestName ?? null,
    stays: normalizedStays,
  };
}
