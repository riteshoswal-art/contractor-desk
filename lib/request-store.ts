import type { ContractorSheet } from "./contractor-store";
import { SheetSetupError } from "./contractor-store";
import {
  REQUEST_HEADERS,
  buildRequestRow,
  type RequestValues,
} from "./request";
import type { RecordType } from "./registration";

const TAB = "Requests";

// Appends one validated request to the Requests tab, after checking that row 1
// matches the expected headers. Returns nothing: callers learn only whether it
// worked (an error is thrown if it did not).
export async function saveRequest(
  sheet: ContractorSheet,
  values: RequestValues,
  meta: { id: string; recordType: RecordType; nowIso: string },
): Promise<void> {
  const [headerRows] = await sheet.read([`${TAB}!1:1`]);
  const header = headerRows?.[0] ?? [];
  const headerOk =
    header.length === REQUEST_HEADERS.length &&
    REQUEST_HEADERS.every((h, i) => header[i] === h);
  if (!headerOk) throw new SheetSetupError("header mismatch");

  await sheet.append(`${TAB}!A1`, buildRequestRow(values, meta));
}
