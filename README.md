# simple-inference-poc

Trying out some low power LLMs for simple parsing tasks.

This POC extracts structured flight details from flight-confirmation emails
(plain text) and screenshots of the same (images), using only CPU-friendly
tools:

- **OCR**: [tesseract.js](https://github.com/naptha/tesseract.js) turns
  images into raw text (no native Tesseract install required — it's WASM).
- **Extraction**: a small local LLM served by [Ollama](https://ollama.com)
  (default: `qwen2.5:1.5b`) turns raw text into a structured JSON payload,
  using Ollama's JSON-schema-constrained output so the model can't wander
  off-format.

## Data format

Every extraction returns one JSON object:

```json
{
  "sourceType": "email",
  "sourceFile": "test-data/emails/oneway-united.txt",
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
multi-city itineraries just produce more entries. Any field the model can't
find is `null` rather than guessed. See [src/schema.js](src/schema.js) for
the full field list and the JSON schema handed to the model.

## Project layout

```
src/
  schema.js               canonical output shape + JSON schema for the LLM
  ocr.js                  image -> raw text (tesseract.js)
  ollamaClient.js         talks to the local Ollama HTTP API
  extractFlightDetails.js orchestrates: detect type -> (OCR) -> LLM -> normalize
  cli.js                  `node src/cli.js <file>` -> prints the JSON payload
scripts/
  generate-sample-images.js  renders the sample "screenshot" PNGs below
test-data/
  emails/    sample flight-confirmation emails (plain text)
  images/    sample flight-confirmation screenshots (PNG, generated)
tests/
  schema.test.js               unit tests, no external services needed
  ocr.test.js                  runs real OCR against the sample images
  extractFlightDetails.test.js full pipeline against every sample, requires Ollama
```

## Manual setup

The Node dependencies (`npm install`) are enough for OCR and unit tests.
The end-to-end LLM tests and the CLI need a local Ollama server:

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

# Extract details from any sample:
npm run extract -- test-data/emails/oneway-united.txt
npm run extract -- test-data/images/boardingpass-southwest.png

# Regenerate the sample screenshot images (requires a TTF font on the
# system — see FONT_CANDIDATES in the script if none are found):
npm run generate-samples
```

### Configuration

Both read from the environment, with sensible defaults:

| Variable       | Default                   | Purpose                          |
| -------------- | -------------------------- | --------------------------------- |
| `OLLAMA_HOST`  | `http://127.0.0.1:11434`   | Ollama server URL                 |
| `OLLAMA_MODEL` | `qwen2.5:1.5b`             | Model used for extraction         |

Other CPU-friendly models worth trying: `llama3.2:1b`, `llama3.2:3b`,
`phi3.5:3.8b-mini-instruct-q4_0`, `gemma2:2b`. Pull with `ollama pull <name>`,
then run with `OLLAMA_MODEL=<name> npm run extract -- <file>`.
