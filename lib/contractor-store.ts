import {
  CONTRACTOR_HEADERS,
  buildContractorRow,
  normalizePhone,
  type FormValues,
  type RecordType,
} from "./registration";

// A tiny interface over the Google Sheet so the logic below can be tested
// without calling Google. The real implementation is in google-sheets.ts.
export interface ContractorSheet {
  // Returns the rows found in each requested range (blank cells are omitted).
  read(ranges: string[]): Promise<string[][][]>;
  append(range: string, row: string[]): Promise<void>;
  // Overwrites exactly one existing row, e.g. "Outcomes!A5:O5".
  update(range: string, row: string[]): Promise<void>;
}

// The Sheet's first row does not match what the code expects.
export class SheetSetupError extends Error {}

const TAB = "Contractors";

function columnLetter(header: (typeof CONTRACTOR_HEADERS)[number]): string {
  const index = CONTRACTOR_HEADERS.indexOf(header);
  return String.fromCharCode("A".charCodeAt(0) + index); // fewer than 26 columns
}

// Saves a validated registration unless the same phone number is already on
// file for the same record type (a TEST row never blocks a REAL one).
// Returns only a status, never any stored data.
export async function saveContractor(
  sheet: ContractorSheet,
  values: FormValues,
  meta: { id: string; recordType: RecordType; nowIso: string },
): Promise<"saved" | "duplicate"> {
  const typeCol = columnLetter("record_type");
  const phoneCol = columnLetter("phone");

  const [headerRows, typeRows, phoneRows] = await sheet.read([
    `${TAB}!1:1`,
    `${TAB}!${typeCol}2:${typeCol}`,
    `${TAB}!${phoneCol}2:${phoneCol}`,
  ]);

  const header = headerRows[0] ?? [];
  const headerOk =
    header.length === CONTRACTOR_HEADERS.length &&
    CONTRACTOR_HEADERS.every((h, i) => header[i] === h);
  if (!headerOk) throw new SheetSetupError("header mismatch");

  const phone = normalizePhone(values.phone);
  const isDuplicate = phoneRows.some(
    (row, i) =>
      row[0] === phone && (typeRows[i]?.[0] ?? "") === meta.recordType,
  );
  if (isDuplicate) return "duplicate";

  await sheet.append(`${TAB}!A1`, buildContractorRow(values, meta));
  return "saved";
}
