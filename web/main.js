// Vanilla JS frontend for the extraction API. The only non-trivial piece is
// that it talks to the API exclusively through the generated OpenAPI client
// (../generated-client/) rather than hand-rolled fetch calls, so this file
// gets bundled (see scripts/build-web.js) rather than loaded as-is.
import { DefaultApi, Configuration, ResponseError } from "../generated-client/index";

const API_KEY_STORAGE_KEY = "simple-inference-poc:api-key";

const form = document.getElementById("extract-form");
const textGroup = document.getElementById("text-input-group");
const fileGroup = document.getElementById("file-input-group");
const textInput = document.getElementById("text-input");
const fileInput = document.getElementById("file-input");
const apiKeyInput = document.getElementById("api-key-input");
const modelInput = document.getElementById("model-input");
const submitBtn = document.getElementById("submit-btn");
const clearBtn = document.getElementById("clear-btn");
const statusEl = document.getElementById("status");
const resultSection = document.getElementById("result-section");
const formattedView = document.getElementById("formatted-view");
const rawView = document.getElementById("raw-view");

let lastResult = null;
let lastDocType = null;

initApiKeyField();
updateSourceModeVisibility();

for (const radio of form.elements["sourceMode"]) {
  radio.addEventListener("change", updateSourceModeVisibility);
}
for (const radio of document.getElementsByName("view")) {
  radio.addEventListener("change", renderCurrentView);
}
form.addEventListener("submit", handleSubmit);
clearBtn.addEventListener("click", handleClear);

function initApiKeyField() {
  let stored = null;
  try {
    stored = localStorage.getItem(API_KEY_STORAGE_KEY);
  } catch {
    // Private-browsing / disabled storage - just fall back to the default.
  }
  apiKeyInput.value = stored ?? "poc-dev-key";
  apiKeyInput.addEventListener("change", () => {
    try {
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKeyInput.value);
    } catch {
      // Nothing to do if storage isn't available - the field still works
      // for the current session.
    }
  });
}

function updateSourceModeVisibility() {
  const mode = form.elements["sourceMode"].value;
  textGroup.hidden = mode !== "email";
  fileGroup.hidden = mode !== "image";
}

async function handleSubmit(event) {
  event.preventDefault();

  const docType = form.elements["docType"].value;
  const sourceMode = form.elements["sourceMode"].value;

  let contentBase64;
  try {
    contentBase64 = await resolveContentBase64(sourceMode);
  } catch (err) {
    setStatus(err.message, "error");
    return;
  }

  const apiKey = apiKeyInput.value;
  const model = modelInput.value.trim();
  const api = new DefaultApi(
    new Configuration({
      basePath: window.location.origin,
      headers: { "x-api-key": apiKey },
    })
  );
  const extractionRequest = {
    sourceType: sourceMode,
    contentBase64,
    ...(model ? { model } : {}),
  };

  submitBtn.disabled = true;
  resultSection.hidden = true;
  setStatus("Extracting…", "loading");
  const startedAt = performance.now();

  try {
    const result =
      docType === "flight"
        ? await api.extractFlightDetails({ extractionRequest })
        : await api.extractHotelDetails({ extractionRequest });

    lastResult = result;
    lastDocType = docType;
    resultSection.hidden = false;
    renderCurrentView();
    setStatus(`Done. (${formatDuration(performance.now() - startedAt)})`, "success");
  } catch (err) {
    await handleError(err);
  } finally {
    submitBtn.disabled = false;
  }
}

// Resets everything except the saved API key, which is a sticky preference
// rather than per-run state - form.reset() would otherwise blank it since
// its value is set from localStorage in JS, not a markup default.
function handleClear() {
  const apiKey = apiKeyInput.value;
  form.reset();
  apiKeyInput.value = apiKey;
  updateSourceModeVisibility();

  lastResult = null;
  lastDocType = null;
  resultSection.hidden = true;
  formattedView.replaceChildren();
  rawView.textContent = "";
  setStatus("");
}

async function resolveContentBase64(sourceMode) {
  if (sourceMode === "email") {
    const text = textInput.value;
    if (!text.trim()) throw new Error("Paste some text first.");
    return utf8ToBase64(text);
  }
  const file = fileInput.files[0];
  if (!file) throw new Error("Choose an image first.");
  return fileToBase64(file);
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = /** @type {string} */ (reader.result);
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

async function handleError(err) {
  resultSection.hidden = true;
  lastResult = null;

  if (err instanceof ResponseError) {
    let body = null;
    try {
      body = await err.response.json();
    } catch {
      // Non-JSON error body - fall through to the generic message below.
    }
    const code = body?.error?.code;
    const message = body?.error?.message ?? err.message;
    const reason = body?.error?.reason;

    // A cancellation notice isn't a bug in the request, just a document
    // with nothing to extract - say so plainly rather than presenting it
    // as a failure.
    if (code === "NON_RESERVATION_DOCUMENT") {
      setStatus(`${message}${reason ? ` (reason: ${reason})` : ""}`, "warning");
      return;
    }
    if (err.response.status === 401) {
      setStatus(`${message} Check the API key above.`, "error");
      return;
    }
    setStatus(`${code ?? err.response.status}: ${message}`, "error");
    return;
  }

  setStatus(err.message ?? "Unexpected error.", "error");
}

function setStatus(message, kind) {
  statusEl.textContent = message ?? "";
  statusEl.className = kind ? `status status-${kind}` : "status";
}

function formatDuration(ms) {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function renderCurrentView() {
  if (!lastResult) return;
  const view = document.querySelector('input[name="view"]:checked').value;
  formattedView.hidden = view !== "formatted";
  rawView.hidden = view !== "raw";

  if (view === "formatted") {
    formattedView.replaceChildren(
      lastDocType === "flight" ? renderFlightResult(lastResult) : renderHotelResult(lastResult)
    );
  } else {
    rawView.textContent = JSON.stringify(lastResult, null, 2);
  }
}

function renderFlightResult(result) {
  const container = el("div", { className: "result-formatted" });
  container.append(fieldRow("Confirmation #", result.confirmationNumber), fieldRow("Passenger", result.passengerName));
  for (const flight of result.flights ?? []) {
    container.appendChild(
      el("div", { className: "leg-card" }, [
        el("div", { className: "leg-title", text: [flight.airline, flight.flightNumber].filter(Boolean).join(" ") || "Unknown flight" }),
        fieldRow("Route", `${flight.departureAirport ?? "?"} → ${flight.arrivalAirport ?? "?"}`),
        fieldRow("Departs", flight.departureDateTime),
        fieldRow("Arrives", flight.arrivalDateTime),
        fieldRow("Seat", flight.seat),
        fieldRow("Cabin", flight.cabinClass),
      ])
    );
  }
  container.appendChild(metaFooter(result));
  return container;
}

function renderHotelResult(result) {
  const container = el("div", { className: "result-formatted" });
  container.append(fieldRow("Confirmation #", result.confirmationNumber), fieldRow("Guest", result.guestName));
  for (const stay of result.stays ?? []) {
    container.appendChild(
      el("div", { className: "leg-card" }, [
        el("div", { className: "leg-title", text: stay.hotelName ?? "Unknown hotel" }),
        fieldRow("Address", stay.hotelAddress),
        fieldRow("Phone", stay.hotelPhone),
        fieldRow("Check-in", stay.checkInDate),
        fieldRow("Check-out", stay.checkOutDate),
        fieldRow("Room type", stay.roomType),
      ])
    );
  }
  container.appendChild(metaFooter(result));
  return container;
}

function metaFooter(result) {
  const details = el("details", { className: "raw-excerpt-details" }, [
    el("summary", { text: "Raw text excerpt" }),
    el("pre", { className: "raw-excerpt", text: result.rawTextExcerpt }),
  ]);
  return el("div", { className: "meta-footer" }, [
    fieldRow("Source type", result.sourceType),
    fieldRow("Model used", result.modelUsed),
    fieldRow("Extracted at", result.extractedAt),
    details,
  ]);
}

function fieldRow(label, value) {
  return el("div", { className: "field-row" }, [
    el("span", { className: "field-label", text: label }),
    el("span", { className: "field-value", text: value == null || value === "" ? "—" : String(value) }),
  ]);
}

// Builds a DOM node from a tag + props + children, using textContent for
// any interpolated value so extracted-document text (untrusted input, not
// authored by us) can never be parsed as markup.
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child == null) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}
