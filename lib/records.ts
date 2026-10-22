// Server-only: reads contractors and requests back from the Sheet for the admin
// pages. Phone-number columns are never requested from Google, so they cannot
// leak into matching, pages or logs. Contact details will be fetched
// separately, by the human-reviewed contact step, when that exists.
import { SheetSetupError, type ContractorSheet } from "./contractor-store";
import { splitAreas, type ContractorRecord, type RequestRecord } from "./match";
import { CONTRACTOR_HEADERS } from "./registration";
import { REQUEST_HEADERS } from "./request";

function letter(index: number): string {
  return String.fromCharCode("A".charCodeAt(0) + index); // fewer than 26 columns
}

// Reads a whole tab except the one `skip` column. Returns one object per data
// row, keyed by header name, with the skipped column absent.
async function readTableWithout(
  sheet: ContractorSheet,
  tab: string,
  headers: readonly string[],
  skip: string,
): Promise<Record<string, string>[]> {
  const skipIndex = headers.indexOf(skip);
  const last = headers.length - 1;
  const ranges = [
    `${tab}!A1:${letter(skipIndex - 1)}`,
    `${tab}!${letter(skipIndex)}1:${letter(skipIndex)}1`,
    `${tab}!${letter(skipIndex + 1)}1:${letter(last)}`,
  ];
  const [left = [], skipHeader = [], right = []] = await sheet.read(ranges);

  const headerRow = [...(left[0] ?? []), ...(skipHeader[0] ?? []), ...(right[0] ?? [])];
  const ok =
    headerRow.length === headers.length &&
    headers.every((h, i) => headerRow[i] === h);
  if (!ok) throw new SheetSetupError("header mismatch");

  // Google omits trailing blank cells, so pad each side to its full width.
  const pad = (cells: string[] | undefined, width: number) =>
    [...(cells ?? []), ...Array<string>(width).fill("")].slice(0, width);
  const kept = headers.filter((h) => h !== skip);

  const rowCount = Math.max(left.length, right.length);
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < rowCount; r++) {
    const cells = [...pad(left[r], skipIndex), ...pad(right[r], last - skipIndex)];
    const obj: Record<string, string> = {};
    kept.forEach((header, i) => {
      obj[header] = cells[i];
    });
    if (obj[headers[0]]) rows.push(obj); // ignore blank rows
  }
  return rows;
}

export async function loadContractors(
  sheet: ContractorSheet,
): Promise<ContractorRecord[]> {
  const rows = await readTableWithout(sheet, "Contractors", CONTRACTOR_HEADERS, "phone");
  return rows.map((r) => ({
    id: r.contractor_id,
    recordType: r.record_type,
    name: r.name,
    trade: r.primary_trade,
    serviceAreas: splitAreas(r.service_areas),
    availability: r.availability_status,
    earliestStart: r.earliest_start_date,
    consentVersion: r.consent_version,
    consentTimestamp: r.consent_timestamp,
    availabilityReportedAt: r.availability_reported_at,
    lastConfirmedAt: r.last_availability_confirmed_at,
    deletionRequestedAt: r.deletion_requested_at,
  }));
}

// Fetches ONE contractor's phone number, for the human-reviewed contact step
// only. It reads just the ID and phone columns and returns nothing but the
// number ("" if the contractor or number is missing).
export async function loadContractorPhone(
  sheet: ContractorSheet,
  contractorId: string,
): Promise<string> {
  const idCol = letter(CONTRACTOR_HEADERS.indexOf("contractor_id"));
  const phoneCol = letter(CONTRACTOR_HEADERS.indexOf("phone"));
  const [ids = [], phones = []] = await sheet.read([
    `Contractors!${idCol}1:${idCol}`,
    `Contractors!${phoneCol}1:${phoneCol}`,
  ]);
  if (
    ids[0]?.[0] !== "contractor_id" ||
    phones[0]?.[0] !== "phone"
  ) {
    throw new SheetSetupError("header mismatch");
  }
  const index = ids.findIndex((row, i) => i > 0 && row[0] === contractorId);
  return index > 0 ? (phones[index]?.[0] ?? "") : "";
}

export async function loadRequests(sheet: ContractorSheet): Promise<RequestRecord[]> {
  const rows = await readTableWithout(sheet, "Requests", REQUEST_HEADERS, "contact_phone");
  return rows.map((r) => {
    const days = Number(r.duration_days);
    return {
      id: r.request_id,
      recordType: r.record_type,
      createdAt: r.created_at,
      developerName: r.developer_name,
      description: r.description,
      trade: r.trade,
      area: r.service_area,
      startDate: r.start_date,
      durationDays: Number.isInteger(days) && days > 0 ? days : null,
      notes: r.notes,
      status: r.status,
    };
  });
}
