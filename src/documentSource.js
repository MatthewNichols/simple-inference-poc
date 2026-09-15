import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { extractTextFromImage } from "./ocr.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);
const TEXT_EXTENSIONS = new Set([".txt", ".eml"]);

export function detectSourceType(filePath) {
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

/**
 * Loads the raw text for a document, running OCR first if it's an image.
 * Shared by every document-type extractor (flight, hotel, ...).
 */
export async function loadSourceText(filePath) {
  const sourceType = detectSourceType(filePath);
  const sourceText =
    sourceType === "image"
      ? await extractTextFromImage(filePath)
      : await readFile(filePath, "utf8");
  return { sourceType, sourceText };
}
