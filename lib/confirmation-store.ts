// Server-only logic for the Confirmations tab. It takes the Sheet as an
// argument so it can be tested without Google. It stores IDs, a status, a date
// and a short note: never names, phone numbers or message text.
import type { ContractorSheet } from "./contractor-store";
import {
  CONFIRMATION_TABLE,
  buildConfirmationRow,
  parseConfirmationRow,
  validateConfirmation,
  type Confirmation,
  type ConfirmationErrors,
  type ConfirmationSource,
} from "./confirmation";
import { matchContractors, type Candidate, type RequestRecord } from "./match";
import { loadContractors, loadRequests } from "./records";
import type { RecordType } from "./registration";
import { appendTableRow, readTable } from "./tables";

export const ID_PATTERNS = {
  request: /^R-[A-Z2-9]{8}$/,
  contractor: /^C-[A-Z2-9]{8}$/,
};

export async function loadConfirmations(
  sheet: ContractorSheet,
  recordType: RecordType,
): Promise<Confirmation[]> {
  const rows = await readTable(sheet, CONFIRMATION_TABLE);
  return rows.flatMap((r) => {
    const c = parseConfirmationRow(r);
    return c && c.recordType === recordType ? [c] : [];
  });
}

// The request, and the contractor only if they are one of the CURRENT potential
// matches for it. A confirmation can therefore never be used to rescue a trade
// or locality mismatch, or to attach a status to a contractor who is not on
// the list for this job.
export async function findRequestAndCandidate(
  sheet: ContractorSheet,
  requestId: string,
  contractorId: string,
  recordType: RecordType,
  now?: Date,
): Promise<{ request: RequestRecord; candidate: Candidate } | null> {
  if (!ID_PATTERNS.request.test(requestId) || !ID_PATTERNS.contractor.test(contractorId)) {
    return null;
  }
  const request = (await loadRequests(sheet)).find(
    (r) => r.id === requestId && r.recordType === recordType,
  );
  if (!request) return null;
  const result = matchContractors(request, await loadContractors(sheet), {
    envType: recordType,
    now,
    max: Number.MAX_SAFE_INTEGER, // every eligible contractor, not only the top five
  });
  const candidate = result.candidates.find((c) => c.contractorId === contractorId);
  return candidate ? { request, candidate } : null;
}

export type RecordConfirmationResult =
  | { ok: true; status: Confirmation["status"]; confirmedStartDate: string }
  | { ok: false; error: "invalid" | "not_found" }
  | { ok: false; error: "validation"; errors: ConfirmationErrors };

// Appends one confirmation event. Earlier events are never changed or removed.
export async function recordConfirmation(
  sheet: ContractorSheet,
  args: {
    requestId: string;
    contractorId: string;
    status: string;
    confirmedStartDate: string;
    note: string;
  },
  env: {
    recordType: RecordType;
    source: ConfirmationSource;
    recordedBy: string;
    today: string; // India date, from the server
    now?: Date;
  },
  newId: () => string,
): Promise<RecordConfirmationResult> {
  if (
    typeof args.requestId !== "string" ||
    typeof args.contractorId !== "string" ||
    typeof args.status !== "string" ||
    typeof args.confirmedStartDate !== "string" ||
    typeof args.note !== "string" ||
    args.status.length > 60 ||
    args.confirmedStartDate.length > 20 ||
    args.note.length > 1000
  ) {
    return { ok: false, error: "invalid" };
  }
  const found = await findRequestAndCandidate(
    sheet,
    args.requestId,
    args.contractorId,
    env.recordType,
    env.now,
  );
  if (!found) return { ok: false, error: "not_found" };

  const verdict = validateConfirmation(
    { status: args.status, confirmedStartDate: args.confirmedStartDate, note: args.note },
    found.request,
    env.today,
  );
  if (!verdict.ok) return { ok: false, error: "validation", errors: verdict.errors };

  await appendTableRow(
    sheet,
    CONFIRMATION_TABLE,
    buildConfirmationRow(verdict.value, {
      id: newId(),
      recordType: env.recordType,
      requestId: args.requestId,
      contractorId: args.contractorId,
      source: env.source,
      recordedBy: env.recordedBy,
      recordedAt: (env.now ?? new Date()).toISOString(),
    }),
  );
  return {
    ok: true,
    status: verdict.value.status,
    confirmedStartDate: verdict.value.confirmedStartDate,
  };
}
