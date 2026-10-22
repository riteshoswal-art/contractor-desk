// Bidding: pure rules, no Sheet access. The Bids tab is append-only, so it is
// also the audit trail. One tab holds two kinds of rows:
//
//   request-level   opened | closed | reopened | cancelled   (contractor_id empty)
//   bid-level       submitted | corrected | voided | selected
//
// The current state is worked out by reading the rows in order and applying
// only the valid ones. A row that makes no sense (for example a hand-edited
// one) is ignored, never guessed at.
//
// One bid per contractor per request: the FIRST valid "submitted" row for the
// pair is the bid; a later one is ignored. A correction is never a second bid:
// it is an administrator's "corrected" row on the SAME bid, with a reason.
import { confirmedStart, type Confirmation, type ConfirmedStart } from "./confirmation";
import type { Cleaned, Job } from "./job";
import type { Candidate } from "./match";
import { isRealDate, type RecordType } from "./registration";
import { defineTable } from "./tables";

export const BID_TABLE = defineTable("Bids", [
  "bid_id",
  "record_type",
  "request_id",
  "contractor_id",
  "event",
  "rate_amount",
  "currency",
  "rate_unit",
  "notes",
  "notes_language",
  "closes_at",
  "invite_id",
  "recorded_at",
  "recorded_by",
  "reason",
] as const);

export type BidRow = Record<(typeof BID_TABLE.headers)[number], string>;

export const CURRENCY = "INR";
export const NOTES_MAX = 500;
export const MAX_DEADLINE_DAYS = 60;

// ---------------------------------------------------------------------------
// Rate units. A price is only meaningful with its unit, and two units are
// never compared with each other.
// ---------------------------------------------------------------------------

export const RATE_UNITS = [
  { value: "per_sqft", label: "per square foot", max: 100_000 },
  { value: "per_sqm", label: "per square metre", max: 1_000_000 },
  { value: "per_day", label: "per day", max: 1_000_000 },
  { value: "per_unit", label: "per unit", max: 100_000_000 },
  { value: "fixed_scope", label: "fixed price for the defined scope", max: 1_000_000_000 },
] as const;

export type RateUnit = (typeof RATE_UNITS)[number]["value"];
export const unitInfo = (unit: string) => RATE_UNITS.find((u) => u.value === unit);
export const isRateUnit = (value: unknown): value is RateUnit =>
  typeof value === "string" && RATE_UNITS.some((u) => u.value === value);

const AMOUNT = /^(\d{1,10})(?:\.(\d{1,2}))?$/;

// "1250.50" -> 125050. Whole numbers only (paise), so comparing and sorting
// never depends on floating-point arithmetic.
export function toPaise(amount: string): number | null {
  const m = AMOUNT.exec(amount);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
}

// "₹1,250.50" (Indian digit grouping; the amount is exact).
export function formatAmount(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const cents = paise % 100;
  const text = new Intl.NumberFormat("en-IN").format(rupees);
  return `₹${text}${cents ? `.${String(cents).padStart(2, "0")}` : ""}`;
}

export function formatBidPrice(amount: string, unit: string): string {
  const paise = toPaise(amount);
  const label = unitInfo(unit)?.label ?? unit;
  return paise === null ? "-" : `${formatAmount(paise)} ${label}`;
}

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
function asciiDigits(text: string): string {
  return text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

// ---------------------------------------------------------------------------
// Checking what a contractor (or an administrator correcting a bid) types
// ---------------------------------------------------------------------------

export type BidInput = { amount: unknown; unit: unknown; notes?: unknown };
export type BidErrors = Partial<Record<"amount" | "unit" | "notes", string>>;
export type ValidBid = { amount: string; unit: RateUnit; notes: string };

export function validateBid(input: BidInput): { ok: true; value: ValidBid } | { ok: false; errors: BidErrors } {
  const errors: BidErrors = {};

  const unit = isRateUnit(input.unit) ? input.unit : null;
  if (input.unit === undefined || input.unit === null || input.unit === "") errors.unit = "Please choose a rate unit.";
  else if (!unit) errors.unit = "Please choose a rate unit from the list.";

  let amount = "";
  const raw = input.amount;
  if (raw === undefined || raw === null || raw === "") {
    errors.amount = "Please enter your price.";
  } else if ((typeof raw !== "string" && typeof raw !== "number") || (typeof raw === "number" && !Number.isFinite(raw))) {
    errors.amount = "Please enter your price as a number, for example 1250 or 1250.50.";
  } else {
    const text = asciiDigits(String(raw)).replace(/[\s,]/g, "");
    if (!AMOUNT.test(text)) {
      errors.amount = /^\d+\.\d{3,}$/.test(text)
        ? "Use at most 2 digits after the decimal point."
        : "Please enter your price as a number, for example 1250 or 1250.50.";
    } else {
      const paise = toPaise(text)!;
      if (paise <= 0) errors.amount = "The price must be more than zero.";
      else if (unit && paise > unitInfo(unit)!.max * 100) errors.amount = "That price is too large for this rate unit. Please check it.";
      else amount = (paise / 100).toFixed(2);
    }
  }

  let notes = "";
  if (input.notes !== undefined && input.notes !== null && input.notes !== "") {
    if (typeof input.notes !== "string") errors.notes = "The notes must be text.";
    else {
      const text = input.notes.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim();
      if (text.length > NOTES_MAX) errors.notes = `Keep the notes to ${NOTES_MAX} characters or fewer.`;
      else if (/\d{10}/.test(asciiDigits(text).replace(/[\s-]/g, ""))) errors.notes = "Please do not put phone numbers in the notes.";
      else notes = text;
    }
  }

  if (Object.keys(errors).length > 0 || !unit) return { ok: false, errors };
  return { ok: true, value: { amount, unit, notes } };
}

// A closing date is optional. If given it must be a real date, not in the past
// and within MAX_DEADLINE_DAYS. The bidding stays open until the END of that
// day in India (23:59:59 +05:30). Returns the closing moment as an ISO time.
export function cleanDeadline(input: unknown, todayIst: string): Cleaned<string> {
  if (input === undefined || input === null || input === "") return { ok: true, value: "" };
  if (typeof input !== "string" || !isRealDate(input.trim())) return { ok: false, error: "Please enter a real closing date." };
  const day = input.trim();
  const end = Date.parse(`${day}T23:59:59+05:30`);
  if (day < todayIst) return { ok: false, error: "The closing date cannot be in the past." };
  const days = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${todayIst}T00:00:00Z`)) / 86400_000;
  if (days > MAX_DEADLINE_DAYS) return { ok: false, error: `The closing date must be within ${MAX_DEADLINE_DAYS} days.` };
  return { ok: true, value: new Date(end).toISOString() };
}

// ---------------------------------------------------------------------------
// The bidding round (request-level state)
// ---------------------------------------------------------------------------

export type RoundState = "not_opened" | "open" | "closed" | "cancelled";
export type RoundEntry = { event: string; recordedAt: string; recordedBy: string; reason: string; closesAt: string };
export type Round = { state: RoundState; closesAt: string; history: RoundEntry[] };

const ROUND_EVENTS = ["opened", "closed", "reopened", "cancelled"];

export function foldRound(rows: BidRow[], recordType: RecordType, requestId: string): Round {
  const round: Round = { state: "not_opened", closesAt: "", history: [] };
  for (const r of rows) {
    if (r.record_type !== recordType || r.request_id !== requestId || r.contractor_id !== "") continue;
    if (!ROUND_EVENTS.includes(r.event)) continue;
    const closesAt = Number.isNaN(Date.parse(r.closes_at)) ? "" : r.closes_at;
    const ok =
      (r.event === "opened" && round.state === "not_opened") ||
      (r.event === "closed" && round.state === "open") ||
      (r.event === "cancelled" && (round.state === "open" || round.state === "closed") && r.reason !== "") ||
      (r.event === "reopened" && (round.state === "closed" || round.state === "cancelled") && r.reason !== "");
    if (!ok) continue;
    round.state = r.event === "closed" ? "closed" : r.event === "cancelled" ? "cancelled" : "open";
    round.closesAt = round.state === "open" ? closesAt : round.closesAt;
    round.history.push({ event: r.event, recordedAt: r.recorded_at, recordedBy: r.recorded_by, reason: r.reason, closesAt });
  }
  return round;
}

export type BiddingState = "not_opened" | "open" | "closed" | "selected" | "cancelled";

export const BIDDING_STATE_TEXT: Record<BiddingState, string> = {
  not_opened: "Bidding has not been opened",
  open: "Bidding is open",
  closed: "Bidding is closed",
  selected: "A contractor has been selected",
  cancelled: "Bidding is cancelled",
};

// What the request is, right now. A recorded job decides first (the Jobs tab is
// the one source of truth for who was selected); otherwise the round does, and
// an open round whose closing time has passed counts as closed.
export function biddingState(round: Round, job: Job | undefined, nowMs: number): BiddingState {
  if (job) return job.status === "cancelled" ? "cancelled" : "selected";
  if (round.state === "open" && round.closesAt && Date.parse(round.closesAt) <= nowMs) return "closed";
  return round.state;
}

// ---------------------------------------------------------------------------
// Bids (contractor-level state)
// ---------------------------------------------------------------------------

export type BidHistoryEntry = {
  event: "submitted" | "corrected" | "voided";
  amount: string;
  unit: string;
  recordedAt: string;
  recordedBy: string;
  reason: string;
};

export type Bid = {
  id: string;
  recordType: RecordType;
  requestId: string;
  contractorId: string;
  amount: string; // "1250.00", always two decimals
  unit: RateUnit;
  currency: string;
  notes: string;
  notesLanguage: string;
  inviteId: string;
  submittedAt: string;
  updatedAt: string;
  voided: boolean;
  corrected: boolean;
  history: BidHistoryEntry[];
};

const CONTRACTOR_ID = /^C-[A-Z2-9]{8}$/;

export function foldBids(rows: BidRow[], recordType: RecordType): Bid[] {
  const pairs = new Set<string>(); // request|contractor: ONE bid per pair
  const byId = new Map<string, Bid>();

  for (const r of rows) {
    if (r.record_type !== recordType || !r.request_id || !r.bid_id) continue;
    if (r.event === "submitted") {
      const key = `${r.request_id}|${r.contractor_id}`;
      if (pairs.has(key) || byId.has(r.bid_id) || !CONTRACTOR_ID.test(r.contractor_id)) continue; // the first bid wins
      const valid = validateBid({ amount: r.rate_amount, unit: r.rate_unit, notes: r.notes });
      if (!valid.ok || r.currency !== CURRENCY || Number.isNaN(Date.parse(r.recorded_at))) continue;
      const bid: Bid = {
        id: r.bid_id,
        recordType,
        requestId: r.request_id,
        contractorId: r.contractor_id,
        amount: valid.value.amount,
        unit: valid.value.unit,
        currency: CURRENCY,
        notes: valid.value.notes,
        notesLanguage: r.notes_language,
        inviteId: r.invite_id,
        submittedAt: r.recorded_at,
        updatedAt: r.recorded_at,
        voided: false,
        corrected: false,
        history: [{ event: "submitted", amount: valid.value.amount, unit: valid.value.unit, recordedAt: r.recorded_at, recordedBy: r.recorded_by, reason: "" }],
      };
      pairs.add(key);
      byId.set(bid.id, bid);
      continue;
    }

    const bid = byId.get(r.bid_id);
    if (!bid || bid.requestId !== r.request_id || bid.contractorId !== r.contractor_id) continue;
    if (r.event === "corrected") {
      if (bid.voided || !r.reason) continue;
      const valid = validateBid({ amount: r.rate_amount, unit: r.rate_unit, notes: r.notes });
      if (!valid.ok) continue;
      bid.amount = valid.value.amount;
      bid.unit = valid.value.unit;
      bid.notes = valid.value.notes;
      bid.corrected = true;
      bid.updatedAt = r.recorded_at;
      bid.history.push({ event: "corrected", amount: bid.amount, unit: bid.unit, recordedAt: r.recorded_at, recordedBy: r.recorded_by, reason: r.reason });
    } else if (r.event === "voided") {
      if (bid.voided || !r.reason) continue;
      bid.voided = true;
      bid.updatedAt = r.recorded_at;
      bid.history.push({ event: "voided", amount: bid.amount, unit: bid.unit, recordedAt: r.recorded_at, recordedBy: r.recorded_by, reason: r.reason });
    }
  }
  return [...byId.values()];
}

// The bid most recently recorded as chosen for a request: the LAST "selected"
// row that names an existing bid of that contractor and request. There can be
// several, because changing the contractor to another bidder records that
// bidder's bid too (A, then B, then A again). It is only an audit marker: who is
// on the job is decided by the Jobs tab.
export function selectedBidMarker(
  rows: BidRow[],
  recordType: RecordType,
  requestId: string,
  bids: Bid[],
): { bidId: string; recordedAt: string } | null {
  let found: { bidId: string; recordedAt: string } | null = null;
  for (const r of rows) {
    if (r.record_type !== recordType || r.request_id !== requestId || r.event !== "selected") continue;
    const bid = bids.find((b) => b.id === r.bid_id);
    if (bid && bid.requestId === requestId && bid.contractorId === r.contractor_id) found = { bidId: bid.id, recordedAt: r.recorded_at };
  }
  return found;
}

// ---------------------------------------------------------------------------
// Can this bidder be chosen? (The same start-date rules as Phase 4.)
// ---------------------------------------------------------------------------

export type Standing =
  | { ok: true }
  | { ok: false; reason: "not_candidate" | "unavailable" | "not_confirmed"; why?: Extract<ConfirmedStart, { confirmed: false }>["reason"] };

// `candidate` is the contractor's CURRENT match for this request (undefined when
// they no longer match: a different trade or locality can never be rescued by a
// price). A contractor whose start date needs confirmation counts only after a
// confirmation recorded for THIS request. A bid never confirms anything.
export function standing(
  candidate: Candidate | undefined,
  latest: Confirmation | undefined,
  request: { id: string; startDate: string },
): Standing {
  if (!candidate) return { ok: false, reason: "not_candidate" };
  if (latest?.status === "unavailable") return { ok: false, reason: "unavailable" };
  if (candidate.startFit.label !== null) {
    const state = confirmedStart(latest, request);
    if (!state.confirmed) return { ok: false, reason: "not_confirmed", why: state.reason };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Grouping for comparison
// ---------------------------------------------------------------------------

export type PriceGroup<T extends { amount: string; unit: string }> = {
  unit: RateUnit;
  label: string;
  fixedScope: boolean;
  bids: T[]; // cheapest first, then in the order the bids arrived
};

// Bids are grouped by rate unit and only ever ordered inside a group. Amounts
// in different units (Rs 20 per square foot, Rs 1,500 per day) are never ranked
// together, and no total cost is worked out.
export function groupByUnit<T extends { amount: string; unit: string }>(bids: T[]): PriceGroup<T>[] {
  return RATE_UNITS.flatMap((u) => {
    const list = bids
      .map((b, i) => ({ b, i }))
      .filter((x) => x.b.unit === u.value)
      .sort((x, y) => (toPaise(x.b.amount) ?? 0) - (toPaise(y.b.amount) ?? 0) || x.i - y.i)
      .map((x) => x.b);
    return list.length ? [{ unit: u.value, label: u.label, fixedScope: u.value === "fixed_scope", bids: list }] : [];
  });
}
