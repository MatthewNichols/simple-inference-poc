// Writes the OpenAPI document to ./openapi.json so a client generator can
// run against a plain file - no running server, no container-to-host
// networking to configure. The document is static output built from the
// schemas in src/schemas/, so this needs no LLM/Ollama and no HTTP call.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { openapiDocument } from "../src/api/openapi.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "openapi.json");

await writeFile(outPath, `${JSON.stringify(openapiDocument, null, 2)}\n`);
console.log(`Wrote OpenAPI spec to ${outPath}`);
