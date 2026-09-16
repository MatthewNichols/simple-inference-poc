# Exercising the API: curl & Bruno

Two ways to poke at the [HTTP API](README.md#the-api) by hand: raw `curl`,
or the [Bruno](https://docs.usebruno.com/) collection checked into
[`bruno/`](bruno/). Both assume the server is running:

```bash
npm run serve
# Simple Inference POC API listening on http://localhost:3000
```

`GET /healthz` and `GET /openapi.json` work immediately. The two
`POST /v1/extract/*` endpoints need a local Ollama server too, for anything
other than the hotel cancellation-notice case (which is rejected before the
LLM is ever called) — see [README.md "Manual setup"](README.md#manual-setup).

## Via curl

**Health check** (no auth):

```bash
curl http://localhost:3000/healthz
# {"status":"ok"}
```

**OpenAPI metadata** (no auth):

```bash
curl http://localhost:3000/openapi.json
```

**Extract flight details from an email:**

```bash
curl -X POST http://localhost:3000/v1/extract/flight \
  -H "Content-Type: application/json" \
  -H "x-api-key: poc-dev-key" \
  -d "{\"sourceType\":\"email\",\"contentBase64\":\"$(base64 -w0 test-data/flight-emails/oneway-united.txt)\"}"
```

```json
{"sourceType":"email","sourceFile":null,"confirmationNumber":"7XQK4P","passengerName":"Matthew Nichols","flights":[{"airline":"United Airlines","flightNumber":"UA482","departureAirport":"DEN","arrivalAirport":"ORD","departureDateTime":"2026-09-16T06:45:00","arrivalDateTime":"2026-09-16T10:12:00","seat":"14C","cabinClass":"Economy"}],"modelUsed":"qwen2.5:1.5b","extractedAt":"2026-09-16T03:34:48.435Z","rawTextExcerpt":"From: United Airlines <noreply@united.com>..."}
```

**Extract flight details from an image** (same shape, `sourceType: "image"` runs OCR first):

```bash
curl -X POST http://localhost:3000/v1/extract/flight \
  -H "Content-Type: application/json" \
  -H "x-api-key: poc-dev-key" \
  -d "{\"sourceType\":\"image\",\"contentBase64\":\"$(base64 -w0 test-data/flight-images/boardingpass-southwest.png)\"}"
```

**Extract hotel-stay details:**

```bash
curl -X POST http://localhost:3000/v1/extract/hotel \
  -H "Content-Type: application/json" \
  -H "x-api-key: poc-dev-key" \
  -d "{\"sourceType\":\"email\",\"contentBase64\":\"$(base64 -w0 test-data/hotel-emails/stay-4.txt)\"}"
```

**Cancellation notice → 422, no Ollama needed** (see
[README.md "Cancellation notices"](README.md#cancellation-notices)):

```bash
curl -i -X POST http://localhost:3000/v1/extract/hotel \
  -H "Content-Type: application/json" \
  -H "x-api-key: poc-dev-key" \
  -d "{\"sourceType\":\"email\",\"contentBase64\":\"$(base64 -w0 test-data/hotel-emails/stay-9.txt)\"}"
```

```json
{"error":{"code":"NON_RESERVATION_DOCUMENT","message":"This document looks like a cancellation notice, not an active reservation - there is no stay to extract. If you have the original booking confirmation, run extraction against that instead.","reason":"cancellation"}}
```

**Missing API key → 401:**

```bash
curl -i -X POST http://localhost:3000/v1/extract/flight \
  -H "Content-Type: application/json" \
  -d '{"sourceType":"email","contentBase64":"aGVsbG8="}'
```

```json
{"error":{"code":"UNAUTHORIZED","message":"Missing or invalid x-api-key header."}}
```

**Overriding the model** for a single request - add `"model": "qwen2.5:3b"`
(or any model you've `ollama pull`ed) to the JSON body alongside `sourceType`
and `contentBase64`.

## Via Bruno

The [`bruno/`](bruno/) folder is a full Bruno collection covering every
endpoint and several error cases (missing API key, invalid `sourceType`,
the cancellation 422). It's checked into git — nothing to generate.

### Desktop app

Open Bruno → **Open Collection** → select the `bruno/` folder. The
**Local** environment (`baseUrl: http://localhost:3000`, `apiKey:
poc-dev-key`) is selected automatically on open, via `presets.defaultEnvironment`
in [`bruno/bruno.json`](bruno/bruno.json). Pointing at a different host,
port, or API key just means editing (or duplicating) `environments/Local.bru`.

### CLI

Requires the Bruno CLI (`npm install -g @usebruno/cli`, or use `npx` as
below). Run from *inside* `bruno/` — the CLI expects to be invoked at a
collection's root, not given the collection as a path argument.

```bash
cd bruno

# Everything, recursively (-r):
npx @usebruno/cli run -r
# "Using default environment: Local" - no --env flag needed, same preset
# the desktop app uses.

# Just one folder:
npx @usebruno/cli run flight -r

# Just one request:
npx @usebruno/cli run hotel/02-extract-hotel-cancellation.bru
```

The three "expected error" requests (`hotel/02-extract-hotel-cancellation.bru`,
`auth-errors/01-missing-api-key.bru`, `auth-errors/02-invalid-source-type.bru`)
carry `tests {}` blocks asserting their exact status and error code, so a
non-2xx response there is a pass, not a failure, in both the CLI output and
the desktop app's UI.

This is a manual/exploratory complement to the automated suite - for CI-grade
verification of the API itself, see `tests/api.test.js`, and for exercising
the *generated* TypeScript client specifically, see
`tests/generated-client.test.js` (both covered in
[README.md "Project layout"](README.md#project-layout)).
