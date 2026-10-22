// Synthetic fixtures for the newer features. Nothing here is real: names are
// made up and the phone numbers belong to nobody.
import { ACCEPTED_CONSENT_VERSIONS } from "../../lib/match.ts";
import { CONTRACTOR_HEADERS } from "../../lib/registration.ts";
import { REQUEST_HEADERS } from "../../lib/request.ts";
import { makeSheet } from "./fakes.mjs";

export const NOW = new Date("2026-10-21T10:00:00.000Z"); // 15:30 in India
export const TODAY = "2026-10-21";
export const V = ACCEPTED_CONSENT_VERSIONS[0];
export const REQ_ID = "R-BBBBBBBB";
export const REQ_START = "2026-10-26";
export const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();

const row = (headers, o) => headers.map((h) => o[h] ?? "");

export const contractorRow = (o = {}) =>
  row(CONTRACTOR_HEADERS, {
    contractor_id: "C-AAAAAAAA", record_type: "TEST", created_at: daysAgo(3), name: "Test Contractor",
    primary_trade: "Masonry", service_areas: "Baner", availability_status: "from_date",
    earliest_start_date: REQ_START, phone: "+919000000001", consent_version: V, consent_text: "consent",
    consent_timestamp: daysAgo(3), availability_reported_at: daysAgo(2), ...o,
  });

export const requestRow = (o = {}) =>
  row(REQUEST_HEADERS, {
    request_id: REQ_ID, record_type: "TEST", created_at: daysAgo(0), developer_name: "TEST Developer (fictional)",
    contact_phone: "+919000000002", description: "TEST ONLY: fictional masonry job in Baner.", trade: "Masonry",
    service_area: "Baner", start_date: REQ_START, duration_days: "7", notes: "", extraction_source: "manual",
    status: "New requirement", ...o,
  });

// A pretend Sheet holding one request and several contractors, plus the new tabs.
export function makeWorld({ contractors = [contractorRow()], requests = [requestRow()], tables = [] } = {}) {
  return makeSheet({ contractors, requests, tables });
}

// Contractor ids that satisfy /^C-[A-Z2-9]{8}$/
export const CID = (n) => `C-${String(n).repeat(8)}`; // C-22222222 ... C-99999999
export const counter = (prefix) => {
  let i = 0;
  return () => `${prefix}-${String(++i).padStart(8, "2").replace(/[01]/g, "2")}`;
};
