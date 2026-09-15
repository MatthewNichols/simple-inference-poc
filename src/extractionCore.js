import { generateJson, DEFAULT_MODEL } from "./ollamaClient.js";

/**
 * Shared "prompt the LLM, normalize, wrap in a payload" pipeline used by
 * every document-type extractor (flight, hotel, ...) once source text has
 * already been resolved - from a file on disk (CLI) or from an in-memory
 * buffer (API).
 */
export async function runExtraction({
  sourceType,
  sourceText,
  sourceFile,
  model = DEFAULT_MODEL,
  buildPrompt,
  schema,
  normalize,
}) {
  const raw = await generateJson({
    prompt: buildPrompt(sourceText),
    schema,
    model,
  });

  const normalized = normalize(raw);

  return {
    sourceType,
    sourceFile,
    ...normalized,
    modelUsed: model,
    extractedAt: new Date().toISOString(),
    rawTextExcerpt: sourceText.slice(0, 300),
  };
}
