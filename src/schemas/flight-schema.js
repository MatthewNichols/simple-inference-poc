/**
 * Canonical output shape for flight-detail extraction.
 *
 * One JSON payload per source document (one email, one image). A document
 * may describe multiple flight legs (round-trip, connections, multi-city),
 * so legs are always an array, even for a single one-way flight.
 *
 * {
 *   sourceType: "email" | "image",
 *   sourceFile: string,
 *   confirmationNumber: string | null,
 *   passengerName: string | null,
 *   flights: [
 *     {
 *       airline: string | null,          // e.g. "United Airlines"
 *       flightNumber: string | null,     // e.g. "UA482"
 *       departureAirport: string | null, // IATA code, e.g. "DEN"
 *       arrivalAirport: string | null,   // IATA code, e.g. "ORD"
 *       departureDateTime: string | null,// ISO 8601, e.g. "2026-09-15T06:45:00"
 *       arrivalDateTime: string | null,  // ISO 8601, e.g. "2026-09-15T10:12:00"
 *       seat: string | null,             // e.g. "14C"
 *       cabinClass: string | null        // e.g. "Economy"
 *     }
 *   ],
 *   modelUsed: string,
 *   extractedAt: string,   // ISO 8601 timestamp of when extraction ran
 *   rawTextExcerpt: string // first 300 chars of the text fed to the LLM, for debugging
 * }
 *
 * Dates are emitted without a UTC offset because flight confirmations give
 * local time at the airport, not UTC - the LLM is not expected to resolve
 * timezones.
 */

export const FLIGHT_LEG_FIELDS = [
  "airline",
  "flightNumber",
  "departureAirport",
  "arrivalAirport",
  "departureDateTime",
  "arrivalDateTime",
  "seat",
  "cabinClass",
];

export const FLIGHT_PAYLOAD_FIELDS = [
  "confirmationNumber",
  "passengerName",
  "flights",
];

// JSON Schema handed to the LLM (Ollama's `format` parameter) so the model
// is constrained to emit valid, correctly-typed JSON.
export const FLIGHT_JSON_SCHEMA = {
  type: "object",
  properties: {
    confirmationNumber: { type: ["string", "null"] },
    passengerName: { type: ["string", "null"] },
    flights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          airline: { type: ["string", "null"] },
          flightNumber: { type: ["string", "null"] },
          departureAirport: { type: ["string", "null"] },
          arrivalAirport: { type: ["string", "null"] },
          departureDateTime: { type: ["string", "null"] },
          arrivalDateTime: { type: ["string", "null"] },
          seat: { type: ["string", "null"] },
          cabinClass: { type: ["string", "null"] },
        },
        required: [
          "airline",
          "flightNumber",
          "departureAirport",
          "arrivalAirport",
          "departureDateTime",
          "arrivalDateTime",
          "seat",
          "cabinClass",
        ],
      },
    },
  },
  required: ["confirmationNumber", "passengerName", "flights"],
};

/** Fills in any missing fields with `null` so consumers get a stable shape. */
export function normalizeFlightPayload(raw) {
  const normalizedFlights = Array.isArray(raw?.flights)
    ? raw.flights.map((leg) => {
        const normalizedLeg = {};
        for (const field of FLIGHT_LEG_FIELDS) {
          normalizedLeg[field] = leg?.[field] ?? null;
        }
        return normalizedLeg;
      })
    : [];

  return {
    confirmationNumber: raw?.confirmationNumber ?? null,
    passengerName: raw?.passengerName ?? null,
    flights: normalizedFlights,
  };
}
