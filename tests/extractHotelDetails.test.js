import { test } from "node:test";
import assert from "node:assert/strict";
import { extractHotelDetails, NonReservationDocumentError } from "../src/extractHotelDetails.js";
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
  assert.ok(Array.isArray(result.stays));
  assert.ok(result.stays.length >= 1);
  for (const stay of result.stays) {
    for (const field of [
      "hotelName",
      "hotelAddress",
      "hotelPhone",
      "checkInDate",
      "checkOutDate",
      "roomType",
    ]) {
      assert.ok(field in stay, `stay missing field ${field}`);
    }
  }
}

test("extracts a confirmed reservation from a plain-text email", async (t) => {
  if (skipIfNoOllama(t)) return;

  const result = await extractHotelDetails("test-data/hotel-emails/stay-4.txt");
  assertWellFormedPayload(result, { sourceType: "email" });

  assert.equal(result.confirmationNumber, "ACME-DV8N-MTHP4");
  assert.match(result.stays[0].hotelName, /Grandview Suites Charleston/i);
  assert.equal(result.stays[0].checkInDate, "2027-02-10");
  assert.equal(result.stays[0].checkOutDate, "2027-02-13");
});

test("extracts a pending alias stay from a forwarded booking-agent email", async (t) => {
  if (skipIfNoOllama(t)) return;

  const result = await extractHotelDetails("test-data/hotel-emails/stay-1.txt");
  assertWellFormedPayload(result, { sourceType: "email" });

  // The email contains two valid identifiers - an agency "Stay ID" and a
  // separate property-side "Hotel Confirmation" number - so either is an
  // acceptable extraction, even though the prompt prefers the Stay ID.
  assert.match(result.confirmationNumber, /^(ACME-BQZM-KWLP3|71942FF985129)$/);
  assert.match(result.stays[0].hotelName, /Oakhaven Inn/i);
  assert.equal(result.stays[0].checkInDate, "2027-03-15");
  assert.equal(result.stays[0].checkOutDate, "2027-03-18");
});

test("extracts a corporate travel-desk booking", async (t) => {
  if (skipIfNoOllama(t)) return;

  const result = await extractHotelDetails("test-data/hotel-emails/stay-7.txt");
  assertWellFormedPayload(result, { sourceType: "email" });

  assert.equal(result.confirmationNumber, "QK7F2P");
  assert.match(result.stays[0].hotelName, /Ridgeline Business Hotel/i);
  assert.equal(result.stays[0].checkInDate, "2027-06-14");
  assert.equal(result.stays[0].checkOutDate, "2027-06-17");
});

test("throws NonReservationDocumentError for a cancellation notice, without calling the model", async () => {
  // No skipIfNoOllama guard: cancellation detection happens on the raw text,
  // before any LLM call, so this test runs even without Ollama available.
  await assert.rejects(
    () => extractHotelDetails("test-data/hotel-emails/stay-9.txt"),
    (err) => {
      assert.ok(err instanceof NonReservationDocumentError);
      assert.equal(err.reason, "cancellation");
      assert.equal(err.sourceFile, "test-data/hotel-emails/stay-9.txt");
      assert.match(err.message, /cancellation notice/i);
      return true;
    }
  );
});
