// Outcome logging: what a founder may record about one contact attempt, how it
// is checked, and the Outcomes tab layout. Pure logic: no secrets, no network.
//
// Each of these is a separate fact and is never inferred from another:
// a link being opened, a message actually being sent, a reply arriving, the
// match being usable, and a job starting. The founder states each one.
import { isRealDate, type RecordType } from "./registration";

// Column headers, left to right, in row 1 of the "Outcomes" tab. The server
// refuses to write if the Sheet does not match. No names or phone numbers are
// stored here: only IDs and the facts below.
export const OUTCOME_HEADERS = [
  "outcome_id",
  "record_type",
  "request_id",
  "contractor_id",
  "recorded_at",
  "updated_at",
  "message_sent",
  "contact_attempted_at",
  "contractor_reply",
  "replied_at",
  "response_minutes",
  "match_usable",
  "usefulness_rating",
  "failure_reason",
  "job_started",
] as const;

export const FAILURE_REASONS = [
  { value: "no_response", label: "No response" },
  { value: "declined", label: "Contractor declined" },
  { value: "not_available", label: "Not available for these dates" },
  { value: "wrong_trade_or_area", label: "Trade or area did not fit" },
  { value: "job_size_or_duration", label: "Job size or duration did not fit" },
  { value: "terms_not_agreed", label: "Terms not agreed" },
  { value: "wrong_number", label: "Number wrong or not working" },
  { value: "other", label: "Other" },
] as const;

export type YesNo = "" | "yes" | "no";
export type Reply = "" | "yes" | "no" | "no_response";

// What the browser sends. Dates and times are India local time typed by the
// founder ("2026-10-21T14:30"); the server turns them into UTC.
export type OutcomeInput = {
  requestId: string;
  contractorId: string;
  messageSent: YesNo; // "" = not answered, which is invalid
  contactAttemptedAt: string;
  reply: Reply; // "" = not recorded yet
  repliedAt: string;
  matchUsable: YesNo; // "" = not sure yet
  rating: number | null;
  failureReason: string;
  jobStarted: YesNo; // "" = not known
};

export type OutcomeErrors = Partial<Record<keyof OutcomeInput, string>>;

export type ValidOutcome = {
  requestId: string;
  contractorId: string;
  messageSent: "yes" | "no";
  contactAttemptedAt: string; // ISO UTC or ""
  reply: Reply;
  repliedAt: string; // ISO UTC or ""
  responseMinutes: number | null;
  matchUsable: YesNo;
  rating: number | null;
  failureReason: string;
  jobStarted: YesNo;
};

const CLOCK_SKEW_MS = 5 * 60 * 1000;

// "2026-10-21T14:30" typed as India time -> milliseconds, or null if invalid.
export function parseIstLocal(value: string): number | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m || !isRealDate(m[1])) return null;
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  if (hour > 23 || minute > 59) return null;
  return new Date(`${m[1]}T${m[2]}:${m[3]}:00+05:30`).getTime();
}

// ISO timestamp -> "2026-10-21T14:30" in India time, for pre-filling the form.
export function toIstLocal(iso: string): string {
  const t = new Date(iso).getTime();
  if (!iso || Number.isNaN(t)) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

const YES_NO = ["", "yes", "no"];
const REPLIES = ["", "yes", "no", "no_response"];

// Turns an untrusted body into OutcomeInput, or null if its shape is wrong.
export function parseOutcomeInput(body: unknown): OutcomeInput | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  const text = (v: unknown, max = 60): string | null =>
    v === undefined ? "" : typeof v === "string" && v.length <= max ? v.trim() : null;

  const requestId = text(raw.requestId);
  const contractorId = text(raw.contractorId);
  const messageSent = text(raw.messageSent);
  const contactAttemptedAt = text(raw.contactAttemptedAt);
  const reply = text(raw.reply);
  const repliedAt = text(raw.repliedAt);
  const matchUsable = text(raw.matchUsable);
  const failureReason = text(raw.failureReason);
  const jobStarted = text(raw.jobStarted);
  if (
    requestId === null || contractorId === null || messageSent === null ||
    contactAttemptedAt === null || reply === null || repliedAt === null ||
    matchUsable === null || failureReason === null || jobStarted === null
  ) {
    return null;
  }
  if (!YES_NO.includes(messageSent) || !YES_NO.includes(matchUsable) || !YES_NO.includes(jobStarted)) return null;
  if (!REPLIES.includes(reply)) return null;

  let rating: number | null = null;
  if (raw.rating !== undefined && raw.rating !== null) {
    if (typeof raw.rating !== "number") return null;
    rating = raw.rating;
  }
  return {
    requestId,
    contractorId,
    messageSent: messageSent as YesNo,
    contactAttemptedAt,
    reply: reply as Reply,
    repliedAt,
    matchUsable: matchUsable as YesNo,
    rating,
    failureReason,
    jobStarted: jobStarted as YesNo,
  };
}

// Checks the founder's entries for contradictions. It never fills anything in:
// a missing reply time stays missing, and no response time is made up.
export function validateOutcome(
  input: OutcomeInput,
  ctx: { requestCreatedAt: string; now: number },
): { ok: true; value: ValidOutcome } | { ok: false; errors: OutcomeErrors } {
  const errors: OutcomeErrors = {};

  if (input.messageSent !== "yes" && input.messageSent !== "no") {
    errors.messageSent = "Please say whether you actually sent the message.";
  }
  const sent = input.messageSent === "yes";

  let attemptMs: number | null = null;
  if (sent) {
    attemptMs = parseIstLocal(input.contactAttemptedAt);
    // The form only has minute precision ("15:37" means 15:37:00), while a
    // request is created at an exact second. Compare against the START of the
    // request's minute, so a contact entered for the same minute is accepted
    // while any earlier minute is still refused.
    const createdMs = Math.floor(new Date(ctx.requestCreatedAt).getTime() / 60000) * 60000;
    if (!input.contactAttemptedAt) {
      errors.contactAttemptedAt = "Please enter when you sent it.";
    } else if (attemptMs === null) {
      errors.contactAttemptedAt = "Please enter a valid date and time.";
    } else if (attemptMs > ctx.now + CLOCK_SKEW_MS) {
      errors.contactAttemptedAt = "That time is in the future.";
    } else if (!Number.isNaN(createdMs) && attemptMs < createdMs) {
      errors.contactAttemptedAt = "That is before the request was received.";
    }
  } else if (input.messageSent === "no") {
    if (input.contactAttemptedAt) {
      errors.contactAttemptedAt = "Leave this empty if you did not send the message.";
    }
    if (input.reply) errors.reply = "There cannot be a reply to a message that was not sent.";
  }

  let replyMs: number | null = null;
  if (input.reply === "yes" || input.reply === "no") {
    if (input.repliedAt) {
      replyMs = parseIstLocal(input.repliedAt);
      if (replyMs === null) {
        errors.repliedAt = "Please enter a valid date and time.";
      } else if (replyMs > ctx.now + CLOCK_SKEW_MS) {
        errors.repliedAt = "That time is in the future.";
      } else if (attemptMs !== null && replyMs < attemptMs) {
        errors.repliedAt = "A reply cannot come before the message was sent.";
      }
    }
  } else if (input.repliedAt) {
    errors.repliedAt = "Only enter a reply time if the contractor replied.";
  }

  if (input.rating !== null) {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
      errors.rating = "The rating must be a whole number from 1 to 5.";
    }
  }

  if (input.failureReason && !FAILURE_REASONS.some((r) => r.value === input.failureReason)) {
    errors.failureReason = "Please choose a reason from the list.";
  } else if (input.matchUsable === "no" && !input.failureReason) {
    errors.failureReason = "Please say why the match was not usable.";
  }

  if (input.jobStarted === "yes") {
    if (!sent || input.reply !== "yes") {
      errors.jobStarted =
        "A job can only be recorded as started if the message was sent and the contractor replied yes.";
    } else if (input.matchUsable === "no") {
      errors.jobStarted = "A job cannot start from a match you marked as not usable.";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const responseMinutes =
    attemptMs !== null && replyMs !== null
      ? Math.round((replyMs - attemptMs) / 60000)
      : null;

  return {
    ok: true,
    value: {
      requestId: input.requestId,
      contractorId: input.contractorId,
      messageSent: sent ? "yes" : "no",
      contactAttemptedAt: attemptMs === null ? "" : new Date(attemptMs).toISOString(),
      reply: input.reply,
      repliedAt: replyMs === null ? "" : new Date(replyMs).toISOString(),
      responseMinutes,
      matchUsable: input.matchUsable,
      rating: input.rating,
      failureReason: input.failureReason,
      jobStarted: input.jobStarted,
    },
  };
}

export function buildOutcomeRow(
  v: ValidOutcome,
  meta: { id: string; recordType: RecordType; recordedAt: string; updatedAt: string },
): string[] {
  const cells: Record<(typeof OUTCOME_HEADERS)[number], string> = {
    outcome_id: meta.id,
    record_type: meta.recordType,
    request_id: v.requestId,
    contractor_id: v.contractorId,
    recorded_at: meta.recordedAt,
    updated_at: meta.updatedAt,
    message_sent: v.messageSent,
    contact_attempted_at: v.contactAttemptedAt,
    contractor_reply: v.reply,
    replied_at: v.repliedAt,
    response_minutes: v.responseMinutes === null ? "" : String(v.responseMinutes),
    match_usable: v.matchUsable,
    usefulness_rating: v.rating === null ? "" : String(v.rating),
    failure_reason: v.failureReason,
    job_started: v.jobStarted,
  };
  return OUTCOME_HEADERS.map((h) => cells[h]);
}

// What the dashboard reads back. Unrecognised or edited-by-hand values become
// "not recorded" rather than being guessed.
export type OutcomeRecord = {
  id: string;
  recordType: "TEST" | "REAL";
  requestId: string;
  contractorId: string;
  recordedAt: string;
  updatedAt: string;
  messageSent: "yes" | "no" | "";
  contactAttemptedAt: string;
  reply: Reply;
  repliedAt: string;
  responseMinutes: number | null;
  matchUsable: YesNo;
  rating: number | null;
  failureReason: string;
  jobStarted: YesNo;
};

export function parseOutcomeRow(r: Record<string, string>): OutcomeRecord | null {
  if (r.record_type !== "TEST" && r.record_type !== "REAL") return null;
  if (!r.request_id || !r.contractor_id) return null;
  const yn = (v: string): YesNo => (v === "yes" || v === "no" ? v : "");
  const minutes = Number(r.response_minutes);
  const rating = Number(r.usefulness_rating);
  return {
    id: r.outcome_id,
    recordType: r.record_type,
    requestId: r.request_id,
    contractorId: r.contractor_id,
    recordedAt: r.recorded_at,
    updatedAt: r.updated_at,
    messageSent: r.message_sent === "yes" || r.message_sent === "no" ? r.message_sent : "",
    contactAttemptedAt: r.contact_attempted_at,
    reply: REPLIES.includes(r.contractor_reply) ? (r.contractor_reply as Reply) : "",
    repliedAt: r.replied_at,
    responseMinutes:
      r.response_minutes !== "" && Number.isInteger(minutes) && minutes >= 0 ? minutes : null,
    matchUsable: yn(r.match_usable),
    rating: r.usefulness_rating !== "" && Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    failureReason: r.failure_reason,
    jobStarted: yn(r.job_started),
  };
}
