# simple-inference-poc

Trying out some low power LLMs for simple parsing tasks.

This POC extracts structured travel details from confirmation emails (plain
text) and screenshots of the same (images), using only CPU-friendly tools:

- **OCR**: [tesseract.js](https://github.com/naptha/tesseract.js) turns
  images into raw text (no native Tesseract install required — it's WASM).
- **Extraction**: a small local LLM served by [Ollama](https://ollama.com)
  (default: `qwen2.5:1.5b`) turns raw text into a structured JSON payload,
  using Ollama's JSON-schema-constrained output so the model can't wander
  off-format.

Two document types are supported today:

- **flight** — flight confirmation emails and boarding-pass/confirmation
  screenshots.
- **hotel** — hotel reservation emails (agency bookings, direct hotel
  confirmations, corporate travel-desk bookings, boutique/B&B bookings).
  Cancellation notices are detected and rejected rather than mis-extracted
  as a live reservation — see [Cancellation notices](#cancellation-notices).

It's exposed two ways: a **CLI** for local files, and a **stateless HTTP
API** for everything else (see [The API](#the-api)).

## Data format

Every extraction returns one JSON object. Shape depends on document type.

**Flight:**

```json
{
  "sourceType": "email",
  "sourceFile": "test-data/flight-emails/oneway-united.txt",
  "confirmationNumber": "7XQK4P",
  "passengerName": "Matthew Nichols",
  "flights": [
    {
      "airline": "United Airlines",
      "flightNumber": "UA482",
      "departureAirport": "DEN",
      "arrivalAirport": "ORD",
      "departureDateTime": "2026-09-16T06:45:00",
      "arrivalDateTime": "2026-09-16T10:12:00",
      "seat": "14C",
      "cabinClass": "Economy"
    }
  ],
  "modelUsed": "qwen2.5:1.5b",
  "extractedAt": "2026-09-09T23:28:04.911Z",
  "rawTextExcerpt": "From: United Airlines <noreply@united.com>..."
}
```

`flights` is always an array, even for a one-way trip — round-trip and
multi-city itineraries just produce more entries. See
[src/schemas/flight-schema.js](src/schemas/flight-schema.js) for the full
field list and the JSON schema handed to the model.

**Hotel:**

```json
{
  "sourceType": "email",
  "sourceFile": "test-data/hotel-emails/stay-4.txt",
  "confirmationNumber": "ACME-DV8N-MTHP4",
  "guestName": "Lady Genevieve Ashworth, Sir Cedric Moonstone",
  "stays": [
    {
      "hotelName": "Grandview Suites Charleston",
      "hotelAddress": "842 Harbor View Boulevard, Charleston, SC 29401",
      "hotelPhone": "+18435552947",
      "checkInDate": "2027-02-10",
      "checkOutDate": "2027-02-13",
      "roomType": "Deluxe King Suite"
    }
  ],
  "modelUsed": "qwen2.5:1.5b",
  "extractedAt": "2026-09-15T21:57:35.995Z",
  "rawTextExcerpt": "------- Forwarded Message -------\nFrom: Acme Hotels..."
}
```

`stays` is always an array — a document describing a multi-property trip
just produces more entries. See
[src/schemas/hotel-schema.js](src/schemas/hotel-schema.js) for the full
field list and the JSON schema handed to the model.

Any field the model can't find is `null` rather than guessed, for both
document types.

### Cancellation notices

A hotel document that turns out to be a cancellation notice (not an active
reservation) is rejected rather than mis-extracted — there's no stay to
report, just a reference to one that no longer exists. This is detected on
the raw text before the LLM is even called:

- CLI: prints the explanation to stderr and exits with code `2` (a plain
  error exits `1`).
- API: responds `422` with `{"error": {"code": "NON_RESERVATION_DOCUMENT",
  "reason": "cancellation", "message": "..."}}`.

See [test-data/hotel-emails/stay-9.txt](test-data/hotel-emails/stay-9.txt)
for an example, and `NonReservationDocumentError` in
[src/extractHotelDetails.js](src/extractHotelDetails.js).

## Project layout

```
src/
  documentSource.js        resolve source text: from disk (CLI) or an in-memory buffer (API)
  extractionCore.js         shared "prompt -> LLM -> normalize -> envelope" pipeline
  extractFlightDetails.js   flight prompt + orchestration
  extractHotelDetails.js    hotel prompt + orchestration + cancellation detection
  ocr.js                    image/buffer -> raw text (tesseract.js)
  ollamaClient.js           talks to the local Ollama HTTP API
  cli.js                    `node src/cli.js <file> <flight|hotel> [model]` -> prints the JSON payload
  schemas/
    flight-schema.js        canonical flight output shape + JSON schema for the LLM
    hotel-schema.js          canonical hotel output shape + JSON schema for the LLM
  api/
    app.js                  stateless HTTP API (plain node:http, no framework)
    server.js                entry point: `npm run serve`
    openapi.js                OpenAPI 3.0 document served at GET /openapi.json
scripts/
  generate-sample-images.js  renders the sample "screenshot" PNGs below
  generate-openapi-spec.js    writes the OpenAPI document to ./openapi.json (see The API)
  build-web.js                 bundles web/ into web/dist/bundle.js (see Web UI)
web/
  index.html                 browser console: pick flight/hotel, paste text or upload an image
  main.js                     drives the console via ./generated-client/ (see Web UI)
  dist/                        build output of `npm run build-web` - gitignored
test-data/
  flight-emails/    sample flight-confirmation emails (plain text)
  flight-images/    sample flight-confirmation screenshots (PNG, generated)
  hotel-emails/     sample hotel-reservation emails, incl. one cancellation notice
tests/
  flight-schema.test.js         unit tests, no external services needed
  ocr.test.js                    runs real OCR against the sample images
  extractFlightDetails.test.js   full flight pipeline against every sample, requires Ollama
  extractHotelDetails.test.js    full hotel pipeline against every sample, requires Ollama
  api.test.js                     HTTP layer: auth, validation, and live round-trips through the API
  generated-client.test.js        exercises ./generated-client/ if it exists; skips (doesn't fail) otherwise
bruno/
  runnable Bruno collection covering every endpoint - see Curl-and-Bruno.md
```

## Manual setup

The Node dependencies (`npm install`) are enough for OCR and unit tests.
The end-to-end LLM tests, the CLI, and the API all need a local Ollama
server:

### 1. Install Ollama

**Normal machine (has sudo):**

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

**Sandbox/CI without sudo:** Ollama also ships as a self-contained tarball
you can run from your home directory, no root required:

```bash
mkdir -p ~/.local/ollama-poc && cd ~/.local/ollama-poc
curl -fsSL -o ollama.tar.zst \
  https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64.tar.zst
tar --use-compress-program=unzstd -xf ollama.tar.zst   # requires zstd
export PATH="$HOME/.local/ollama-poc/bin:$PATH"
export LD_LIBRARY_PATH="$HOME/.local/ollama-poc/lib/ollama:$LD_LIBRARY_PATH"
```

Add the two `export` lines to your shell profile if you want this to persist.

### 2. Start the server

```bash
ollama serve &
```

(`brew services start ollama` / the desktop app do this automatically on
Mac; skip this step if you installed the desktop app or a systemd service.)

### 3. Pull the model

```bash
ollama pull qwen2.5:1.5b
```

This downloads ~1GB and only needs to happen once. To use a different
model, pull it and pass `OLLAMA_MODEL=<name>` (see below).

### 4. Verify

```bash
curl http://127.0.0.1:11434/api/tags   # should list qwen2.5:1.5b
```

## Running it

```bash
npm install

# Run everything (unit tests always run; LLM tests skip with a clear
# message if Ollama isn't reachable):
npm test

# Extract details from any sample - <flight|hotel> is required:
npm run extract -- test-data/flight-emails/oneway-united.txt flight
npm run extract -- test-data/flight-images/boardingpass-southwest.png flight
npm run extract -- test-data/hotel-emails/stay-4.txt hotel

# Regenerate the sample screenshot images (requires a TTF font on the
# system — see FONT_CANDIDATES in the script if none are found):
npm run generate-samples

# Start the HTTP API (see below):
npm run serve
```

### Configuration

All read from the environment, with sensible defaults:

| Variable       | Default                   | Purpose                          |
| -------------- | -------------------------- | --------------------------------- |
| `OLLAMA_HOST`  | `http://127.0.0.1:11434`   | Ollama server URL                 |
| `OLLAMA_MODEL` | `qwen2.5:1.5b`             | Model used for extraction         |
| `PORT`         | `3000`                     | API server port                   |
| `API_KEY`      | `poc-dev-key`               | API shared secret (see below)     |

Other CPU-friendly models worth trying: `llama3.2:1b`, `llama3.2:3b`,
`phi3.5:3.8b-mini-instruct-q4_0`, `gemma2:2b`, `qwen2.5:3b`. Pull with
`ollama pull <name>`, then run with `OLLAMA_MODEL=<name> npm run extract --
<file> <flight|hotel>`. Bigger models tend to follow subtler prompt
instructions more reliably but run noticeably slower on CPU — see the
model-selection notes in git history for a concrete before/after.

## The API

`src/api/` exposes the same extraction logic as a **stateless** HTTP
service: every request carries its own document bytes, nothing is written
to disk or kept between requests. There's no session, no upload step, no
server-side file storage.

```bash
npm run serve
# Simple Inference POC API listening on http://localhost:3000
# OpenAPI metadata: http://localhost:3000/openapi.json
```

### Auth

A single shared-secret header, `x-api-key`, checked against the `API_KEY`
env var (default `poc-dev-key`, with a startup warning if you haven't set
one). This is intentionally trivial — fine for a POC, not for anything else.

### Endpoints

| Method | Path                    | Auth | Purpose                                    |
| ------ | ------------------------ | ---- | ------------------------------------------- |
| GET    | `/healthz`               | no   | Liveness check                             |
| GET    | `/openapi.json`          | no   | OpenAPI 3.0 document (see below)           |
| POST   | `/v1/extract/flight`     | yes  | Extract flight details                     |
| POST   | `/v1/extract/hotel`      | yes  | Extract hotel-stay details                 |

### Request

Both extraction endpoints take the same JSON body:

```json
{
  "sourceType": "email",
  "contentBase64": "<base64-encoded document bytes>",
  "model": "qwen2.5:1.5b"
}
```

- `sourceType`: `"email"` for plain text, `"image"` to run OCR first. Stated
  explicitly by the caller — not inferred from a filename, since the server
  never sees or needs one.
- `contentBase64`: the raw bytes of the document (a text file or an image),
  base64-encoded.
- `model`: optional; overrides `OLLAMA_MODEL` for this request.

The response is the same JSON payload documented in
[Data format](#data-format) above, with `sourceFile` always `null` (there is
no server-side file — the CLI populates that field with a real path when
run locally).

### Example

```bash
curl -X POST http://localhost:3000/v1/extract/hotel \
  -H "Content-Type: application/json" \
  -H "x-api-key: poc-dev-key" \
  -d "{\"sourceType\":\"email\",\"contentBase64\":\"$(base64 -w0 test-data/hotel-emails/stay-4.txt)\"}"
```

For every endpoint and several error cases (auth, validation, the
cancellation 422) as both curl commands and a runnable
[Bruno](https://docs.usebruno.com/) collection, see
[Curl-and-Bruno.md](Curl-and-Bruno.md).

### Errors

Every error response has the shape `{"error": {"code": "...", "message":
"...", "reason": "..."}}` (`reason` only present for
`NON_RESERVATION_DOCUMENT`):

| Status | Code                       | When                                                    |
| ------ | -------------------------- | -------------------------------------------------------- |
| 400    | `BAD_REQUEST`              | Missing/invalid fields, bad base64, unrecognized `sourceType` |
| 401    | `UNAUTHORIZED`             | Missing or wrong `x-api-key`                              |
| 404    | `NOT_FOUND`                | No route for that method/path                             |
| 422    | `NON_RESERVATION_DOCUMENT` | Hotel document is a cancellation notice, not a booking     |
| 500    | `INTERNAL_ERROR`           | Unexpected failure (e.g. Ollama unreachable)               |

### Web UI

A small browser console at `web/` lets you pick flight/hotel, paste text or
upload an image, and see results as either formatted fields or raw JSON. It
calls the API exclusively through the generated client (below), not
hand-rolled `fetch` calls - proof the client works in a browser, not just
Node.

Since `./generated-client/` is TypeScript and gitignored build output, the
page needs a bundling step:

```bash
npm run generate-client   # or generate-client:npx - see below
npm run build-web         # -> web/dist/bundle.js (esbuild, also gitignored)
npm run serve
# open http://localhost:3000/
```

`npm run serve` serves `web/index.html` and `web/dist/bundle.js` itself
(`GET /` and `GET /bundle.js`) alongside the API - no separate dev server,
and no CORS to configure since the page and the API share an origin. If you
edit anything under `web/`, rerun `npm run build-web` to pick it up.

The API key field defaults to `poc-dev-key` and is saved to
`localStorage` for convenience; it's never sent anywhere but the
`x-api-key` header on your own requests.

### Generating a client library

`GET /openapi.json` serves a full OpenAPI 3.0 document — request/response
schemas, the auth scheme, error shapes — built directly from the same JSON
schemas the extractors validate against, so it can't drift from actual
behavior. Feed it to a generator to produce a typed client in most
languages.

The spec is static (built in-process from `src/schemas/`), so generating a
client doesn't need the API server running — `npm run generate-openapi-spec`
writes it to `./openapi.json` first, then a generator runs against that file.

**Docker (recommended — no Java to install):**

```bash
npm run generate-client   # -> ./generated-client (TypeScript fetch client)
```

Runs the [official `openapitools/openapi-generator-cli` image](https://hub.docker.com/r/openapitools/openapi-generator-cli/)
as your own user (`--user "$(id -u):$(id -g)"`), so output isn't root-owned.
If you're on a remote/sandboxed Docker daemon (a devcontainer, a Docker
context that isn't your local machine, snap-confined Docker, CI-in-CI), the
`-v` bind mount may silently show the container an empty directory instead
of erroring — if generation succeeds but `./generated-client/` wasn't
created, that's the likely cause; use the npx fallback below instead.

**npx + local Java (fallback):**

```bash
npm run generate-client:npx
```

This shells out to a JVM for the actual code generation, so a **Java
runtime** must be on `PATH` — see
[openapi-generator's requirements](https://github.com/OpenAPITools/openapi-generator#3---versions).

Both scripts default to a TypeScript fetch client; see the `generate-client`
/ `generate-client:npx` scripts in [package.json](package.json) to target a
different generator, e.g. `-g python` or `-g go`. `./openapi.json` and
`./generated-client/` are both gitignored — they're build output, not source.

**Testing the generated client:** [tests/generated-client.test.js](tests/generated-client.test.js)
actually exercises `./generated-client/` against a live in-process server
(both the 422 cancellation path and, if Ollama is available, a full
extraction) - proof the OpenAPI document produces a *working* client, not
just a well-formed one. If you haven't run `npm run generate-client` yet,
these tests skip themselves with a message telling you to, rather than
failing `npm test` on a fresh checkout. The generated client's `runtime.ts`
uses TypeScript parameter properties, which Node's native type-stripping
can't handle (only erasure, not real transformation) — the test loads it
via [tsx](https://github.com/privatenumber/tsx) (a devDependency) instead.
