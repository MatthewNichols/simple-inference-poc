import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTextFromImage } from "../src/ocr.js";

test("extracts key details from the Southwest boarding pass image", async () => {
  const text = await extractTextFromImage("test-data/images/boardingpass-southwest.png");
  assert.match(text, /SOUTHWEST/i);
  assert.match(text, /N4T7QX/);
  assert.match(text, /WN ?2456/);
  assert.match(text, /DEN/);
  assert.match(text, /MDW/);
});

test("extracts key details from the JetBlue confirmation screenshot", async () => {
  const text = await extractTextFromImage(
    "test-data/images/confirmation-screenshot-jetblue.png"
  );
  assert.match(text, /JetBlue/i);
  assert.match(text, /QP8LMX/);
  assert.match(text, /BOS/);
  assert.match(text, /MCO/);
});
