// Contractor messages: what may be said, how a draft is checked, how the
// WhatsApp link is built, and when a link may point at a real phone number.
// Pure logic: no secrets, no network, no logging.
import { isValidIndianMobile, normalizePhone, type RecordType } from "./registration";

export const NAME_PLACEHOLDER = "{{name}}";
export const DRAFT_MAX = 700; // longest message an AI draft may be
export const EDIT_MAX = 1000; // longest message a person may send after editing
const MAX_LINK_LENGTH = 4000;
export const TEST_PREFIX = "[TEST MESSAGE - not a real request] ";

// The only facts a message may state. They come from the request the developer
// reviewed and saved. The contractor's name and phone are never part of this.
export type MessageFacts = {
  trade: string;
  area: string;
  startDate: string; // YYYY-MM-DD or ""
  durationDays: number | null;
  notes: string;
};

// "2030-03-04" -> "4 March 2030"
export function formatLongDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+05:30`));
}

export function describeFacts(f: MessageFacts) {
  return {
    trade: f.trade,
    area: f.area,
    start: f.startDate ? formatLongDate(f.startDate) : null,
    duration: f.durationDays ? `about ${f.durationDays} days` : null,
    notes: f.notes.trim() || null,
  };
}

// Numbers a draft may contain: only those that already appear in the facts.
function allowedNumbers(f: MessageFacts): Set<string> {
  const d = describeFacts(f);
  const text = [d.area, d.start ?? "", d.duration ?? "", d.notes ?? ""].join(" ");
  const set = new Set<string>();
  for (const token of text.match(/\d+/g) ?? []) set.add(String(Number(token)));
  return set;
}

// Words that would state money, commitments or certainty we do not have.
const FORBIDDEN =
  /₹|\brs\b\.?|\binr\b|rupee|\brates?\b|\bprices?\b|\bpay(?:ment|ing|s)?\b|\bpaid\b|\bbudget\b|\badvance\b|\bsalary\b|\bwages?\b|\bcosts?\b|\bfees?\b|\bcommission\b|\bguarantee[sd]?\b|\bverified\b|\bvetted\b|\binsured\b|\bconfirmed\b|\bcontract\b|\bagree(?:d|ment)?\b|\bpromise[sd]?\b|\burgent(?:ly)?\b|\bimmediately\b|\bselected\b|\bshortlisted\b/i;

export type DraftProblem =
  | "empty"
  | "too_long"
  | "placeholder"
  | "link_or_email"
  | "phone_number"
  | "invented_number"
  | "forbidden_wording"
  | "formatting";

// Checks an AI-written draft against the facts. A draft that fails any check is
// thrown away and replaced by the fixed template, never repaired or shown.
export function validateDraft(
  text: unknown,
  facts: MessageFacts,
): { ok: true; text: string } | { ok: false; problem: DraftProblem } {
  if (typeof text !== "string" || text.trim().length < 20) {
    return { ok: false, problem: "empty" };
  }
  const t = text.trim();
  if (t.length > DRAFT_MAX) return { ok: false, problem: "too_long" };

  const placeholders = t.match(/\{\{[^}]*\}\}?/g) ?? [];
  if (placeholders.length !== 1 || placeholders[0] !== NAME_PLACEHOLDER) {
    return { ok: false, problem: "placeholder" };
  }
  if (/https?:\/\/|www\.|@/i.test(t)) return { ok: false, problem: "link_or_email" };
  if (/\d{7,}/.test(t) || /(?:\d[\s().-]?){8,}/.test(t)) {
    return { ok: false, problem: "phone_number" };
  }
  const allowed = allowedNumbers(facts);
  for (const token of t.match(/\d+/g) ?? []) {
    if (!allowed.has(String(Number(token)))) {
      return { ok: false, problem: "invented_number" };
    }
  }
  if (FORBIDDEN.test(t)) return { ok: false, problem: "forbidden_wording" };
  if (/\*\*|__|`/.test(t)) return { ok: false, problem: "formatting" };
  return { ok: true, text: t };
}

// Fixed wording used when no AI draft is available or the draft was rejected.
// It states only the saved facts and asks a question; it promises nothing.
export function buildTemplate(facts: MessageFacts): string {
  const d = describeFacts(facts);
  const details = [
    `a possible ${d.trade} job in ${d.area}`,
    d.start ? `needed from ${d.start}` : null,
    d.duration ? `for ${d.duration}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return [
    `Hello ${NAME_PLACEHOLDER},`,
    "",
    `I am getting in touch about ${details}. You registered your details with us for work opportunities.`,
    "",
    "Are you available and interested? If so, please reply and I can share more details.",
    "",
    "Thank you.",
  ].join("\n");
}

// Fills the greeting with the contractor's name, on our server only.
export function fillName(template: string, name: string): string {
  const clean =
    name
      .replace(/\{\{|\}\}/g, "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "there";
  return template.split(NAME_PLACEHOLDER).join(clean);
}

// Test records always carry a visible TEST label at the start of the message.
export function applyTestPrefix(message: string, recordType: RecordType): string {
  if (recordType !== "TEST") return message;
  return message.startsWith(TEST_PREFIX) ? message : TEST_PREFIX + message;
}

// Checks the text the person reviewed and edited before a link is made.
export function cleanEditedMessage(
  input: unknown,
): { ok: true; text: string } | { ok: false; problem: "empty" | "too_long" | "placeholder" } {
  if (typeof input !== "string") return { ok: false, problem: "empty" };
  const text = input
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length < 10) return { ok: false, problem: "empty" };
  if (text.length > EDIT_MAX) return { ok: false, problem: "too_long" };
  if (text.includes("{{") || text.includes("}}")) {
    return { ok: false, problem: "placeholder" };
  }
  return { ok: true, text };
}

// https://wa.me/<digits only>?text=<encoded message>. Returns null if the phone
// number is not a valid Indian mobile or the link would be unreasonably long.
export function buildWhatsAppLink(phone: string, message: string): string | null {
  if (!isValidIndianMobile(phone)) return null;
  const digits = normalizePhone(phone).slice(1); // drop "+", keep 91XXXXXXXXXX
  // encodeURIComponent leaves ! ' ( ) * as they are; encode those too so the
  // text can never be mistaken for anything but plain message text.
  const text = encodeURIComponent(message).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const url = `https://wa.me/${digits}?text=${text}`;
  return url.length > MAX_LINK_LENGTH ? null : url;
}

export type Destination =
  | { kind: "contractor"; phone: string }
  | { kind: "test"; phone: string }
  | {
      kind: "blocked";
      reason: "no_phone" | "test_contact_not_set" | "real_not_allowed";
    };

// Decides whose phone number a link may use. A TEST record can never lead to
// the contractor's own number: it goes to the founder's own test number, or
// nowhere. A REAL record needs a real-data production server.
export function chooseDestination(input: {
  recordType: string;
  contractorPhone: string;
  testContactPhone: string;
  realContactAllowed: boolean;
}): Destination {
  if (input.recordType === "TEST") {
    return isValidIndianMobile(input.testContactPhone)
      ? { kind: "test", phone: input.testContactPhone }
      : { kind: "blocked", reason: "test_contact_not_set" };
  }
  if (input.recordType === "REAL") {
    if (!input.realContactAllowed) {
      return { kind: "blocked", reason: "real_not_allowed" };
    }
    return isValidIndianMobile(input.contractorPhone)
      ? { kind: "contractor", phone: input.contractorPhone }
      : { kind: "blocked", reason: "no_phone" };
  }
  return { kind: "blocked", reason: "real_not_allowed" };
}
