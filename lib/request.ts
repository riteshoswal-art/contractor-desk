// Rules for developer requests: what Gemini may return, what a saved request
// must contain, and the Requests tab layout. Used by both the browser form and
// the server, so nothing here may read secrets or call services.
import { canonicalLocality } from "./language";
import {
  PUNE_AREAS,
  TRADES,
  cleanText,
  isRealDate,
  isValidIndianMobile,
  neutralizeCell,
  normalizePhone,
  type RecordType,
} from "./registration";

// r1 (2026-10-21) also said the description would be sent to Google's Gemini AI
// service. Real requests are no longer sent to any AI service (lib/ai-policy.ts),
// so r2 drops that. Rows keep the exact version and text that was agreed to.
export const REQUEST_CONSENT_VERSION = "r2-2026-10-22";
export const REQUEST_CONSENT_TEXT =
  "I agree that the details I enter will be stored privately and used to look for contractors for this requirement, and that I may be contacted about this requirement. My details are not sent to any AI service. I understand that I can request deletion of my details.";

export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 2000;
const NOTES_MAX = 500;
const DURATION_MAX_DAYS = 730;

// ---------------------------------------------------------------------------
// Privacy: what is allowed to reach Gemini
// ---------------------------------------------------------------------------

// Removes email addresses and phone-number-like digit runs from text before it
// is sent to Gemini. Only the developer's own description is ever sent; no
// contractor records are involved. This is a safety net, not a guarantee.
export function redactContacts(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email removed]")
    .replace(/(?:\+?\d[\s().-]?){8,}\d/g, "[number removed]");
}

// ---------------------------------------------------------------------------
// What Gemini is asked to return
// ---------------------------------------------------------------------------

export type Extraction = {
  trade: string; // one of TRADES, or "" if unknown
  area: string; // Pune locality, or "" if unknown
  startDate: string; // YYYY-MM-DD, or "" if unknown
  durationDays: number | null;
  notes: string;
};

export type ExtractionField = "trade" | "area" | "startDate" | "durationDays";

export type ExtractionResult = {
  fields: Extraction;
  missing: ExtractionField[];
  questions: string[];
};

// JSON Schema sent to Gemini. "Unknown" is expressed with a fixed value
// ("unknown", "", 0) so Gemini never has to guess or return null.
export const GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    trade: { type: "string", enum: [...TRADES, "unknown"] },
    area: { type: "string" },
    start_date: { type: "string" },
    duration_days: { type: "integer" },
    notes: { type: "string" },
  },
  required: ["trade", "area", "start_date", "duration_days", "notes"],
} as const;

const QUESTIONS: Record<ExtractionField, string> = {
  trade: `Which trade do you need? (${TRADES.join(", ")})`,
  area: "Which Pune locality is the site in?",
  startDate: "When do you need the contractor to start? (optional)",
  durationDays: "About how many days will the work take? (optional)",
};

// \p{M} (combining marks) is needed for Hindi and Marathi words such as बाणेर.
const LOCALITY_PATTERN = /^[\p{L}\p{M}\p{N}\s.,'()-]+$/u;

export function isValidLocality(value: string): boolean {
  const v = value.trim();
  return v.length >= 2 && v.length <= 60 && LOCALITY_PATTERN.test(v);
}

// Matches "baner" to "Baner" so later matching sees one spelling.
function canonicalArea(value: string): string {
  const known = PUNE_AREAS.find((a) => a.toLowerCase() === value.toLowerCase());
  return known ?? value;
}

// Turns whatever Gemini returned into safe values. It never throws and never
// trusts the input: anything missing, invalid or out of range becomes "unknown"
// and a clarifying question is produced for it.
export function parseExtraction(raw: unknown, today: string): ExtractionResult {
  const obj =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const str = (v: unknown) => (typeof v === "string" ? cleanText(v) : "");

  const tradeRaw = str(obj.trade);
  const trade = (TRADES as readonly string[]).includes(tradeRaw)
    ? tradeRaw
    : "";

  let area = str(obj.area);
  if (!isValidLocality(area) || area.toLowerCase() === "pune") area = "";
  else area = canonicalArea(area);

  const dateRaw = str(obj.start_date);
  const startDate = isRealDate(dateRaw) && dateRaw >= today ? dateRaw : "";

  const d = obj.duration_days;
  const durationDays =
    typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= DURATION_MAX_DAYS
      ? d
      : null;

  const fields: Extraction = {
    trade,
    area,
    startDate,
    durationDays,
    notes: str(obj.notes).slice(0, NOTES_MAX),
  };

  const missing: ExtractionField[] = [];
  if (!fields.trade) missing.push("trade");
  if (!fields.area) missing.push("area");
  if (!fields.startDate) missing.push("startDate");
  if (fields.durationDays === null) missing.push("durationDays");

  return { fields, missing, questions: missing.map((f) => QUESTIONS[f]) };
}

// ---------------------------------------------------------------------------
// What the browser sends to be saved
// ---------------------------------------------------------------------------

export type RequestSource = "ai_assisted" | "manual";

export type RequestValues = {
  description: string;
  name: string;
  phone: string;
  trade: string;
  area: string;
  startDate: string;
  durationDays: number | null;
  notes: string;
  consent: boolean;
  source: RequestSource;
};

export type RequestErrors = Partial<Record<keyof RequestValues, string>>;

export const emptyRequest: RequestValues = {
  description: "",
  name: "",
  phone: "",
  trade: "",
  area: "",
  startDate: "",
  durationDays: null,
  notes: "",
  consent: false,
  source: "manual",
};

// Turns an untrusted request body into RequestValues, or null if its shape is
// wrong. `honeypot` is a hidden field that real people never fill in.
export function parseRequestSubmission(
  body: unknown,
): { values: RequestValues; honeypot: string } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const raw = body as Record<string, unknown>;
  const values: RequestValues = { ...emptyRequest };

  for (const key of [
    "description",
    "name",
    "phone",
    "trade",
    "area",
    "startDate",
    "notes",
  ] as const) {
    const v = raw[key];
    if (v === undefined) continue;
    if (typeof v !== "string" || v.length > DESCRIPTION_MAX + 200) return null;
    values[key] = cleanText(v);
  }
  // A known locality typed in Hindi or Marathi is stored with its English spelling.
  values.area = canonicalLocality(values.area);

  const d = raw.durationDays;
  if (d !== undefined && d !== null) {
    if (typeof d !== "number") return null;
    values.durationDays = d;
  }

  if (raw.consent !== undefined && typeof raw.consent !== "boolean") return null;
  values.consent = raw.consent === true;

  values.source = raw.source === "ai_assisted" ? "ai_assisted" : "manual";

  const hp = raw.website;
  if (hp !== undefined && typeof hp !== "string") return null;
  return { values, honeypot: typeof hp === "string" ? hp : "" };
}

export function validateRequest(
  v: RequestValues,
  today: string,
): RequestErrors {
  const e: RequestErrors = {};

  if (v.description.length < DESCRIPTION_MIN) {
    e.description = `Please describe the situation in at least ${DESCRIPTION_MIN} characters.`;
  } else if (v.description.length > DESCRIPTION_MAX) {
    e.description = `Please keep the description under ${DESCRIPTION_MAX} characters.`;
  }

  if (v.name.length > 80) e.name = "Name must be 80 characters or fewer.";

  if (!v.phone) e.phone = "Please enter a mobile number we can reach you on.";
  else if (!isValidIndianMobile(v.phone)) {
    e.phone =
      "Enter a 10-digit Indian mobile number starting with 6-9, with optional +91.";
  }

  if (!(TRADES as readonly string[]).includes(v.trade)) {
    e.trade = "Please choose the trade you need.";
  }

  if (!v.area) e.area = "Please enter the Pune locality of the site.";
  else if (!isValidLocality(v.area)) {
    e.area = "Use 2-60 letters, numbers or basic punctuation.";
  }

  if (v.startDate) {
    if (!isRealDate(v.startDate)) e.startDate = "Please enter a valid date.";
    else if (v.startDate < today) e.startDate = "The date cannot be in the past.";
  }

  if (v.durationDays !== null) {
    if (
      !Number.isInteger(v.durationDays) ||
      v.durationDays < 1 ||
      v.durationDays > DURATION_MAX_DAYS
    ) {
      e.durationDays = `Enter a whole number of days from 1 to ${DURATION_MAX_DAYS}.`;
    }
  }

  if (v.notes.length > NOTES_MAX) {
    e.notes = `Notes must be ${NOTES_MAX} characters or fewer.`;
  }

  if (!v.consent) e.consent = "Consent is required to submit a request.";

  return e;
}

// ---------------------------------------------------------------------------
// Requests tab
// ---------------------------------------------------------------------------

// Column headers, left to right, in row 1 of the "Requests" tab. The server
// refuses to write if the Sheet does not match.
export const REQUEST_HEADERS = [
  "request_id",
  "record_type",
  "created_at",
  "developer_name",
  "contact_phone",
  "description",
  "trade",
  "service_area",
  "start_date",
  "duration_days",
  "notes",
  "extraction_source",
  "consent_version",
  "consent_text",
  "consent_timestamp",
  "status",
  "founder_notes",
] as const;

// Builds one Sheet row from VALIDATED values. `id` and `nowIso` come from the
// server. Status starts as "New requirement"; only the founder changes it.
export function buildRequestRow(
  v: RequestValues,
  meta: { id: string; recordType: RecordType; nowIso: string },
): string[] {
  const cells: Record<(typeof REQUEST_HEADERS)[number], string> = {
    request_id: meta.id,
    record_type: meta.recordType,
    created_at: meta.nowIso,
    developer_name: neutralizeCell(v.name),
    contact_phone: normalizePhone(v.phone),
    description: neutralizeCell(v.description),
    trade: v.trade,
    service_area: neutralizeCell(canonicalArea(v.area.trim())),
    start_date: v.startDate,
    duration_days: v.durationDays === null ? "" : String(v.durationDays),
    notes: neutralizeCell(v.notes),
    extraction_source: v.source,
    consent_version: REQUEST_CONSENT_VERSION,
    consent_text: REQUEST_CONSENT_TEXT,
    consent_timestamp: meta.nowIso,
    status: "New requirement",
    founder_notes: "",
  };
  return REQUEST_HEADERS.map((h) => cells[h]);
}
