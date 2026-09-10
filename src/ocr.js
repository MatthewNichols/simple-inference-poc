import { createWorker } from "tesseract.js";

/**
 * Runs OCR on an image file and returns the raw extracted text.
 * tesseract.js bundles its own WASM engine, so no native Tesseract install
 * is required - only a one-time download of language data on first run
 * (cached under node_modules/tesseract.js-core or the OS cache dir).
 */
export async function extractTextFromImage(imagePath) {
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(imagePath);
    return text;
  } finally {
    await worker.terminate();
  }
}
