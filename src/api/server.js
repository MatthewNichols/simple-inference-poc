import { createApiServer } from "./app.js";

const PORT = Number(process.env.PORT ?? 3000);
const apiKey = process.env.API_KEY ?? "poc-dev-key";

const server = createApiServer({ apiKey });

server.listen(PORT, () => {
  console.log(`Simple Inference POC API listening on http://localhost:${PORT}`);
  console.log(`OpenAPI metadata: http://localhost:${PORT}/openapi.json`);
  if (!process.env.API_KEY) {
    console.warn(
      `No API_KEY set - using default dev key "${apiKey}". Trivial auth only, do not use beyond local dev.`
    );
  }
});
