// Server-only: the public "Contact us" form. Each message is saved as one row
// in Supabase (table contact_messages, Row-Level Security on: the public key
// may only INSERT, never read), then two emails are sent through Gmail: a
// notification to the site owner and an automatic acknowledgement to the
// person who wrote. Logs hold short labels only, never names, emails or text.
import nodemailer from "nodemailer";

export const CONTACT_LIMITS = { name: [2, 80], message: [10, 2000] } as const;
export type ContactValues = { name: string; email: string; message: string };
export type ContactErrors = Partial<Record<keyof ContactValues, string>>;

const clean = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim() : "");
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

// Checks an untrusted body. `honeypot` is a hidden field real people leave empty.
export function validateContact(input: unknown): { ok: true; values: ContactValues; honeypot: string } | { ok: false; errors: ContactErrors } | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const values = { name: clean(raw.name).replace(/\s+/g, " "), email: clean(raw.email).toLowerCase(), message: clean(raw.message) };
  const errors: ContactErrors = {};
  const [nMin, nMax] = CONTACT_LIMITS.name;
  const [mMin, mMax] = CONTACT_LIMITS.message;
  if (values.name.length < nMin || values.name.length > nMax) errors.name = `Please enter your name (${nMin}–${nMax} characters).`;
  if (values.email.length > 254 || !EMAIL.test(values.email)) errors.email = "Please enter a valid email address.";
  if (values.message.length < mMin || values.message.length > mMax) errors.message = `Please write ${mMin}–${mMax} characters.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, values, honeypot: clean(raw.website) };
}

export type ContactEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  gmailUser: string;
  gmailAppPassword: string;
  notifyTo: string;
};

export function contactEnv(env: Record<string, string | undefined> = process.env): ContactEnv | null {
  const pick = (k: string) => (env[k] ?? "").trim();
  const e = {
    supabaseUrl: pick("SUPABASE_URL").replace(/\/+$/, ""),
    supabaseAnonKey: pick("SUPABASE_ANON_KEY"),
    gmailUser: pick("GMAIL_USER"),
    gmailAppPassword: pick("GMAIL_APP_PASSWORD").replace(/\s+/g, ""),
    notifyTo: pick("CONTACT_NOTIFY_TO") || pick("GMAIL_USER"),
  };
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(e.supabaseUrl) || !e.supabaseAnonKey) return null;
  if (!e.gmailUser || !e.gmailAppPassword || !e.notifyTo) return null;
  return e;
}

// Inserts one row with the public (anon) key. RLS allows INSERT only, so we ask
// for no row back ("return=minimal"): reading rows is not allowed by design.
export async function saveContactMessage(env: ContactEnv, values: ContactValues, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(`${env.supabaseUrl}/rest/v1/contact_messages`, {
    method: "POST",
    headers: {
      apikey: env.supabaseAnonKey,
      Authorization: `Bearer ${env.supabaseAnonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ name: values.name, email: values.email, message: values.message, source: "website" }),
  });
  if (!res.ok) throw Object.assign(new Error("supabase_insert_failed"), { status: res.status });
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function ownerEmail(values: ContactValues) {
  return {
    subject: `New message from ${values.name} – Mera Karigar`,
    text: `New message from the Mera Karigar website.\n\nName: ${values.name}\nEmail: ${values.email}\n\n${values.message}\n`,
    html: `<p>New message from the Mera Karigar website.</p><p><b>Name:</b> ${escapeHtml(values.name)}<br><b>Email:</b> ${escapeHtml(values.email)}</p><p style="white-space:pre-wrap">${escapeHtml(values.message)}</p>`,
  };
}

export function ackEmail(values: ContactValues) {
  const first = values.name.split(" ")[0];
  return {
    subject: "We got your message – Mera Karigar",
    text: `Hi ${first},\n\nThanks for writing to Mera Karigar. We have received your message and will reply within 1–2 working days.\n\nYour message:\n${values.message}\n\nMera Karigar\nhttps://contractor-desk-nu.vercel.app\n`,
    html: `<p>Hi ${escapeHtml(first)},</p><p>Thanks for writing to <b>Mera Karigar</b>. We have received your message and will reply within 1–2 working days.</p><p style="color:#6b6b6b">Your message:</p><blockquote style="white-space:pre-wrap;border-left:3px solid #F0542D;margin:0;padding-left:12px">${escapeHtml(values.message)}</blockquote><p>Mera Karigar<br><a href="https://contractor-desk-nu.vercel.app">contractor-desk-nu.vercel.app</a></p>`,
  };
}

export type Mailer = { sendMail(message: { from: string; to: string; replyTo?: string; subject: string; text: string; html: string }): Promise<unknown> };

export function gmailMailer(env: ContactEnv): Mailer {
  return nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: env.gmailUser, pass: env.gmailAppPassword } });
}

// Sends both emails. Each is tried on its own, so one failing never blocks the other.
export async function sendContactEmails(env: ContactEnv, values: ContactValues, mailer: Mailer): Promise<{ owner: boolean; ack: boolean }> {
  const from = `Mera Karigar <${env.gmailUser}>`;
  const [owner, ack] = await Promise.allSettled([
    mailer.sendMail({ from, to: env.notifyTo, replyTo: values.email, ...ownerEmail(values) }),
    mailer.sendMail({ from, to: values.email, ...ackEmail(values) }),
  ]);
  return { owner: owner.status === "fulfilled", ack: ack.status === "fulfilled" };
}
