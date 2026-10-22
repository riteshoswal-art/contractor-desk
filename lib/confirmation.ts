// Availability confirmation, recorded for ONE request and ONE contractor.
//
// This is deliberately separate from the contractor's own registration and
// from the old contractor-level "last confirmed" date: a confirmation for one
// job says nothing about any other job. Each change is a new row (an audit
// trail); the latest row for the pair is the current status.
//
// Nothing here is inferred. A message being sent, a link being opened or a
// bid existing never creates a confirmation. Only the contractor (through
// their private link) or the founder (after a call or reply) records one.
import { dayNumber, START_FLEX_DAYS } from "./match";
import { defineTable } from "./tables";
import { isRealDate, type RecordType } from "./registration";

export const CONFIRMATION_TABLE = defineTable("Confirmations", [
  "confirmation_id",
  "record_type",
  "request_id",
  "contractor_id",
  "status",
  "confirmed_start_date",
  "source",
  "recorded_by",
  "recorded_at",
  "note",
] as const);

export const CONFIRMATION_STATUSES = [
  { value: "awaiting_response", label: "Awaiting response" },
  { value: "interested_unconfirmed", label: "Interested; availability unconfirmed" },
  { value: "available_requested_date", label: "Available, confirmed for the requested date" },
  { value: "available_alternative_date", label: "Available, confirmed for an alternative date" },
  { value: "unavailable", label: "Unavailable" },
] as const;

export type ConfirmationStatus = (typeof CONFIRMATION_STATUSES)[number]["value"];

export const CONFIRMATION_LABELS: Record<ConfirmationStatus, string> = Object.fromEntries(
  CONFIRMATION_STATUSES.map((s) => [s.value, s.label]),
) as Record<ConfirmationStatus, string>;

// Where the statement came from, so a reader can see how strong it is.
export type ConfirmationSource = "admin" | "contractor_link";
export const SOURCE_LABELS: Record<ConfirmationSource, string> = {
  admin: "Recorded by the founder (after a call or reply)",
  contractor_link: "Stated by the contractor through their private link",
};

export type Confirmation = {
  id: string;
  recordType: RecordType;
  requestId: string;
  contractorId: string;
  status: ConfirmationStatus;
  confirmedStartDate: string; // YYYY-MM-DD, or "" when none applies
  source: ConfirmationSource;
  recordedBy: string;
  recordedAt: string;
  note: string;
};

export const NOTE_MAX = 200;

export type ConfirmationInput = {
  status: string;
  confirmedStartDate: string;
  note: string;
};
export type ConfirmationErrors = Partial<Record<keyof ConfirmationInput, string>>;

// Checks what a person entered against the request they are confirming for.
// The requested date is taken from the request on the server, never typed.
export function validateConfirmation(
  input: ConfirmationInput,
  request: { startDate: string },
  today: string,
):
  | { ok: true; value: { status: ConfirmationStatus; confirmedStartDate: string; note: string } }
  | { ok: false; errors: ConfirmationErrors } {
  const errors: ConfirmationErrors = {};
  const status = CONFIRMATION_STATUSES.find((s) => s.value === input.status)?.value;
  const note = input.note.trim();
  if (!status) errors.status = "Please choose a status.";
  if (note.length > NOTE_MAX) errors.note = `Keep the note to ${NOTE_MAX} characters or fewer.`;
  if (/\d{10}/.test(note.replace(/[\s-]/g, ""))) {
    errors.note = "Please do not put phone numbers in notes.";
  }

  let confirmedStartDate = "";
  if (status === "available_requested_date") {
    if (!isRealDate(request.startDate)) {
      errors.status = "This request has no start date, so use an alternative date instead.";
    } else {
      confirmedStartDate = request.startDate; // the server sets it, not the form
    }
    if (input.confirmedStartDate) {
      errors.confirmedStartDate = "Leave the date empty: it is the request's start date.";
    }
  } else if (status === "available_alternative_date") {
    const d = input.confirmedStartDate.trim();
    if (!d) {
      errors.confirmedStartDate = "Please enter the date they confirmed.";
    } else if (!isRealDate(d)) {
      errors.confirmedStartDate = "Please enter a real date.";
    } else if (d < today) {
      errors.confirmedStartDate = "That date is in the past.";
    } else if (d === request.startDate) {
      errors.confirmedStartDate = "That is the requested date. Choose the first availability option instead.";
    } else if (dayNumber(d)! - dayNumber(today)! > 365) {
      errors.confirmedStartDate = "That date is too far ahead.";
    } else {
      confirmedStartDate = d;
    }
  } else if (input.confirmedStartDate.trim()) {
    errors.confirmedStartDate = "A date only applies to the two 'available' statuses.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { status: status!, confirmedStartDate, note } };
}

export function parseConfirmationRow(r: Record<string, string>): Confirmation | null {
  if (r.record_type !== "TEST" && r.record_type !== "REAL") return null;
  const status = CONFIRMATION_STATUSES.find((s) => s.value === r.status)?.value;
  if (!status || !r.request_id || !r.contractor_id) return null; // unknown values are ignored, never guessed
  const source: ConfirmationSource = r.source === "contractor_link" ? "contractor_link" : "admin";
  return {
    id: r.confirmation_id,
    recordType: r.record_type,
    requestId: r.request_id,
    contractorId: r.contractor_id,
    status,
    confirmedStartDate: isRealDate(r.confirmed_start_date) ? r.confirmed_start_date : "",
    source,
    recordedBy: r.recorded_by,
    recordedAt: r.recorded_at,
    note: r.note,
  };
}

// Rows are in the order they were appended, so the LAST row for a pair is the
// current status. All earlier rows stay as history.
export function latestByPair(rows: Confirmation[]): Map<string, Confirmation> {
  const map = new Map<string, Confirmation>();
  for (const c of rows) map.set(pairKey(c.requestId, c.contractorId), c);
  return map;
}
export function historyOf(rows: Confirmation[], requestId: string, contractorId: string): Confirmation[] {
  return rows.filter((c) => c.requestId === requestId && c.contractorId === contractorId);
}
export const pairKey = (requestId: string, contractorId: string) => `${requestId}|${contractorId}`;

// What a confirmation actually proves for THIS request.
//  confirmed  - a start date is confirmed and the developer may rely on it
//  startDate  - that date
//  reason     - why it is not confirmed (for the page and the tests)
export type ConfirmedStart =
  | { confirmed: true; startDate: string; exactDate: boolean }
  | { confirmed: false; reason: "none" | "awaiting" | "interested_only" | "unavailable" | "outside_window" | "no_request_date" };

export function confirmedStart(
  c: Confirmation | undefined,
  request: { id: string; startDate: string },
): ConfirmedStart {
  // A confirmation belongs to one request. One recorded for another request
  // is never reused here.
  if (!c || c.requestId !== request.id) return { confirmed: false, reason: "none" };
  switch (c.status) {
    case "awaiting_response":
      return { confirmed: false, reason: "awaiting" };
    case "interested_unconfirmed":
      return { confirmed: false, reason: "interested_only" };
    case "unavailable":
      return { confirmed: false, reason: "unavailable" };
    case "available_requested_date":
      if (!isRealDate(request.startDate) || c.confirmedStartDate !== request.startDate) {
        return { confirmed: false, reason: "no_request_date" };
      }
      return { confirmed: true, startDate: request.startDate, exactDate: true };
    case "available_alternative_date": {
      const confirmed = dayNumber(c.confirmedStartDate);
      if (confirmed === null) return { confirmed: false, reason: "none" };
      const wanted = dayNumber(request.startDate);
      // With no requested date there is nothing to be "near"; any confirmed
      // date is the contractor's own and is shown as such.
      if (wanted !== null && Math.abs(confirmed - wanted) > START_FLEX_DAYS) {
        return { confirmed: false, reason: "outside_window" };
      }
      return { confirmed: true, startDate: c.confirmedStartDate, exactDate: wanted !== null && confirmed === wanted };
    }
  }
}

export const NOT_CONFIRMED_TEXT: Record<Extract<ConfirmedStart, { confirmed: false }>["reason"], string> = {
  none: "No confirmation recorded for this request.",
  awaiting: "Awaiting a response. Not confirmed.",
  interested_only: "Interested, but no start date has been confirmed.",
  unavailable: "Said they are unavailable.",
  outside_window: `The confirmed date is more than ${START_FLEX_DAYS} days from the requested date.`,
  no_request_date: "The request has no start date to confirm against.",
};

export function buildConfirmationRow(
  v: { status: ConfirmationStatus; confirmedStartDate: string; note: string },
  meta: {
    id: string;
    recordType: RecordType;
    requestId: string;
    contractorId: string;
    source: ConfirmationSource;
    recordedBy: string;
    recordedAt: string;
  },
): Record<(typeof CONFIRMATION_TABLE.headers)[number], string> {
  return {
    confirmation_id: meta.id,
    record_type: meta.recordType,
    request_id: meta.requestId,
    contractor_id: meta.contractorId,
    status: v.status,
    confirmed_start_date: v.confirmedStartDate,
    source: meta.source,
    recorded_by: meta.recordedBy,
    recorded_at: meta.recordedAt,
    note: v.note,
  };
}
