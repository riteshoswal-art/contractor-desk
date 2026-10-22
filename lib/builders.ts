// Server-only: builders (developers) for the LIVE DEMO (fixture mode).
//
// There are no full builder accounts yet. A builder registers with a name,
// optional company and mobile number; their browser then holds a random session
// token in a cookie (only its SHA-256 digest is stored here). Tickets they raise
// are ordinary requests, checked by the same rules as the public request form,
// and are remembered as theirs so their bids can go to THEIR Telegram chat.
import { createHash, randomBytes } from "node:crypto";
import type { ContractorSheet } from "./contractor-store";
import { demoState, updateDemo, type Builder } from "./demo-store";
import { isValidIndianMobile, normalizePhone, todayInIndia, type RecordType } from "./registration";
import { parseRequestSubmission, validateRequest, type RequestErrors } from "./request";
import { saveRequest } from "./request-store";

export const BUILDER_COOKIE = "cd_builder";
const digest = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
const clean = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "");

export type BuilderErrors = Partial<Record<"name" | "company" | "phone" | "consent", string>>;

export function validateBuilder(input: unknown): { ok: true; value: Omit<Builder, "id" | "createdAt"> } | { ok: false; errors: BuilderErrors } {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const name = clean(raw.name);
  const company = clean(raw.company);
  const phone = clean(raw.phone);
  const errors: BuilderErrors = {};
  if (name.length < 2) errors.name = "Please enter your name.";
  else if (name.length > 80) errors.name = "Name must be 80 characters or fewer.";
  if (company.length > 80) errors.company = "Company must be 80 characters or fewer.";
  if (!phone) errors.phone = "Please enter your mobile number.";
  else if (!isValidIndianMobile(phone)) errors.phone = "Enter a 10-digit Indian mobile number starting with 6-9, with optional +91.";
  if (raw.consent !== true) errors.consent = "Consent is required to register.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, company, phone: normalizePhone(phone) } };
}

// Registers a builder and returns the raw session token (for the cookie). It is
// shown nowhere else and only its digest is kept.
export function registerBuilder(value: Omit<Builder, "id" | "createdAt">, newId: () => string, now = new Date()): { builder: Builder; token: string } {
  const builder: Builder = { id: newId(), ...value, createdAt: now.toISOString() };
  const token = randomBytes(32).toString("base64url");
  updateDemo((s) => {
    s.builders[builder.id] = builder;
    s.builderSessions[digest(token)] = builder.id;
  });
  return { builder, token };
}

export function builderForSession(token: string | undefined): Builder | null {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const id = demoState().builderSessions[digest(token)];
  return (id && demoState().builders[id]) || null;
}

export type TicketResult = { ok: true; id: string } | { ok: false; error: "validation"; errors: RequestErrors } | { ok: false; error: "invalid" };

// The builder's ticket: their name and number come from their registration;
// everything else is checked exactly like the public request form. Matching
// needs a date, so a demo ticket always has one.
export async function raiseTicket(
  sheet: ContractorSheet,
  builder: Builder,
  input: unknown,
  env: { recordType: RecordType; now?: Date },
  newId: () => string,
): Promise<TicketResult> {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const parsed = parseRequestSubmission({ ...raw, name: builder.company ? `${builder.name} (${builder.company})` : builder.name, phone: builder.phone });
  if (!parsed) return { ok: false, error: "invalid" };
  const now = env.now ?? new Date();
  const errors = validateRequest(parsed.values, todayInIndia(now));
  if (!parsed.values.startDate && !errors.startDate) errors.startDate = "Please choose the date the work must start.";
  if (Object.keys(errors).length) return { ok: false, error: "validation", errors };
  const id = newId();
  await saveRequest(sheet, parsed.values, { id, recordType: env.recordType, nowIso: now.toISOString() });
  updateDemo((s) => {
    s.ticketBuilder[id] = builder.id;
  });
  return { ok: true, id };
}
