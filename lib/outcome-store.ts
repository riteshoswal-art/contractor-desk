// Server-only logic for the Outcomes tab. It takes the Sheet as an argument so
// it can be tested without Google. It stores IDs and recorded facts only: never
// names, phone numbers or message text.
import { SheetSetupError, type ContractorSheet } from "./contractor-store";
import {
  OUTCOME_HEADERS,
  buildOutcomeRow,
  parseOutcomeInput,
  parseOutcomeRow,
  toIstLocal,
  validateOutcome,
  type OutcomeErrors,
  type OutcomeInput,
  type OutcomeRecord,
} from "./outcome";
import { loadContractors, loadRequests } from "./records";
import type { RecordType } from "./registration";

const TAB = "Outcomes";
const LAST_COLUMN = String.fromCharCode("A".charCodeAt(0) + OUTCOME_HEADERS.length - 1);

export const OUTCOME_ID_PATTERNS = {
  request: /^R-[A-Z2-9]{8}$/,
  contractor: /^C-[A-Z2-9]{8}$/,
};

// Reads the whole tab as raw rows after checking the header row.
async function readRows(sheet: ContractorSheet): Promise<Record<string, string>[]> {
  const [grid = []] = await sheet.read([`${TAB}!A1:${LAST_COLUMN}`]);
  const header = grid[0] ?? [];
  const ok =
    header.length === OUTCOME_HEADERS.length &&
    OUTCOME_HEADERS.every((h, i) => header[i] === h);
  if (!ok) throw new SheetSetupError("header mismatch");

  return grid.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    OUTCOME_HEADERS.forEach((h, i) => {
      obj[h] = cells[i] ?? "";
    });
    return obj;
  });
}

export async function loadOutcomes(sheet: ContractorSheet): Promise<OutcomeRecord[]> {
  const rows = await readRows(sheet);
  return rows.flatMap((r) => {
    const parsed = parseOutcomeRow(r);
    return parsed ? [parsed] : [];
  });
}

export type RecordResult =
  | { ok: true; updated: boolean; responseMinutes: number | null }
  | { ok: false; error: "invalid" | "not_found" }
  | { ok: false; error: "validation"; errors: OutcomeErrors };

// Records (or updates) the outcome for one request + contractor pair in the
// current environment. One row per pair: saving again updates that row.
export async function recordOutcome(
  sheet: ContractorSheet,
  body: unknown,
  env: { recordType: RecordType; now?: Date },
  newId: () => string,
): Promise<RecordResult> {
  const input = parseOutcomeInput(body);
  if (
    !input ||
    !OUTCOME_ID_PATTERNS.request.test(input.requestId) ||
    !OUTCOME_ID_PATTERNS.contractor.test(input.contractorId)
  ) {
    return { ok: false, error: "invalid" };
  }

  // Both must exist, and both must belong to this environment, so a TEST
  // outcome can never be attached to a REAL request or contractor.
  const request = (await loadRequests(sheet)).find(
    (r) => r.id === input.requestId && r.recordType === env.recordType,
  );
  const contractor = (await loadContractors(sheet)).find(
    (c) => c.id === input.contractorId && c.recordType === env.recordType,
  );
  if (!request || !contractor) return { ok: false, error: "not_found" };

  const now = env.now ?? new Date();
  const verdict = validateOutcome(input, {
    requestCreatedAt: request.createdAt,
    now: now.getTime(),
  });
  if (!verdict.ok) return { ok: false, error: "validation", errors: verdict.errors };

  const rows = await readRows(sheet);
  const index = rows.findIndex(
    (r) =>
      r.record_type === env.recordType &&
      r.request_id === input.requestId &&
      r.contractor_id === input.contractorId,
  );
  const nowIso = now.toISOString();

  if (index >= 0) {
    const existing = rows[index];
    const row = buildOutcomeRow(verdict.value, {
      id: existing.outcome_id || newId(),
      recordType: env.recordType,
      recordedAt: existing.recorded_at || nowIso,
      updatedAt: nowIso,
    });
    const sheetRow = index + 2; // +1 for the header, +1 because rows are 1-based
    await sheet.update(`${TAB}!A${sheetRow}:${LAST_COLUMN}${sheetRow}`, row);
    return { ok: true, updated: true, responseMinutes: verdict.value.responseMinutes };
  }

  await sheet.append(
    `${TAB}!A1`,
    buildOutcomeRow(verdict.value, {
      id: newId(),
      recordType: env.recordType,
      recordedAt: nowIso,
      updatedAt: nowIso,
    }),
  );
  return { ok: true, updated: false, responseMinutes: verdict.value.responseMinutes };
}

// Values for pre-filling the form from an existing outcome (or blanks).
export async function loadFormValues(
  sheet: ContractorSheet,
  requestId: string,
  contractorId: string,
  recordType: RecordType,
): Promise<{ values: OutcomeInput; exists: boolean } | null> {
  if (
    !OUTCOME_ID_PATTERNS.request.test(requestId) ||
    !OUTCOME_ID_PATTERNS.contractor.test(contractorId)
  ) {
    return null;
  }
  const request = (await loadRequests(sheet)).find(
    (r) => r.id === requestId && r.recordType === recordType,
  );
  const contractor = (await loadContractors(sheet)).find(
    (c) => c.id === contractorId && c.recordType === recordType,
  );
  if (!request || !contractor) return null;

  const existing = (await loadOutcomes(sheet)).find(
    (o) =>
      o.recordType === recordType &&
      o.requestId === requestId &&
      o.contractorId === contractorId,
  );
  const blank: OutcomeInput = {
    requestId,
    contractorId,
    messageSent: "",
    contactAttemptedAt: "",
    reply: "",
    repliedAt: "",
    matchUsable: "",
    rating: null,
    failureReason: "",
    jobStarted: "",
  };
  if (!existing) return { values: blank, exists: false };
  return {
    exists: true,
    values: {
      ...blank,
      messageSent: existing.messageSent,
      contactAttemptedAt: toIstLocal(existing.contactAttemptedAt),
      reply: existing.reply,
      repliedAt: toIstLocal(existing.repliedAt),
      matchUsable: existing.matchUsable,
      rating: existing.rating,
      failureReason: existing.failureReason,
      jobStarted: existing.jobStarted,
    },
  };
}
