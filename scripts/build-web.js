// Bundles web/main.js (vanilla JS, but importing the generated TypeScript
// client) into a single browser-loadable script at web/dist/bundle.js.
//
// A bundle step is needed only because ./generated-client/ is TypeScript -
// our own web/ code is plain JS. esbuild strips the types and inlines
// everything so the browser gets one dependency-free file, no <script
// type="module"> resolution of bare/TS specifiers required.
//
// ./generated-client/ is gitignored build output (see README.md "Generating
// a client library") - it won't exist on a fresh checkout until someone runs
// `npm run generate-client`. Fail fast with the same guidance the generated
// client's own tests give, rather than a raw esbuild "module not found".
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const clientEntryPath = path.join(projectRoot, "generated-client", "index.ts");

if (!existsSync(clientEntryPath)) {
  console.error(
    `No generated client at ${path.relative(process.cwd(), clientEntryPath)} - run ` +
      "`npm run generate-client` (or `npm run generate-client:npx`) first. See README.md " +
      '"Generating a client library".'
  );
  process.exit(1);
}

await esbuild.build({
  entryPoints: [path.join(projectRoot, "web", "main.js")],
  outfile: path.join(projectRoot, "web", "dist", "bundle.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  sourcemap: true,
  logLevel: "info",
});
