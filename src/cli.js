import { extractFlightDetails } from "./extractFlightDetails.js";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node src/cli.js <path-to-email.txt|path-to-image.png> [model]");
  process.exit(1);
}
const model = process.argv[3];

try {
  const result = await extractFlightDetails(filePath, model ? { model } : {});
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
