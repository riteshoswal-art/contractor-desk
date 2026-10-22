// Contractor matching: plain, readable rules. No AI is involved anywhere in
// this file, and nothing here reads secrets or calls any service. Gemini never
// sees contractor records and never chooses candidates.
import { CONSENT_VERSION, PUNE_AREAS, type RecordType } from "./registration";

export const MAX_CANDIDATES = 5;
export const STALE_AFTER_DAYS = 14;

// How far (in calendar days) a contractor's start date may fall AFTER the
// requested start date and still be shown, as a "Start date needs
// confirmation" candidate. Trade and locality are never relaxed.
export const START_FLEX_DAYS = 2;
export const START_NEEDS_CONFIRMATION = "Start date needs confirmation";

// Consent wordings a contractor may have agreed to. Add a version here only
// after checking that the new wording still covers sharing with developers.
export const ACCEPTED_CONSENT_VERSIONS: readonly string[] = [CONSENT_VERSION];

// What matching knows about a contractor. The phone number is deliberately not
// part of this type: it is never loaded for matching.
export type ContractorRecord = {
  id: string;
  recordType: string;
  name: string;
  trade: string;
  serviceAreas: string[];
  availability: string; // "now" | "from_date" | "unavailable"
  earliestStart: string; // YYYY-MM-DD or ""
  consentVersion: string;
  consentTimestamp: string;
  availabilityReportedAt: string;
  lastConfirmedAt: string;
  deletionRequestedAt: string;
};

export type RequestRecord = {
  id: string;
  recordType: string;
  createdAt: string;
  developerName: string;
  description: string;
  trade: string;
  area: string;
  startDate: string; // YYYY-MM-DD or ""
  durationDays: number | null;
  notes: string;
  status: string;
};

export type ExclusionReason =
  | "no_consent"
  | "deletion_requested"
  | "trade_mismatch"
  | "area_mismatch"
  | "unavailable"
  | "starts_too_late"
  | "stale_availability";

export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  no_consent: "no recorded consent",
  deletion_requested: "deletion requested",
  trade_mismatch: "different trade",
  area_mismatch: "does not serve this locality",
  unavailable: "reports being unavailable",
  starts_too_late: `cannot start within ${START_FLEX_DAYS} days of the requested date`,
  stale_availability: "availability information is out of date",
};

// How a contractor's stated start fits the requested start date.
//  on_date       says "available now", or "from" a date on or before the request
//                (the stated availability covers the requested date)
//  near_date     starts 1 to START_FLEX_DAYS days AFTER the requested date
//  date_unknown  says "available from a date" but no usable date is recorded
//  not_checked   the request has no start date, so timing was not checked
// near_date and date_unknown are labelled "Start date needs confirmation".
export type StartFit = {
  kind: "on_date" | "near_date" | "date_unknown" | "not_checked";
  offsetDays: number | null; // days after the requested date (near_date only)
  label: string | null;
};

export type Candidate = {
  contractorId: string;
  name: string;
  recordType: string;
  trade: string;
  serviceAreas: string[];
  evidence: { kind: "founder_confirmed" | "self_reported"; at: string };
  startFit: StartFit;
  reasons: string[];
  missing: string[];
};

export type MatchResult = {
  recordType: RecordType;
  checked: number; // contractors in this environment that were considered
  eligibleCount: number; // how many passed every rule
  needsStartConfirmationCount: number; // of those, how many carry the label
  candidates: Candidate[]; // at most MAX_CANDIDATES
  excluded: Record<ExclusionReason, number>; // counts only, never names
  requestIncomplete: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// "2026-10-21" or a full timestamp -> "21 Oct 2026" (India time).
export function formatDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00+05:30`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

// "YYYY-MM-DD" -> whole days since 1970-01-01, or null if it is not a real date.
// Plain calendar arithmetic: no time zones, so "tomorrow" is always +1.
export function dayNumber(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null; // e.g. 2026-02-31
  }
  return Math.round(ms / DAY_MS);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function parseTime(value: string): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

// Several areas are separated by ";". A comma is NOT a separator, because a
// single locality can contain one (for example "Hinjawadi, Phase 1").
export function splitAreas(value: string): string[] {
  return value
    .split(";")
    .map((a) => a.trim())
    .filter(Boolean);
}

function sameArea(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// The most recent availability evidence on record, and what kind it is.
// A founder-recorded confirmation outranks a contractor's own report only when
// it is the more recent of the two; either way the age is measured from it.
function latestEvidence(
  c: ContractorRecord,
  now: number,
): { kind: "founder_confirmed" | "self_reported"; at: string; time: number } | null {
  const usable = (t: number | null): t is number =>
    t !== null && t <= now + DAY_MS; // ignore timestamps from the future
  const confirmed = parseTime(c.lastConfirmedAt);
  const reported = parseTime(c.availabilityReportedAt);

  const options: {
    kind: "founder_confirmed" | "self_reported";
    at: string;
    time: number;
  }[] = [];
  if (usable(confirmed)) {
    options.push({ kind: "founder_confirmed", at: c.lastConfirmedAt, time: confirmed });
  }
  if (usable(reported)) {
    options.push({ kind: "self_reported", at: c.availabilityReportedAt, time: reported });
  }
  if (options.length === 0) return null;
  options.sort((a, b) => b.time - a.time);
  return options[0];
}

export function matchContractors(
  request: RequestRecord,
  contractors: ContractorRecord[],
  options: {
    envType: RecordType;
    now?: Date;
    staleDays?: number;
    max?: number;
  },
): MatchResult {
  const now = (options.now ?? new Date()).getTime();
  const staleDays = options.staleDays ?? STALE_AFTER_DAYS;
  const max = options.max ?? MAX_CANDIDATES;

  const excluded: Record<ExclusionReason, number> = {
    no_consent: 0,
    deletion_requested: 0,
    trade_mismatch: 0,
    area_mismatch: 0,
    unavailable: 0,
    starts_too_late: 0,
    stale_availability: 0,
  };
  const result: MatchResult = {
    recordType: options.envType,
    checked: 0,
    eligibleCount: 0,
    needsStartConfirmationCount: 0,
    candidates: [],
    excluded,
    requestIncomplete: !request.trade || !request.area,
  };
  if (result.requestIncomplete) return result;

  const eligible: (Candidate & { sortTime: number; fitRank: number })[] = [];
  const requestDay = dayNumber(request.startDate);

  for (const c of contractors) {
    // Records from the other environment are never considered or counted.
    if (c.recordType !== options.envType) continue;
    result.checked += 1;

    // The first rule a contractor fails decides how they are counted.
    if (
      !ACCEPTED_CONSENT_VERSIONS.includes(c.consentVersion) ||
      !c.consentTimestamp
    ) {
      excluded.no_consent += 1;
      continue;
    }
    if (c.deletionRequestedAt) {
      excluded.deletion_requested += 1;
      continue;
    }
    if (c.trade !== request.trade) {
      excluded.trade_mismatch += 1;
      continue;
    }
    if (!c.serviceAreas.some((a) => sameArea(a, request.area))) {
      excluded.area_mismatch += 1;
      continue;
    }
    if (c.availability !== "now" && c.availability !== "from_date") {
      excluded.unavailable += 1; // "unavailable" or anything unrecognised
      continue;
    }
    // How does their stated start fit the requested date? Only the DATE is
    // flexible: trade and locality were already required above. A contractor
    // who says "from <date>" is available on every day from that date, so a
    // date on or before the request covers it. A date up to START_FLEX_DAYS
    // days after the request is kept but labelled; anything later is out.
    const contractorDay = c.availability === "from_date" ? dayNumber(c.earliestStart) : null;
    let startFit: StartFit;
    if (c.availability === "now") {
      startFit = { kind: "on_date", offsetDays: null, label: null };
    } else if (contractorDay === null) {
      // "Available from a date", but the date is missing or not a real date.
      startFit = { kind: "date_unknown", offsetDays: null, label: START_NEEDS_CONFIRMATION };
    } else if (requestDay === null) {
      startFit = { kind: "not_checked", offsetDays: null, label: null };
    } else {
      const offset = contractorDay - requestDay; // days AFTER the requested start
      if (offset <= 0) {
        startFit = { kind: "on_date", offsetDays: null, label: null };
      } else if (offset <= START_FLEX_DAYS) {
        startFit = { kind: "near_date", offsetDays: offset, label: START_NEEDS_CONFIRMATION };
      } else {
        excluded.starts_too_late += 1;
        continue;
      }
    }
    const evidence = latestEvidence(c, now);
    if (!evidence || (now - evidence.time) / DAY_MS > staleDays) {
      excluded.stale_availability += 1;
      continue;
    }

    // Passed every rule. Build the plain-language explanation.
    const ageDays = Math.max(0, Math.floor((now - evidence.time) / DAY_MS));
    const reasons: string[] = [
      `Trade matches: ${request.trade}.`,
      `Lists ${request.area} among the areas they serve (${c.serviceAreas.join(", ")}).`,
    ];
    if (c.availability === "now") {
      reasons.push("Said they are available now.");
    } else if (startFit.kind === "on_date") {
      const early = Math.max(0, requestDay! - contractorDay!);
      reasons.push(
        `Said they are available from ${formatDate(c.earliestStart)}, on or before the requested start of ${formatDate(request.startDate)}${early > 0 ? ` (${plural(early, "day")} before)` : ""}.`,
      );
    } else if (startFit.kind === "near_date") {
      reasons.push(
        `Said they are available from ${formatDate(c.earliestStart)}, ${plural(startFit.offsetDays!, "day")} after the requested start of ${formatDate(request.startDate)}. That is inside the ${START_FLEX_DAYS}-day flexible window, but it is not the requested date.`,
      );
    } else {
      reasons.push(
        contractorDay !== null
          ? `Said they are available from ${formatDate(c.earliestStart)}.`
          : "Said they are available from a later date (date not recorded).",
      );
    }
    reasons.push(
      evidence.kind === "founder_confirmed"
        ? `Availability was recorded as confirmed by you on ${formatDate(evidence.at)} (${ageDays} day${ageDays === 1 ? "" : "s"} ago). It may have changed since.`
        : `Availability was reported by the contractor on ${formatDate(evidence.at)} (${ageDays} day${ageDays === 1 ? "" : "s"} ago).`,
    );

    const missing: string[] = [];
    if (evidence.kind === "self_reported") {
      missing.push("Availability has not been confirmed by you yet.");
    }
    if (!request.startDate) {
      missing.push("The request has no start date, so timing was not checked.");
    }
    if (startFit.kind === "near_date") {
      missing.push(
        `${START_NEEDS_CONFIRMATION}: they have not said they can start on ${formatDate(request.startDate)}. Do not treat them as available on that date until you confirm it with them.`,
      );
    }
    if (c.availability === "from_date" && !c.earliestStart) {
      missing.push("Their earliest start date is not recorded.");
    }
    if (startFit.kind === "date_unknown") {
      missing.push(
        `${START_NEEDS_CONFIRMATION}: no usable start date is on record, so the requested date cannot be assumed.`,
      );
    }
    if (!c.name) missing.push("No name was given.");
    if (request.trade === "Other") {
      missing.push('Trade is "Other", so check manually that the work is the same.');
    }
    if (!(PUNE_AREAS as readonly string[]).some((a) => sameArea(a, request.area))) {
      missing.push("This locality is not on the starter list; matched on exact text only.");
    }

    eligible.push({
      contractorId: c.id,
      name: c.name,
      recordType: c.recordType,
      trade: c.trade,
      serviceAreas: c.serviceAreas,
      evidence: { kind: evidence.kind, at: evidence.at },
      startFit,
      reasons,
      missing,
      sortTime: evidence.time,
      // 0 = covers the requested date, 1-2 = that many days late, 3 = date unknown
      fitRank:
        startFit.kind === "near_date"
          ? startFit.offsetDays!
          : startFit.kind === "date_unknown"
            ? START_FLEX_DAYS + 1
            : 0,
    });
  }

  // Ordering rule (no score): contractors whose availability covers the
  // requested date first, then 1 day late, then 2 days late, then unknown
  // dates; within each group founder-confirmed first, then the most recently
  // reported or confirmed, then by ID so the order is stable.
  eligible.sort(
    (a, b) =>
      a.fitRank - b.fitRank ||
      Number(b.evidence.kind === "founder_confirmed") -
        Number(a.evidence.kind === "founder_confirmed") ||
      b.sortTime - a.sortTime ||
      a.contractorId.localeCompare(b.contractorId),
  );

  result.eligibleCount = eligible.length;
  result.needsStartConfirmationCount = eligible.filter((c) => c.startFit.label !== null).length;
  result.candidates = eligible
    .slice(0, max)
    .map((c) => ({
      contractorId: c.contractorId,
      name: c.name,
      recordType: c.recordType,
      trade: c.trade,
      serviceAreas: c.serviceAreas,
      evidence: c.evidence,
      startFit: c.startFit,
      reasons: c.reasons,
      missing: c.missing,
    }));
  return result;
}
