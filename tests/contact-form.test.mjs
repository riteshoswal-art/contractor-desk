// The "Contact us" form: validation, the Supabase insert (public key, RLS
// insert-only, no row read back), and the two emails. Fakes only: nothing here
// calls Supabase or Gmail.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { ackEmail, contactEnv, ownerEmail, saveContactMessage, sendContactEmails, validateContact } from "../lib/contact-form.ts";

const ENV = { supabaseUrl: "https://abcxyz.supabase.co", supabaseAnonKey: "anon-key", gmailUser: "owner@gmail.com", gmailAppPassword: "abcdabcdabcdabcd", notifyTo: "owner@gmail.com" };
const GOOD = { name: "Neha Joshi", email: "Neha@Example.com", message: "Do you cover plumbers in Wakad?", website: "" };

test("valid messages are cleaned; bad ones get a reason per field", () => {
  const ok = validateContact(GOOD);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.values, { name: "Neha Joshi", email: "neha@example.com", message: "Do you cover plumbers in Wakad?" });
  const bad = validateContact({ name: "N", email: "not-an-email", message: "hi" });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ["email", "message", "name"]);
  assert.equal(validateContact("nope"), null);
  assert.equal(validateContact([1]), null);
  assert.equal(validateContact({ ...GOOD, website: "spam.example" }).honeypot, "spam.example");
});

test("settings: all five are needed, and the Supabase address must be a project URL", () => {
  const base = { SUPABASE_URL: "https://abcxyz.supabase.co/", SUPABASE_ANON_KEY: "k", GMAIL_USER: "me@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop" };
  const e = contactEnv(base);
  assert.equal(e.supabaseUrl, "https://abcxyz.supabase.co");
  assert.equal(e.gmailAppPassword, "abcdefghijklmnop", "spaces in the app password are removed");
  assert.equal(e.notifyTo, "me@gmail.com", "notifications go to the Gmail account by default");
  assert.equal(contactEnv({ ...base, SUPABASE_URL: "http://evil.example" }), null);
  assert.equal(contactEnv({ ...base, GMAIL_APP_PASSWORD: "" }), null);
});

test("saving posts one row with the public key and asks for nothing back (RLS insert-only)", async () => {
  const calls = [];
  const fake = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 201 }; };
  await saveContactMessage(ENV, validateContact(GOOD).values, fake);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://abcxyz.supabase.co/rest/v1/contact_messages");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.apikey, "anon-key");
  assert.equal(calls[0].init.headers.Prefer, "return=minimal");
  assert.deepEqual(JSON.parse(calls[0].init.body), { name: "Neha Joshi", email: "neha@example.com", message: "Do you cover plumbers in Wakad?", source: "website" });
});

test("a refused insert is an error carrying only the status", async () => {
  const fake = async () => ({ ok: false, status: 401 });
  await assert.rejects(saveContactMessage(ENV, validateContact(GOOD).values, fake), (e) => e.status === 401 && e.message === "supabase_insert_failed");
});

test("two emails: owner notification (reply-to the writer) and an acknowledgement to the writer", async () => {
  const sent = [];
  const r = await sendContactEmails(ENV, validateContact(GOOD).values, { sendMail: async (m) => sent.push(m) });
  assert.deepEqual(r, { owner: true, ack: true });
  const owner = sent.find((m) => m.to === "owner@gmail.com");
  const ack = sent.find((m) => m.to === "neha@example.com");
  assert.equal(owner.replyTo, "neha@example.com");
  assert.match(owner.text, /Do you cover plumbers in Wakad\?/);
  assert.match(ack.subject, /We got your message/);
  assert.match(ack.text, /^Hi Neha,/);
});

test("one email failing does not stop the other", async () => {
  const r = await sendContactEmails(ENV, validateContact(GOOD).values, {
    sendMail: async (m) => { if (m.to === "owner@gmail.com") throw new Error("smtp"); },
  });
  assert.deepEqual(r, { owner: false, ack: true });
});

test("email HTML escapes what people type", () => {
  const v = { name: "<b>x</b>", email: "a@b.co", message: "<script>alert(1)</script> hello there" };
  assert.ok(!ownerEmail(v).html.includes("<script>"));
  assert.ok(!ackEmail(v).html.includes("<b>x</b>"));
});

test("the table SQL turns RLS on and allows the website to INSERT only", () => {
  const sql = fs.readFileSync("supabase/contact_messages.sql", "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /for insert\s+to anon/);
  assert.ok(!/for (select|update|delete|all)/i.test(sql), "no read/change policy for the public key");
});

test("the home page shows the form, and the route never logs personal details", () => {
  assert.match(fs.readFileSync("app/page.tsx", "utf8"), /<ContactForm \/>/);
  const route = fs.readFileSync("app/api/contact/route.ts", "utf8");
  for (const line of route.match(/console\.error\([^)]*\)/g) ?? []) assert.ok(!/values|email|name|message/.test(line.replace(/_email_/g, "")), line);
});
