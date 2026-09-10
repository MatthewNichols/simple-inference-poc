import { test } from "node:test";
import assert from "node:assert/strict";
import { extractFlightDetails } from "../src/extractFlightDetails.js";
import { isOllamaAvailable, DEFAULT_MODEL } from "../src/ollamaClient.js";

// These tests exercise the full harness end-to-end (OCR + a real local LLM
// call) against the fixtures in test-data/. They require a running Ollama
// server with DEFAULT_MODEL pulled - see README.md "Manual setup". Rather
// than failing a fresh checkout that hasn't done that setup, each test
// skips itself with an explanatory message.
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

function assertWellFormedPayload(result, { sourceType }) {
  assert.equal(result.sourceType, sourceType);
  assert.equal(typeof result.modelUsed, "string");
  assert.ok(!Number.isNaN(Date.parse(result.extractedAt)));
  assert.ok(Array.isArray(result.flights));
  assert.ok(result.flights.length >= 1);
  for (const leg of result.flights) {
    for (const field of [
      "airline",
      "flightNumber",
      "departureAirport",
      "arrivalAirport",
      "departureDateTime",
      "arrivalDateTime",
      "seat",
      "cabinClass",
    ]) {
      assert.ok(field in leg, `leg missing field ${field}`);
    }
  }
}

test("extracts a one-way itinerary from a plain-text email", async (t) => {
  if (skipIfNoOllama(t)) return;

  const result = await extractFlightDetails("test-data/emails/oneway-united.txt");
  assertWellFormedPayload(result, { sourceType: "email" });

  assert.equal(result.confirmationNumber, "7XQK4P");
  assert.equal(result.flights.length, 1);
  assert.match(result.flights[0].flightNumber, /UA ?482/i);
  assert.equal(result.flights[0].departureAirport, "DEN");
  assert.equal(result.flights[0].arrivalAirport, "ORD");
});

test("extracts both legs of a round-trip itinerary from a plain-text email", async (t) => {
  if (skipIfNoOllama(t)) return;

  const result = await extractFlightDetails("test-data/emails/roundtrip-delta.txt");
  assertWellFormedPayload(result, { sourceType: "email" });

  assert.equal(result.confirmationNumber, "JXQ9RT");
  assert.equal(result.flights.length, 2);
  assert.equal(result.flights[0].departureAirport, "ATL");
  assert.equal(result.flights[0].arrivalAirport, "SEA");
  assert.equal(result.flights[1].departureAirport, "SEA");
  assert.equal(result.flights[1].arrivalAirport, "ATL");
});

test("extracts a multi-city itinerary from a plain-text email", async (t) => {
  if (skipIfNoOllama(t)) return;

  const result = await extractFlightDetails("test-data/emails/multicity-alaska.txt");
  assertWellFormedPayload(result, { sourceType: "email" });

  assert.equal(result.confirmationNumber, "4KDLQZ");
  assert.equal(result.flights.length, 2);
});

test("extracts flight details from a boarding-pass image via OCR + LLM", async (t) => {
  if (skipIfNoOllama(t)) return;

  const result = await extractFlightDetails(
    "test-data/images/boardingpass-southwest.png"
  );
  assertWellFormedPayload(result, { sourceType: "image" });

  assert.equal(result.confirmationNumber, "N4T7QX");
  assert.equal(result.flights[0].departureAirport, "DEN");
  assert.equal(result.flights[0].arrivalAirport, "MDW");
});

test("extracts flight details from a confirmation screenshot via OCR + LLM", async (t) => {
  if (skipIfNoOllama(t)) return;

  const result = await extractFlightDetails(
    "test-data/images/confirmation-screenshot-jetblue.png"
  );
  assertWellFormedPayload(result, { sourceType: "image" });

  assert.equal(result.confirmationNumber, "QP8LMX");
  assert.equal(result.flights[0].departureAirport, "BOS");
  assert.equal(result.flights[0].arrivalAirport, "MCO");
});
