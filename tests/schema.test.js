import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFlightPayload, FLIGHT_LEG_FIELDS } from "../src/schema.js";

test("normalizeFlightPayload fills missing top-level fields with null", () => {
  const result = normalizeFlightPayload({});
  assert.equal(result.confirmationNumber, null);
  assert.equal(result.passengerName, null);
  assert.deepEqual(result.flights, []);
});

test("normalizeFlightPayload fills missing leg fields with null", () => {
  const result = normalizeFlightPayload({
    flights: [{ airline: "United", flightNumber: "UA482" }],
  });
  assert.equal(result.flights.length, 1);
  for (const field of FLIGHT_LEG_FIELDS) {
    assert.ok(field in result.flights[0], `missing field ${field}`);
  }
  assert.equal(result.flights[0].airline, "United");
  assert.equal(result.flights[0].departureAirport, null);
});

test("normalizeFlightPayload passes through well-formed input unchanged", () => {
  const input = {
    confirmationNumber: "ABC123",
    passengerName: "Matthew Nichols",
    flights: [
      {
        airline: "United",
        flightNumber: "UA482",
        departureAirport: "DEN",
        arrivalAirport: "ORD",
        departureDateTime: "2026-09-16T06:45:00",
        arrivalDateTime: "2026-09-16T10:12:00",
        seat: "14C",
        cabinClass: "Economy",
      },
    ],
  };
  assert.deepEqual(normalizeFlightPayload(input), input);
});

test("normalizeFlightPayload treats a non-array flights field as empty", () => {
  const result = normalizeFlightPayload({ flights: "not an array" });
  assert.deepEqual(result.flights, []);
});
