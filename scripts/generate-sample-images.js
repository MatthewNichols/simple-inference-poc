// One-off dev script: renders sample flight-confirmation "screenshots" as
// PNGs into test-data/images/, so the harness has image fixtures to OCR
// without needing real screenshots. Not part of the runtime harness.
import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as pureimage from "pureimage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "test-data", "images");

const FONT_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "C:\\Windows\\Fonts\\arial.ttf",
];
const fontPath = FONT_CANDIDATES.find((p) => existsSync(p));
if (!fontPath) {
  console.error(
    "No usable TTF font found. Edit FONT_CANDIDATES in this script to point at a font on your system."
  );
  process.exit(1);
}

const font = pureimage.registerFont(fontPath, "sans");
await font.load();

const SAMPLES = [
  {
    file: "boardingpass-southwest.png",
    lines: [
      "SOUTHWEST AIRLINES - BOARDING PASS",
      "",
      "PASSENGER: NICHOLS/MATTHEW",
      "CONFIRMATION: N4T7QX",
      "",
      "FLIGHT: WN 2456",
      "FROM: DEN  Denver",
      "TO:   MDW  Chicago Midway",
      "",
      "DATE: 12 DEC 2026",
      "DEPART: 11:20 AM   ARRIVE: 1:55 PM",
      "",
      "SEAT: 17C   GROUP: B   CLASS: Economy",
    ],
  },
  {
    file: "confirmation-screenshot-jetblue.png",
    lines: [
      "JetBlue Trip Confirmation",
      "",
      "Confirmation code: QP8LMX",
      "Traveler: Matthew Nichols",
      "",
      "JetBlue B6 745",
      "Boston (BOS) to Orlando (MCO)",
      "Saturday, January 17, 2027",
      "",
      "Departs 7:40 AM",
      "Arrives 10:58 AM",
      "",
      "Seat 6A  |  Cabin: Even More Space",
    ],
  },
];

await mkdir(outDir, { recursive: true });

for (const sample of SAMPLES) {
  const width = 700;
  const height = 60 + sample.lines.length * 34;
  const img = pureimage.make(width, height);
  const ctx = img.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#000000";
  ctx.font = "24pt sans";

  let y = 45;
  for (const line of sample.lines) {
    ctx.fillText(line, 30, y);
    y += 34;
  }

  const outPath = path.join(outDir, sample.file);
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(outPath);
    pureimage.encodePNGToStream(img, stream).then(resolve).catch(reject);
  });
  console.log(`Wrote ${outPath}`);
}
