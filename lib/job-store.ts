// Server-only: the Jobs tab. It takes the Sheet as an argument so it can be
// tested without Google. IDs, statuses, dates and short reasons only: never
// names or phone numbers.
import { confirmedStart, latestByPair, pairKey, type ConfirmedStart } from "./confirmation";
import { findRequestAndCandidate, loadConfirmations } from "./confirmation-store";
import { SheetSetupError, type ContractorSheet } from "./contractor-store";
import {
  JOB_TABLE,
  cleanCompletionDate,
  cleanReason,
  foldJobs,
  type Job,
  type JobRow,
} from "./job";
import { loadOutcomes } from "./outcome-store";
import { loadContractorPhone, loadContractors, loadRequests } from "./records";
import type { RecordType } from "./registration";
import { appendTableRow, readTable, withLock } from "./tables";

const RECORDED_BY = "founder (admin login)";
const ID = { request: /^R-[A-Z2-9]{8}$/, contractor: /^C-[A-Z2-9]{8}$/ };

export async function loadJobs(sheet: ContractorSheet, recordType: RecordType): Promise<Job[]> {
  const rows = await readTable(sheet, JOB_TABLE);
  return foldJobs(rows as JobRow[], recordType);
}

export type JobEnv = { recordType: RecordType; today: string; now?: Date };

export type JobResult =
  | { ok: true; job: Job }
  | {
      ok: false;
      error:
        | "invalid"
        | "not_found"
        | "not_associated"
        | "already_selected"
        | "no_job"
        | "unavailable"
        | "not_confirmed"
        | "not_in_progress"
        | "not_final"
        | "same_contractor"
        | "nothing_changed";
      reason?: Extract<ConfirmedStart, { confirmed: false }>["reason"];
    }
  | { ok: false; error: "validation"; errors: Record<string, string> };

async function orEmpty<T>(work: Promise<T[]>): Promise<T[]> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof SheetSetupError) return []; // an optional tab that does not exist yet
    throw error;
  }
}

// Is this contractor allowed to be recorded on this request's job?
//   - They must be associated with the request: a current potential match, or
//     someone the founder already has a contact outcome or a confirmation for.
//   - A contractor who said "unavailable" (latest confirmation) is refused.
//   - A contractor whose start date still needs confirmation (a near-date
//     candidate, or someone no longer on the list) is refused until a start
//     date has actually been confirmed for THIS request.
async function checkContractor(
  sheet: ContractorSheet,
  request: { id: string; startDate: string },
  contractorId: string,
  env: JobEnv,
): Promise<{ ok: true } | Extract<JobResult, { ok: false }>> {
  const contractor = (await loadContractors(sheet)).find(
    (c) => c.id === contractorId && c.recordType === env.recordType,
  );
  if (!contractor) return { ok: false, error: "not_found" };

  const found = await findRequestAndCandidate(sheet, request.id, contractorId, env.recordType, env.now);
  const confirmations = await orEmpty(loadConfirmations(sheet, env.recordType));
  const outcomes = await orEmpty(loadOutcomes(sheet));
  const associated =
    Boolean(found) ||
    outcomes.some((o) => o.recordType === env.recordType && o.requestId === request.id && o.contractorId === contractorId) ||
    confirmations.some((c) => c.requestId === request.id && c.contractorId === contractorId);
  if (!associated) return { ok: false, error: "not_associated" };

  const latest = latestByPair(confirmations).get(pairKey(request.id, contractorId));
  if (latest?.status === "unavailable") return { ok: false, error: "unavailable" };

  const needsConfirmation = !found || found.candidate.startFit.label !== null;
  if (needsConfirmation) {
    const state = confirmedStart(latest, request);
    if (!state.confirmed) return { ok: false, error: "not_confirmed", reason: state.reason };
  }
  return { ok: true };
}

async function requestFor(sheet: ContractorSheet, requestId: unknown, env: JobEnv) {
  if (typeof requestId !== "string" || !ID.request.test(requestId)) return null;
  return (await loadRequests(sheet)).find((r) => r.id === requestId && r.recordType === env.recordType) ?? null;
}

async function append(
  sheet: ContractorSheet,
  env: JobEnv,
  row: { jobId: string; requestId: string; contractorId: string; event: string; status: string; completionDate?: string; reason?: string },
) {
  await appendTableRow(sheet, JOB_TABLE, {
    job_id: row.jobId,
    record_type: env.recordType,
    request_id: row.requestId,
    contractor_id: row.contractorId,
    event: row.event,
    status: row.status,
    completion_date: row.completionDate ?? "",
    recorded_at: (env.now ?? new Date()).toISOString(),
    recorded_by: RECORDED_BY,
    reason: row.reason ?? "",
  });
}

const jobOf = async (sheet: ContractorSheet, env: JobEnv, requestId: string) =>
  (await loadJobs(sheet, env.recordType)).find((j) => j.requestId === requestId);

// ---------------------------------------------------------------------------
// The five actions. Each runs under a lock for the request, so two clicks (or
// two admins) cannot interleave, and re-reads the Sheet before writing.
// ---------------------------------------------------------------------------

export async function selectContractor(
  sheet: ContractorSheet,
  args: { requestId: unknown; contractorId: unknown },
  env: JobEnv,
  newJobId: () => string,
): Promise<JobResult> {
  if (typeof args.contractorId !== "string" || !ID.contractor.test(args.contractorId)) return { ok: false, error: "invalid" };
  const request = await requestFor(sheet, args.requestId, env);
  if (!request) return { ok: false, error: "not_found" };

  return withLock(`job:${request.id}`, async () => {
    if (await jobOf(sheet, env, request.id)) return { ok: false as const, error: "already_selected" as const };
    const check = await checkContractor(sheet, request, args.contractorId as string, env);
    if (!check.ok) return check;

    const id = newJobId();
    await append(sheet, env, { jobId: id, requestId: request.id, contractorId: args.contractorId as string, event: "selected", status: "selected" });
    // Another server may have written a selection at the same moment: whichever
    // row is first in the Sheet is the real one.
    const after = await jobOf(sheet, env, request.id);
    if (!after || after.id !== id) return { ok: false as const, error: "already_selected" as const };
    return { ok: true as const, job: after };
  });
}

export async function changeContractor(
  sheet: ContractorSheet,
  args: { requestId: unknown; contractorId: unknown; reason: unknown },
  env: JobEnv,
): Promise<JobResult> {
  if (typeof args.contractorId !== "string" || !ID.contractor.test(args.contractorId)) return { ok: false, error: "invalid" };
  const reason = cleanReason(args.reason, true);
  if (!reason.ok) return { ok: false, error: "validation", errors: { reason: reason.error } };
  const request = await requestFor(sheet, args.requestId, env);
  if (!request) return { ok: false, error: "not_found" };

  return withLock(`job:${request.id}`, async () => {
    const job = await jobOf(sheet, env, request.id);
    if (!job) return { ok: false as const, error: "no_job" as const };
    if (job.status !== "selected") return { ok: false as const, error: "not_in_progress" as const };
    if (job.contractorId === args.contractorId) return { ok: false as const, error: "same_contractor" as const };
    const check = await checkContractor(sheet, request, args.contractorId as string, env);
    if (!check.ok) return check;
    await append(sheet, env, { jobId: job.id, requestId: request.id, contractorId: args.contractorId as string, event: "contractor_changed", status: "selected", reason: reason.value });
    return { ok: true as const, job: (await jobOf(sheet, env, request.id))! };
  });
}

export async function completeJob(
  sheet: ContractorSheet,
  args: { requestId: unknown; completionDate?: unknown },
  env: JobEnv,
): Promise<JobResult> {
  const request = await requestFor(sheet, args.requestId, env);
  if (!request) return { ok: false, error: "not_found" };
  const date = cleanCompletionDate(args.completionDate, { today: env.today, requestCreatedAt: request.createdAt });
  if (!date.ok) return { ok: false, error: "validation", errors: { completionDate: date.error } };

  return withLock(`job:${request.id}`, async () => {
    const job = await jobOf(sheet, env, request.id);
    if (!job) return { ok: false as const, error: "no_job" as const };
    if (job.status !== "selected") return { ok: false as const, error: "not_in_progress" as const };
    await append(sheet, env, { jobId: job.id, requestId: request.id, contractorId: job.contractorId, event: "completed", status: "completed", completionDate: date.value });
    return { ok: true as const, job: (await jobOf(sheet, env, request.id))! };
  });
}

export async function cancelJob(
  sheet: ContractorSheet,
  args: { requestId: unknown; reason: unknown },
  env: JobEnv,
): Promise<JobResult> {
  const reason = cleanReason(args.reason, true);
  if (!reason.ok) return { ok: false, error: "validation", errors: { reason: reason.error } };
  const request = await requestFor(sheet, args.requestId, env);
  if (!request) return { ok: false, error: "not_found" };

  return withLock(`job:${request.id}`, async () => {
    const job = await jobOf(sheet, env, request.id);
    if (!job) return { ok: false as const, error: "no_job" as const };
    if (job.status !== "selected") return { ok: false as const, error: "not_in_progress" as const };
    await append(sheet, env, { jobId: job.id, requestId: request.id, contractorId: job.contractorId, event: "cancelled", status: "cancelled", reason: reason.value });
    return { ok: true as const, job: (await jobOf(sheet, env, request.id))! };
  });
}

// A final outcome can only be changed on purpose: with a reason, as a new row,
// leaving the original rows in place.
export async function correctJob(
  sheet: ContractorSheet,
  args: { requestId: unknown; status: unknown; completionDate?: unknown; reason: unknown },
  env: JobEnv,
): Promise<JobResult> {
  if (args.status !== "completed" && args.status !== "cancelled") return { ok: false, error: "invalid" };
  const status: "completed" | "cancelled" = args.status;
  const reason = cleanReason(args.reason, true);
  if (!reason.ok) return { ok: false, error: "validation", errors: { reason: reason.error } };
  const request = await requestFor(sheet, args.requestId, env);
  if (!request) return { ok: false, error: "not_found" };
  const date = status === "completed"
    ? cleanCompletionDate(args.completionDate, { today: env.today, requestCreatedAt: request.createdAt })
    : ({ ok: true, value: "" } as const);
  if (!date.ok) return { ok: false, error: "validation", errors: { completionDate: date.error } };

  return withLock(`job:${request.id}`, async () => {
    const job = await jobOf(sheet, env, request.id);
    if (!job) return { ok: false as const, error: "no_job" as const };
    if (job.status === "selected") return { ok: false as const, error: "not_final" as const };
    if (job.status === status && job.completionDate === date.value) return { ok: false as const, error: "nothing_changed" as const };
    await append(sheet, env, { jobId: job.id, requestId: request.id, contractorId: job.contractorId, event: "corrected", status, completionDate: date.value, reason: reason.value });
    return { ok: true as const, job: (await jobOf(sheet, env, request.id))! };
  });
}

// ---------------------------------------------------------------------------
// Sharing the chosen contractor's contact details (after selection only)
// ---------------------------------------------------------------------------

export type ShareContactResult =
  | { ok: true; contractorName: string; phone: string | null; heldBack: "test_record" | null; shares: number }
  | { ok: false; error: "invalid" | "not_found" | "no_job" | "not_in_progress" };

// The one place a contractor's phone number can be shown for passing on to the
// developer. It works only for the contractor recorded on this request's job
// (so a bidder who was not chosen can never be revealed), only while the job is
// not cancelled, and every viewing is recorded as a "contact_shared" row in the
// Jobs tab. The number is read only for a REAL record on a server that is
// allowed to contact real people, or for a made-up record in local fixture
// mode. For other TEST records (rows in the real Sheet) it is not even read, and
// nothing is recorded because nothing was shown. Nothing is sent anywhere.
export async function shareContact(
  sheet: ContractorSheet,
  args: { requestId: unknown },
  // syntheticContactAllowed: true ONLY in local fixture mode (lib/fixtures.ts),
  // where every record and number is made up and lives in memory. It lets the
  // demo show the reveal after selection; TEST rows in the real Sheet stay hidden.
  env: JobEnv & { realContactAllowed: boolean; syntheticContactAllowed?: boolean },
): Promise<ShareContactResult> {
  const request = await requestFor(sheet, args.requestId, env);
  if (!request) return { ok: false, error: "not_found" };

  return withLock(`job:${request.id}`, async () => {
    const job = await jobOf(sheet, env, request.id);
    if (!job) return { ok: false as const, error: "no_job" as const };
    if (job.status === "cancelled") return { ok: false as const, error: "not_in_progress" as const };
    const contractor = (await loadContractors(sheet)).find((c) => c.id === job.contractorId && c.recordType === env.recordType);
    if (!contractor) return { ok: false as const, error: "not_found" as const };

    const mayRead =
      (contractor.recordType === "REAL" && env.realContactAllowed) ||
      (contractor.recordType === "TEST" && env.syntheticContactAllowed === true);
    if (!mayRead) {
      return { ok: true as const, contractorName: contractor.name, phone: null, heldBack: "test_record" as const, shares: job.contactShares.length };
    }
    const phone = await loadContractorPhone(sheet, contractor.id);
    if (!phone) return { ok: false as const, error: "not_found" as const };
    await append(sheet, env, { jobId: job.id, requestId: request.id, contractorId: contractor.id, event: "contact_shared", status: job.status });
    const after = await jobOf(sheet, env, request.id);
    return { ok: true as const, contractorName: contractor.name, phone, heldBack: null, shares: after?.contactShares.length ?? job.contactShares.length + 1 };
  });
}
