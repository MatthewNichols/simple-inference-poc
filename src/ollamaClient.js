const DEFAULT_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:1.5b";

/** True if an Ollama server is reachable at `host`. Used to skip integration tests gracefully. */
export async function isOllamaAvailable(host = DEFAULT_HOST) {
  try {
    const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Sends a prompt to a local Ollama model and returns the parsed JSON response.
 * Uses Ollama's `format` option (JSON schema) to constrain output, which is
 * what makes small CPU models like qwen2.5:1.5b reliable for extraction.
 */
export async function generateJson({
  prompt,
  schema,
  model = DEFAULT_MODEL,
  host = DEFAULT_HOST,
} = {}) {
  const res = await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      format: schema,
      stream: false,
      options: { temperature: 0 },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Ollama request failed (${res.status}): ${body || res.statusText}. ` +
        `Is Ollama running and has \`ollama pull ${model}\` been run? See README.md.`
    );
  }

  const data = await res.json();
  try {
    return JSON.parse(data.response);
  } catch (err) {
    throw new Error(
      `Model returned non-JSON output, even with a JSON schema constraint: ${data.response}`
    );
  }
}

export { DEFAULT_HOST, DEFAULT_MODEL };
