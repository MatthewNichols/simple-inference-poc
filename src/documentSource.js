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
 * Loads the raw text for a document from disk, running OCR first if it's an
 * image. Used by the CLI, which works against local file paths.
 */
export async function loadSourceText(filePath) {
  const sourceType = detectSourceType(filePath);
  const sourceText =
    sourceType === "image"
      ? await extractTextFromImage(filePath)
      : await readFile(filePath, "utf8");
  return { sourceType, sourceText };
}

/**
 * Loads the raw text for a document already held in memory, running OCR
 * first if it's an image. Used by the API, which receives file bytes over
 * the wire rather than a path on the server's filesystem - `fileName` is
 * only used to infer the source type from its extension, it is never read
 * from disk.
 */
export async function loadSourceTextFromBuffer(fileName, buffer) {
  const sourceType = detectSourceType(fileName);
  const sourceText =
    sourceType === "image" ? await extractTextFromImage(buffer) : buffer.toString("utf8");
  return { sourceType, sourceText };
}
