import { extractFlightDetails } from "./extractFlightDetails.js";
import { extractHotelDetails, NonReservationDocumentError } from "./extractHotelDetails.js";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node src/cli.js <path-to-email.txt|path-to-image.png> <document-type> [model]");
  process.exit(1);
}
const documentTypeValue = process.argv[3];
const model = process.argv[4];
const documentType = documentTypeValue?.toLowerCase();

let extract;
switch (documentType) {
  case "flight":
    extract = extractFlightDetails;
    break;
  case "hotel":
    extract = extractHotelDetails;
    break;
  default:
    console.error(`Invalid document type "${documentTypeValue}". Expected "flight" or "hotel".`);
    process.exit(1);
}

try {
  const result = await extract(filePath, model ? { model } : {});
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(err.message);
  process.exit(err instanceof NonReservationDocumentError ? 2 : 1);
}
