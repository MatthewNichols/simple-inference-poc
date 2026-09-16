import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { extractTextFromImage } from "./ocr.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".bmp"]);
const TEXT_EXTENSIONS = new Set([".txt", ".eml"]);

// Single source of truth for the two source types a document can resolve
// to - used both by the CLI's extension-based detection below and by the
// API, which takes this as an explicit request field instead.
export const SOURCE_TYPES = ["email", "image"];

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
 * the wire rather than a path on the server's filesystem - the caller
 * states `sourceType` explicitly rather than it being inferred from a path.
 */
export async function loadSourceTextFromBuffer(sourceType, buffer) {
  if (!SOURCE_TYPES.includes(sourceType)) {
    throw new Error(`Invalid sourceType "${sourceType}". Expected one of ${SOURCE_TYPES.join(", ")}.`);
  }
  const sourceText =
    sourceType === "image" ? await extractTextFromImage(buffer) : buffer.toString("utf8");
  return { sourceType, sourceText };
}
