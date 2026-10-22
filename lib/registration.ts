// Options and validation rules for the contractor registration form.
// Its only import is the dependency-free language helper, so the rules can be
// tested on their own.
import { canonicalLocality } from "./language";

export const TRADES = [
  "Masonry",
  "Electrical",
  "Plumbing",
  "Painting",
  "Carpentry",
  "Other",
] as const;

// Starter list. Edit freely; people can also type another locality.
export const PUNE_AREAS = [
  "Baner",
  "Hinjawadi",
  "Wakad",
  "Kharadi",
  "Hadapsar",
  "Kothrud",
] as const;

export const OTHER_AREA = "Other";

export const AVAILABILITY_OPTIONS = [
  { value: "now", label: "Available now" },
  { value: "from_date", label: "Available from a specific date" },
  { value: "unavailable", label: "Currently unavailable" },
] as const;

export const CONSENT_TEXT =
  "I agree that my contact details will be stored privately and may be shared with relevant developers for contractor work opportunities. I understand that I can request deletion of my details.";

// Bump this version whenever CONSENT_TEXT changes. It is stored with each
// record so we know exactly which wording a contractor agreed to.
export const CONSENT_VERSION = "v1-2026-10-21";

export type FormValues = {
  name: string;
  trade: string;
  area: string;
  otherArea: string;
  availability: string;
  availabilityDate: string;
  phone: string;
  consent: boolean;
};

export type FormErrors = Partial<Record<keyof FormValues, string>>;

export const emptyValues: FormValues = {
  name: "",
  trade: "",
  area: "",
  otherArea: "",
  availability: "",
  availabilityDate: "",
  phone: "",
  consent: false,
};

// Indian mobile: optional +91 (or 91), then 10 digits starting 6-9.
// Spaces and hyphens are allowed while typing.
export function isValidIndianMobile(input: string): boolean {
  const compact = input.replace(/[\s-]/g, "");
  return /^(\+91|91)?[6-9]\d{9}$/.test(compact);
}

// Canonical storage format: +91 followed by the 10 digits.
// Only call this after isValidIndianMobile() has passed.
export function normalizePhone(input: string): string {
  const compact = input.replace(/[\s-]/g, "");
  return `+91${compact.slice(-10)}`;
}

// Today's date as YYYY-MM-DD in India. Used on the server, whose own clock
// may be in another timezone (Vercel runs in UTC).
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// Today's date as YYYY-MM-DD in the user's local time.
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// True only for a real calendar date written as YYYY-MM-DD.
export function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export function validate(
  values: FormValues,
  today: string = localToday(),
): FormErrors {
  const errors: FormErrors = {};

  if (!values.name.trim()) {
    errors.name = "Please enter your name.";
  } else if (values.name.trim().length > 80) {
    errors.name = "Name must be 80 characters or fewer.";
  }

  if (!(TRADES as readonly string[]).includes(values.trade)) {
    errors.trade = "Please choose your primary trade.";
  }

  if (!values.area) {
    errors.area = "Please choose your service area.";
  } else if (values.area === OTHER_AREA) {
    const other = values.otherArea.trim();
    if (other.length < 2) {
      errors.otherArea = "Please enter the Pune locality you serve.";
    } else if (other.length > 60) {
      errors.otherArea = "Locality must be 60 characters or fewer.";
    } else if (!/^[\p{L}\p{M}\p{N}\s.,'()-]+$/u.test(other)) {
      errors.otherArea = "Use letters, numbers and basic punctuation only.";
    }
  } else if (!(PUNE_AREAS as readonly string[]).includes(values.area)) {
    errors.area = "Please choose a service area from the list.";
  }

  const allowed = AVAILABILITY_OPTIONS.map((o) => o.value as string);
  if (!allowed.includes(values.availability)) {
    errors.availability = "Please tell us your availability.";
  } else if (values.availability === "from_date") {
    if (!values.availabilityDate) {
      errors.availabilityDate = "Please choose the date you become available.";
    } else if (!isRealDate(values.availabilityDate)) {
      errors.availabilityDate = "Please enter a valid date.";
    } else if (values.availabilityDate < today) {
      errors.availabilityDate = "The date cannot be in the past.";
    }
  }

  if (!values.phone.trim()) {
    errors.phone = "Please enter your mobile number.";
  } else if (!isValidIndianMobile(values.phone)) {
    errors.phone =
      "Enter a 10-digit Indian mobile number starting with 6-9, with optional +91.";
  }

  if (!values.consent) {
    errors.consent = "Consent is required to register.";
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Server-side helpers. The browser form is only a convenience: the server
// re-checks everything it receives with the functions below.
// ---------------------------------------------------------------------------

const MAX_FIELD_LENGTH = 200;
const TEXT_FIELDS = [
  "name",
  "trade",
  "area",
  "otherArea",
  "availability",
  "availabilityDate",
  "phone",
] as const;

// Remove control characters (including newlines) and collapse extra spaces.
export function cleanText(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Turns an untrusted request body into FormValues, or null if its shape is
// wrong (not an object, wrong types, absurdly long text). Unknown fields are
// ignored. `honeypot` is a hidden field that real people never fill in.
export function parseSubmission(
  body: unknown,
): { values: FormValues; honeypot: string } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const raw = body as Record<string, unknown>;

  const values: FormValues = { ...emptyValues };
  for (const key of TEXT_FIELDS) {
    const v = raw[key];
    if (v === undefined) continue;
    if (typeof v !== "string" || v.length > MAX_FIELD_LENGTH) return null;
    values[key] = cleanText(v);
  }

  // Consent must be the real boolean true. "true", 1 or "on" do not count.
  if (raw.consent !== undefined && typeof raw.consent !== "boolean") return null;
  values.consent = raw.consent === true;

  const hp = raw.website;
  if (hp !== undefined && typeof hp !== "string") return null;

  return { values, honeypot: typeof hp === "string" ? hp : "" };
}

// Order matters: these are the column headers, left to right, in row 1 of the
// "Contractors" tab. The server refuses to write if the Sheet does not match.
export const CONTRACTOR_HEADERS = [
  "contractor_id",
  "record_type",
  "created_at",
  "name",
  "primary_trade",
  "service_areas",
  "availability_status",
  "earliest_start_date",
  "phone",
  "consent_version",
  "consent_text",
  "consent_timestamp",
  "availability_reported_at",
  "last_availability_confirmed_at",
  "deletion_requested_at",
  "founder_notes",
] as const;

export type RecordType = "TEST" | "REAL";

// Stops spreadsheet programs treating typed text as a formula
// (for example a name like =HYPERLINK(...)) if the data is exported later.
export function neutralizeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

// Builds one Sheet row from VALIDATED values. `id` and `nowIso` come from the
// server, never from the browser. The "last_availability_confirmed_at" column
// stays blank: only the founder fills it after confirming by phone.
export function buildContractorRow(
  values: FormValues,
  meta: { id: string; recordType: RecordType; nowIso: string },
): string[] {
  // A known locality typed in Hindi or Marathi is stored with its English
  // spelling, so matching compares one spelling. Anything else is kept as typed.
  const area = values.area === OTHER_AREA ? canonicalLocality(values.otherArea) : values.area;
  const cells: Record<(typeof CONTRACTOR_HEADERS)[number], string> = {
    contractor_id: meta.id,
    record_type: meta.recordType,
    created_at: meta.nowIso,
    name: neutralizeCell(values.name),
    primary_trade: values.trade,
    service_areas: neutralizeCell(area),
    availability_status: values.availability,
    earliest_start_date:
      values.availability === "from_date" ? values.availabilityDate : "",
    phone: normalizePhone(values.phone),
    consent_version: CONSENT_VERSION,
    consent_text: CONSENT_TEXT,
    consent_timestamp: meta.nowIso,
    availability_reported_at: meta.nowIso,
    last_availability_confirmed_at: "",
    deletion_requested_at: "",
    founder_notes: "",
  };
  return CONTRACTOR_HEADERS.map((h) => cells[h]);
}
