// A "job" is a request after the founder has recorded which contractor the
// developer chose. The Jobs tab is append-only, so it is also the audit trail:
//
//   selected            the FIRST such row for a request is the selection. A
//                       later "selected" row for the same request is ignored,
//                       so two people choosing at the same moment (even on
//                       different servers) still give exactly one contractor.
//   contractor_changed  allowed only while the job is still "selected", with a reason
//   completed           the work is finished (the completion date is optional)
//   cancelled           the job will not happen (a reason is required)
//   corrected           an explicit, reasoned change of a final outcome
//                       (completed <-> cancelled, or a different completion date)
//
// Nothing here edits or deletes an earlier row. The current state is worked out
// by reading the rows in order and applying only the valid ones; a row that does
// not make sense (for example a hand-edited one) is ignored, never guessed.
import { isRealDate, todayInIndia, type RecordType } from "./registration";
import { defineTable } from "./tables";

export const JOB_TABLE = defineTable("Jobs", [
  "job_id",
  "record_type",
  "request_id",
  "contractor_id",
  "event",
  "status",
  "completion_date",
  "recorded_at",
  "recorded_by",
  "reason",
] as const);

export type JobEvent = "selected" | "contractor_changed" | "completed" | "cancelled" | "corrected" | "contact_shared";
export type JobStatus = "selected" | "completed" | "cancelled";

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  selected: "Contractor selected, job in progress",
  completed: "Job completed",
  cancelled: "Job cancelled",
};

export const REASON_MIN = 5;
export const REASON_MAX = 200;

export type JobHistoryEntry = {
  event: JobEvent;
  status: JobStatus;
  contractorId: string;
  completionDate: string;
  recordedAt: string;
  recordedBy: string;
  reason: string;
};

export type Job = {
  id: string;
  recordType: RecordType;
  requestId: string;
  contractorId: string; // the contractor currently on the job
  status: JobStatus;
  completionDate: string; // YYYY-MM-DD, or "" when unknown or not completed
  selectedAt: string;
  updatedAt: string;
  history: JobHistoryEntry[];
  // Each time the founder viewed the contractor's contact details to pass them on
  // (an audit trail only: it never changes the job's status).
  contactShares: { recordedAt: string; recordedBy: string }[];
};

export type JobRow = Record<(typeof JOB_TABLE.headers)[number], string>;

const CONTRACTOR_ID = /^C-[A-Z2-9]{8}$/;
const isFinal = (s: JobStatus) => s === "completed" || s === "cancelled";

// Folds the append-only rows into one Job per request.
export function foldJobs(rows: JobRow[], recordType: RecordType): Job[] {
  const jobs = new Map<string, Job>(); // by request id

  for (const r of rows) {
    if (r.record_type !== recordType || !r.request_id || !r.job_id) continue;
    const entry = (status: JobStatus, completionDate: string): JobHistoryEntry => ({
      event: r.event as JobEvent,
      status,
      contractorId: r.contractor_id,
      completionDate,
      recordedAt: r.recorded_at,
      recordedBy: r.recorded_by,
      reason: r.reason,
    });
    const job = jobs.get(r.request_id);

    if (r.event === "selected") {
      if (job || !CONTRACTOR_ID.test(r.contractor_id)) continue; // the first valid selection wins
      jobs.set(r.request_id, {
        id: r.job_id,
        recordType,
        requestId: r.request_id,
        contractorId: r.contractor_id,
        status: "selected",
        completionDate: "",
        selectedAt: r.recorded_at,
        updatedAt: r.recorded_at,
        history: [entry("selected", "")],
        contactShares: [],
      });
      continue;
    }

    if (!job || job.id !== r.job_id) continue; // belongs to a selection that did not win

    if (r.event === "contact_shared") {
      // An audit row only: it counts while the job is not cancelled and does
      // not touch the status, the contractor or the history.
      if (job.status !== "cancelled" && r.contractor_id === job.contractorId) {
        job.contactShares.push({ recordedAt: r.recorded_at, recordedBy: r.recorded_by });
      }
      continue;
    }

    if (r.event === "contractor_changed") {
      if (job.status !== "selected" || !CONTRACTOR_ID.test(r.contractor_id) || !r.reason) continue;
      job.contractorId = r.contractor_id;
      job.history.push(entry("selected", ""));
    } else if (r.event === "completed") {
      if (job.status !== "selected") continue;
      job.status = "completed";
      job.completionDate = isRealDate(r.completion_date) ? r.completion_date : "";
      job.history.push(entry("completed", job.completionDate));
    } else if (r.event === "cancelled") {
      if (job.status !== "selected" || !r.reason) continue;
      job.status = "cancelled";
      job.completionDate = "";
      job.history.push(entry("cancelled", ""));
    } else if (r.event === "corrected") {
      if (!isFinal(job.status) || !r.reason) continue;
      if (r.status !== "completed" && r.status !== "cancelled") continue;
      job.status = r.status;
      job.completionDate = r.status === "completed" && isRealDate(r.completion_date) ? r.completion_date : "";
      job.history.push(entry(job.status, job.completionDate));
    } else {
      continue;
    }
    job.updatedAt = r.recorded_at;
  }
  return [...jobs.values()];
}

// ---------------------------------------------------------------------------
// Checks on what the founder types
// ---------------------------------------------------------------------------

export type Cleaned<T> = { ok: true; value: T } | { ok: false; error: string };

// A reason is short plain text with no phone numbers.
export function cleanReason(input: unknown, required: boolean): Cleaned<string> {
  if (input === undefined || input === null || input === "") {
    return required ? { ok: false, error: `Please give a reason (${REASON_MIN} to ${REASON_MAX} characters).` } : { ok: true, value: "" };
  }
  if (typeof input !== "string") return { ok: false, error: "The reason must be text." };
  const text = input.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (text.length === 0) {
    return required ? { ok: false, error: `Please give a reason (${REASON_MIN} to ${REASON_MAX} characters).` } : { ok: true, value: "" };
  }
  if (text.length < REASON_MIN && required) return { ok: false, error: `Please give a little more detail (at least ${REASON_MIN} characters).` };
  if (text.length > REASON_MAX) return { ok: false, error: `Keep the reason to ${REASON_MAX} characters or fewer.` };
  if (/\d{10}/.test(text.replace(/[\s-]/g, ""))) return { ok: false, error: "Please do not put phone numbers in the reason." };
  return { ok: true, value: text };
}

// The actual completion date is optional ("when known"). If given it must be a
// real date, not in the future, and not before the request was raised.
export function cleanCompletionDate(
  input: unknown,
  ctx: { today: string; requestCreatedAt: string },
): Cleaned<string> {
  if (input === undefined || input === null || input === "") return { ok: true, value: "" };
  if (typeof input !== "string") return { ok: false, error: "The date must be text in the form YYYY-MM-DD." };
  const d = input.trim();
  if (d === "") return { ok: true, value: "" };
  if (!isRealDate(d)) return { ok: false, error: "Please enter a real date." };
  if (d > ctx.today) return { ok: false, error: "The completion date cannot be in the future." };
  const created = new Date(ctx.requestCreatedAt);
  if (!Number.isNaN(created.getTime()) && d < todayInIndia(created)) {
    return { ok: false, error: "The job cannot be completed before the request was raised." };
  }
  return { ok: true, value: d };
}
