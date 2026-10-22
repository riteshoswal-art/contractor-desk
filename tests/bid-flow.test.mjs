// Bidding as a person meets it: admin-only actions, the public bid action, the
// bid form in English/Hindi/Marathi, the admin comparison panel, and checks that
// no public route can read bids. Pretend Sheet; synthetic data only.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as bidActions from "../app/admin/requests/[id]/bid-actions.ts";
import * as jobActions from "../app/admin/requests/[id]/job-actions.ts";
import { loadBidWorkspace } from "../app/admin/requests/[id]/bid-data.ts";
import BidPanel from "../app/admin/requests/[id]/BidPanel.tsx";
import { submitBidAction } from "../app/bid/[token]/actions.ts";
import BidForm from "../app/bid/[token]/BidForm.tsx";
import * as B from "../lib/bid.ts";
import { BID_INVITE_TABLE } from "../lib/bid-invite.ts";
import { loadBids } from "../lib/bid-store.ts";
import { CONFIRMATION_TABLE } from "../lib/confirmation.ts";
import { setContractorSheetForTests } from "../lib/google-sheets.ts";
import { getDict, translateMessage } from "../lib/i18n.ts";
import { INVITE_TABLE, generateToken } from "../lib/invite.ts";
import { JOB_TABLE } from "../lib/job.ts";
import { loadJobs } from "../lib/job-store.ts";
import { LANGUAGE_TABLE } from "../lib/language-store.ts";
import { loadContractors, loadRequests } from "../lib/records.ts";
import { CONTRACTOR_HEADERS } from "../lib/registration.ts";
import { REQUEST_HEADERS } from "../lib/request.ts";
import { REVIEW_TABLE } from "../lib/review.ts";
import { readTable } from "../lib/tables.ts";
import { makeSheet } from "./helpers/fakes.mjs";
import { resetRequestState, setCookie, setRequestHeader } from "./stubs/next-headers.mjs";

const PASSWORD = "synthetic-test-password";
const SECRET = "synthetic-secret-synthetic-secret-0123456789";
const TABLES = [CONFIRMATION_TABLE, LANGUAGE_TABLE, JOB_TABLE, INVITE_TABLE, REVIEW_TABLE, B.BID_TABLE, BID_INVITE_TABLE];
const A = "C-22222222";
const N = "C-33333333"; // near-date: one day after the requested date
const REQ = "R-BBBBBBBB";
const TG = { configured: false, testMode: true }; // Telegram demo channel not set up
let ipCounter = 0;

// Real-clock fixtures, so these tests never go stale as the calendar moves on.
const iso = (d = new Date()) => d.toISOString();
const dayStr = (offset) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10);
const cells = (headers, o) => headers.map((h) => o[h] ?? "");
const contractor = (id, name, extra) =>
  cells(CONTRACTOR_HEADERS, {
    contractor_id: id, record_type: "TEST", created_at: iso(), name, primary_trade: "Masonry", service_areas: "Baner",
    availability_status: "now", phone: `+9190000000${id.slice(-1)}1`, consent_version: "v1-2026-10-21", consent_text: "x", consent_timestamp: iso(),
    availability_reported_at: iso(), ...extra,
  });
function world() {
  const request = cells(REQUEST_HEADERS, {
    request_id: REQ, record_type: "TEST", created_at: iso(), developer_name: "TEST Developer", contact_phone: "+919000000002",
    description: "TEST ONLY: fictional job", trade: "Masonry", service_area: "Baner", start_date: dayStr(5), duration_days: "7", status: "New requirement",
  });
  return makeSheet({
    contractors: [
      contractor(A, "Asha Test"),
      contractor(N, "Bhim Test", { availability_status: "from_date", earliest_start_date: dayStr(6) }),
    ],
    requests: [request],
    tables: TABLES,
  });
}

const token = (expiry = String(Math.floor(Date.now() / 1000) + 3600)) =>
  `${expiry}.${createHmac("sha256", SECRET).update(`admin:${expiry}`).digest("base64url")}`;
const asAdmin = () => setCookie("cd_admin", token());
const redirectOf = async (fn) => {
  try { await fn(); } catch (error) { if (error?.redirectUrl) return error.redirectUrl; throw error; }
  return null;
};
const guestMode = () => { resetRequestState(); setRequestHeader("x-forwarded-for", `203.0.113.${++ipCounter}`); };

beforeEach(() => {
  resetRequestState();
  process.env.NODE_ENV = "test";
  process.env.ADMIN_PASSWORD = PASSWORD;
  process.env.ADMIN_SESSION_SECRET = SECRET;
  delete process.env.REGISTRATION_RECORD_TYPE;
  setRequestHeader("x-forwarded-for", `198.51.100.${++ipCounter}`);
  setRequestHeader("host", "localhost:3000");
  setContractorSheetForTests(null);
});

// ============================ admin-only actions ============================
const ACTION_CALLS = {
  open: () => bidActions.openBiddingAction(REQ, ""),
  close: () => bidActions.closeBiddingAction(REQ),
  reopen: () => bidActions.reopenBiddingAction(REQ, "A good enough reason", ""),
  cancel: () => bidActions.cancelBiddingAction(REQ, "A good enough reason"),
  invite: () => bidActions.createBidInviteAction(REQ, A),
  select: () => bidActions.selectBidderAction(REQ, "B-AAAAAAAB"),
  correct: () => bidActions.correctBidAction(REQ, "B-AAAAAAAB", { amount: "1", unit: "per_day" }, "A good enough reason"),
  void: () => bidActions.voidBidAction(REQ, "B-AAAAAAAB", "A good enough reason"),
  notify: () => bidActions.notifyViaTelegramAction(REQ, [A]),
};

test("every admin bidding action sends a visitor who is not logged in to the login page and writes nothing", async () => {
  const sheet = world(); setContractorSheetForTests(sheet);
  for (const [name, call] of Object.entries(ACTION_CALLS)) assert.equal(await redirectOf(call), "/admin/login", name);
  for (const bad of ["9999999999.fake", "garbage", token(String(Math.floor(Date.now() / 1000) - 10))]) {
    setCookie("cd_admin", bad);
    for (const [name, call] of Object.entries(ACTION_CALLS)) assert.equal(await redirectOf(call), "/admin/login", `${name} with ${bad.slice(0, 12)}`);
  }
  assert.equal(sheet.appended.length, 0, "nothing was written");
  assert.deepEqual(sheet.updated, []);
});

test("the source of every exported admin bidding action goes through the admin guard", () => {
  const source = fs.readFileSync(new URL("../app/admin/requests/[id]/bid-actions.ts", import.meta.url), "utf8");
  assert.ok(source.includes("await requireAdmin();"));
  const exported = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(exported.sort(), Object.keys(ACTION_CALLS).map((k) => ({ open: "openBiddingAction", close: "closeBiddingAction", reopen: "reopenBiddingAction", cancel: "cancelBiddingAction", invite: "createBidInviteAction", select: "selectBidderAction", correct: "correctBidAction", void: "voidBidAction", notify: "notifyViaTelegramAction" })[k]).sort());
  for (const name of exported) {
    const body = source.slice(source.indexOf(`export async function ${name}`)).split(/\nexport async function /)[0];
    assert.ok(body.includes("guarded("), `${name} does not use the admin guard`);
  }
});

// A full local walk through the screens' actions.
async function bidderLink(sheet, contractorId) {
  const made = await bidActions.createBidInviteAction(REQ, contractorId);
  assert.equal(made.ok, true, JSON.stringify(made));
  return made.link.split("/").pop();
}

test("a logged-in admin can open bidding and create a bid link that is shown once, stored only as a digest, and not sent anywhere", async () => {
  const sheet = world(); setContractorSheetForTests(sheet); asAdmin();
  assert.equal((await bidActions.openBiddingAction(REQ, "")).ok, true);
  const made = await bidActions.createBidInviteAction(REQ, A);
  assert.match(made.link, /^http:\/\/localhost:3000\/bid\/[A-Za-z0-9_-]{43}$/);
  const t = made.link.split("/").pop();
  assert.ok(!JSON.stringify(sheet.tabs).includes(t), "only the digest is stored");
  const [row] = await readTable(sheet, BID_INVITE_TABLE);
  assert.match(row.token_hash, /^[0-9a-f]{64}$/);
  assert.equal((await bidActions.createBidInviteAction(REQ, "C-99999999")).error, "not_candidate");

  setRequestHeader("host", "contractor-desk.example.com");
  assert.match((await bidActions.createBidInviteAction(REQ, N)).link, /^https:\/\/contractor-desk\.example\.com\/bid\/[A-Za-z0-9_-]{43}$/);
  setRequestHeader("host", "evil.com/<script>");
  assert.match((await bidActions.createBidInviteAction(REQ, N)).link, /^\/bid\/[A-Za-z0-9_-]{43}$/, "no link is built from an odd address");
});

test("creating a link logs only labels, never the link, and a missing tab is a setup message", async () => {
  const sheet = world(); setContractorSheetForTests(sheet); asAdmin();
  await bidActions.openBiddingAction(REQ, "");
  const lines = []; const saved = { ...console };
  for (const k of ["log", "error", "info", "warn"]) console[k] = (...a) => lines.push(a.join(" "));
  let made, setup;
  try {
    made = await bidActions.createBidInviteAction(REQ, A);
    delete sheet.tabs.Bids;
    setup = await bidActions.openBiddingAction(REQ, "");
  } finally { Object.assign(console, saved); }
  assert.ok(!lines.join("\n").includes(made.link.split("/").pop()));
  assert.deepEqual(setup, { ok: false, error: "setup" });
  assert.ok(lines.every((l) => /^\[admin\/bid\] \w+( tab_not_set_up| failed)$/.test(l)), lines.join(" | "));
});

test("the whole journey through the actions: open, invite two, bid, compare, the near-date one is blocked, select, complete", async () => {
  const sheet = world(); setContractorSheetForTests(sheet); asAdmin();
  await bidActions.openBiddingAction(REQ, "");
  const ta = await bidderLink(sheet, A);
  const tn = await bidderLink(sheet, N);

  guestMode(); // contractors are not logged in as admin
  assert.equal((await submitBidAction(ta, { amount: "20", unit: "per_sqft", notes: "Includes labour" }, "en")).ok, true);
  const near = await submitBidAction(tn, { amount: "1500", unit: "per_day" }, "en");
  assert.deepEqual([near.ok, near.provisional], [true, true]);
  assert.deepEqual(await submitBidAction(ta, { amount: "1", unit: "per_day" }, "en"), { ok: false, error: "already_bid" });

  asAdmin();
  const bids = await loadBids(sheet, "TEST");
  assert.equal(bids.length, 2);
  const bidOf = (id) => bids.find((b) => b.contractorId === id).id;
  const blocked = await bidActions.selectBidderAction(REQ, bidOf(N));
  assert.deepEqual([blocked.ok, blocked.error], [false, "not_confirmed"]);
  assert.deepEqual(await loadJobs(sheet, "TEST"), []);

  const chosen = await bidActions.selectBidderAction(REQ, bidOf(A));
  assert.deepEqual([chosen.ok, chosen.job.contractorId], [true, A]);
  assert.equal((await bidActions.selectBidderAction(REQ, bidOf(N))).error, "already_selected");
  assert.equal((await loadJobs(sheet, "TEST"))[0].contractorId, A);
  assert.equal((await bidActions.openBiddingAction(REQ, "")).error, "already_selected");
});

// ============================ the public bid action ============================
test("a stranger with a wrong, missing or malformed link gets nothing, even with the admin cookie", async () => {
  const sheet = world(); setContractorSheetForTests(sheet); asAdmin();
  await bidActions.openBiddingAction(REQ, "");
  for (const bad of [undefined, "", REQ, A, generateToken(), "x".repeat(43)]) {
    assert.deepEqual(await submitBidAction(bad, { amount: "5", unit: "per_day" }, "en"), { ok: false, error: "invalid_link" }, String(bad));
  }
  assert.equal((await loadBids(sheet, "TEST")).length, 0);
});

test("the public action refuses bad language codes and non-object input, and saves nothing", async () => {
  const sheet = world(); setContractorSheetForTests(sheet); asAdmin();
  await bidActions.openBiddingAction(REQ, "");
  const t = await bidderLink(sheet, A);
  guestMode();
  for (const input of [null, "text", 5, [], undefined]) assert.deepEqual(await submitBidAction(t, input, "en"), { ok: false, error: "invalid" }, String(input));
  assert.deepEqual(await submitBidAction(t, { amount: "5", unit: "per_day" }, "fr"), { ok: false, error: "invalid" });
  assert.equal((await loadBids(sheet, "TEST")).length, 0);
  const saved = await submitBidAction(t, { amount: "5", unit: "per_day", notes: "काम अच्छा" }, "hi");
  assert.equal(saved.ok, true);
  assert.deepEqual((await readTable(sheet, B.BID_TABLE)).filter((r) => r.event === "submitted").map((r) => [r.notes_language, r.notes]), [["hi", "काम अच्छा"]]);
});

test("the public action is rate limited per caller, and failures log only a label", async () => {
  const sheet = world(); setContractorSheetForTests(sheet); asAdmin();
  await bidActions.openBiddingAction(REQ, "");
  const t = await bidderLink(sheet, A);
  guestMode();
  setRequestHeader("x-forwarded-for", "203.0.113.250");
  const results = [];
  for (let i = 0; i < 24; i++) results.push((await submitBidAction(generateToken(), { amount: "5", unit: "per_day" }, "en")).error);
  assert.equal(results.filter((e) => e === "too_many_requests").length, 4, "20 attempts, then blocked");
  setRequestHeader("x-forwarded-for", "203.0.113.251");
  assert.notEqual((await submitBidAction(t, { amount: "5", unit: "per_day" }, "en")).error, "too_many_requests", "another caller is not affected");

  setContractorSheetForTests(makeSheet({ failWith: Object.assign(new Error("boom 9000000001"), { status: 503 }) }));
  setRequestHeader("x-forwarded-for", "203.0.113.252");
  const lines = []; const saved = { ...console }; console.error = (...a) => lines.push(a.join(" "));
  let r;
  try { r = await submitBidAction(t, { amount: "777", unit: "per_day", notes: "private words" }, "en"); } finally { Object.assign(console, saved); }
  assert.deepEqual(r, { ok: false, error: "unavailable_service" });
  assert.deepEqual(lines, ["[bid] save_failed"]);
});

test("with the bid tabs missing the public action saves nothing and reports an unavailable service", async () => {
  const sheet = makeSheet({ contractors: [contractor(A, "Asha Test")], tables: [CONFIRMATION_TABLE, JOB_TABLE] });
  setContractorSheetForTests(sheet);
  guestMode();
  const lines = []; const saved = { ...console }; console.error = (...a) => lines.push(a.join(" "));
  let r;
  try { r = await submitBidAction(generateToken(), { amount: "5", unit: "per_day" }, "en"); } finally { Object.assign(console, saved); }
  assert.deepEqual(r, { ok: false, error: "unavailable_service" });
  assert.equal(sheet.appended.length, 0);
});

// ============================ the bid form ============================
const INFO = { trade: "Masonry", area: "Baner", startDate: "2026-10-26", durationDays: 7, provisional: false, preferredLanguage: "en" };
const form = (language, info = {}) => renderToStaticMarkup(createElement(BidForm, { token: "x".repeat(43), info: { ...INFO, ...info, preferredLanguage: language } }));
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ");

test("the form asks for a price and a unit (required) and notes (optional), and says a bid is sent once", () => {
  const html = form("en"); const shown = text(html);
  assert.ok(html.includes('id="amount"') && html.includes('inputMode="decimal"'));
  assert.ok(html.includes('id="unit"'));
  for (const u of B.RATE_UNITS) assert.ok(html.includes(`value="${u.value}"`), u.value);
  assert.ok(html.includes("<textarea") && html.includes('maxLength="500"'));
  assert.equal((html.match(/text-red-700">\*/g) ?? []).length, 2, "price and unit are required, notes are not");
  assert.ok(html.includes('type="submit"'));
  assert.ok(shown.includes("only one bid") && shown.includes("cannot change it or send another"));
});

test("the form names the job without exposing any contractor, developer, name or phone number", () => {
  for (const language of ["en", "hi", "mr"]) {
    const html = form(language); const shown = text(html);
    assert.ok(!/C-[A-Z2-9]{8}|R-[A-Z2-9]{8}|\+91|\b[6-9]\d{9}\b|Asha|Bhim|TEST Developer/.test(html), language);
    assert.ok(shown.includes("26-10-2026"), `${language}: the date as digits`);
  }
  assert.ok(text(form("en")).includes("Masonry job in Baner"));
});

test("the form is fully translated: Hindi and Marathi show their own labels, and English is left behind nowhere", () => {
  for (const language of ["hi", "mr"]) {
    const t = getDict(language).bid; const shown = text(form(language));
    for (const s of [t.title, t.intro, t.jobHeading, t.amountLabel, t.amountHelp, t.unitLabel, t.notesLabel, t.notesHelp, t.onceNote, t.submit, t.units.per_sqft, t.units.per_sqm, t.units.per_day, t.units.per_unit, t.units.fixed_scope]) {
      assert.ok(shown.includes(s), `${language}: ${s.slice(0, 30)}`);
    }
    assert.ok(!shown.includes(getDict("en").bid.title), `${language}: English heading left behind`);
    assert.ok(!/Your price|Send my bid|Per square foot/.test(shown), language);
  }
  for (const language of ["en", "hi", "mr"]) {
    const html = form(language);
    assert.match(html, new RegExp(`<div lang="${language}">`));
    for (const native of ["English", "हिन्दी", "मराठी"]) assert.ok(html.includes(`>${native}</button>`));
  }
});

test("a contractor whose start date needs confirming is told, in their language, that the bid is provisional", () => {
  for (const language of ["en", "hi", "mr"]) {
    const shown = text(form(language, { provisional: true }));
    assert.ok(shown.includes(getDict(language).bid.provisionalNote), language);
    assert.ok(!text(form(language, { provisional: false })).includes(getDict(language).bid.provisionalNote), language);
  }
});

test("every English bid validation message has a Hindi and a Marathi translation, and nothing is left in English", () => {
  const samples = [
    B.validateBid({ amount: "", unit: "" }).errors, B.validateBid({ amount: "abc", unit: "x" }).errors, B.validateBid({ amount: "0", unit: "per_day" }).errors,
    B.validateBid({ amount: "1.234", unit: "per_day" }).errors, B.validateBid({ amount: "999999999", unit: "per_sqft" }).errors,
    B.validateBid({ amount: "5", unit: "per_day", notes: "x".repeat(501) }).errors, B.validateBid({ amount: "5", unit: "per_day", notes: "9000000001" }).errors,
    B.validateBid({ amount: "5", unit: "per_day", notes: 5 }).errors,
  ];
  const messages = new Set(samples.flatMap((e) => Object.values(e)));
  assert.ok(messages.size >= 9, `${messages.size} distinct messages were checked`);
  for (const m of messages) {
    for (const language of ["hi", "mr"]) {
      const shown = translateMessage(language, m);
      assert.notEqual(shown, m, `${language}: ${m}`);
      assert.ok(/[ऀ-ॿ]/.test(shown), `${language}: ${m}`);
    }
  }
  assert.equal(translateMessage("hi", "Keep the notes to 500 characters or fewer."), getDict("hi").validation.bidNotesLong.replace("{max}", "500"));
});

test("the Hindi and Marathi bid dictionaries have exactly the same keys as English, none empty", () => {
  const shape = (o) => Object.keys(o).sort().map((k) => (typeof o[k] === "object" ? [k, shape(o[k])] : k));
  for (const language of ["hi", "mr"]) {
    assert.deepEqual(shape(getDict(language).bid), shape(getDict("en").bid), language);
    const strings = (o) => Object.values(o).flatMap((v) => (typeof v === "object" ? strings(v) : [v]));
    assert.ok(strings(getDict(language).bid).every((s) => s.trim().length > 0), language);
  }
});

// ============================ the admin panel ============================
async function panelFor(sheet) {
  const [request] = await loadRequests(sheet);
  const contractors = await loadContractors(sheet);
  const { readTable: rt } = await import("../lib/tables.ts");
  void rt;
  const { loadConfirmations } = await import("../lib/confirmation-store.ts");
  return loadBidWorkspace(sheet, "TEST", request, contractors, await loadConfirmations(sheet, "TEST"), new Map());
}

test("the comparison panel shows each bid with its price and unit, start date status and reviews, and groups different units apart", async () => {
  const sheet = world(); setContractorSheetForTests(sheet); asAdmin();
  await bidActions.openBiddingAction(REQ, "");
  const ta = await bidderLink(sheet, A);
  const tn = await bidderLink(sheet, N);
  guestMode();
  await submitBidAction(ta, { amount: "20", unit: "per_sqft", notes: "Includes labour" }, "en");
  await submitBidAction(tn, { amount: "1500", unit: "per_day" }, "en");
  const { panel, missingTabs } = await panelFor(sheet);
  assert.deepEqual(missingTabs, []);
  const html = renderToStaticMarkup(createElement(BidPanel, { panel, today: dayStr(0), telegram: TG })); const shown = text(html);
  for (const s of ["Contractor bids", "Bidding is open", "₹20 per square foot", "₹1,500 per day", "Priced per square foot", "Priced per day", "Includes labour",
    "Not yet rated", "Provisional: start date not confirmed yet", "Can be selected", "Select this bidder", "Cannot be selected yet", "not</strong> comparable"]) {
    assert.ok(shown.includes(s.replace("</strong>", "")) || html.includes(s), s);
  }
  assert.ok(shown.includes("different rate units"));
  assert.ok(!/\+91|9000000\d{3}|token|[0-9a-f]{64}/i.test(html), "no phone number, token or digest in the page");
});

test("the panel with nothing set up says what is missing; with bidding not opened it offers to open it", async () => {
  const sheet = world(); setContractorSheetForTests(sheet);
  const fresh = (await panelFor(sheet)).panel;
  const html = renderToStaticMarkup(createElement(BidPanel, { panel: fresh, today: dayStr(0), telegram: TG }));
  assert.ok(text(html).includes("Bidding has not been opened") && html.includes("Open bidding"));
  assert.ok(!html.includes("Create bid link"), "no link before bidding is open");
  delete sheet.tabs.Bids;
  const missing = await panelFor(sheet);
  assert.deepEqual([missing.panel, missing.missingTabs], [null, ["Bids"]]);
});

test("a recorded job outside bidding shows 'a contractor was recorded without one of these bids'", async () => {
  const sheet = world(); setContractorSheetForTests(sheet); asAdmin();
  const { selectContractorAction } = await import("../app/admin/requests/[id]/job-actions.ts");
  assert.equal((await selectContractorAction(REQ, A)).ok, true);
  const { panel } = await panelFor(sheet);
  const shown = text(renderToStaticMarkup(createElement(BidPanel, { panel, today: dayStr(0), telegram: TG })));
  assert.ok(shown.includes("recorded without one of these bids") && shown.includes("A contractor has been selected"));
});

// ============================ no public way to read bids ============================
test("no public API route or public page reads bids, jobs, invitations or reviews, and phone numbers are never loaded by bid code", () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}/${e.name}`);
      else files.push(`${dir}/${e.name}`);
    }
  };
  walk(fileURLToPath(new URL("../app/api", import.meta.url)));
  assert.ok(files.length >= 3, "the scan found the API routes");
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const imports = [...source.matchAll(/from "(@\/lib\/[^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(imports.filter((i) => /\/(bid|bid-store|bid-invite|bid-overview)$/.test(i)), [], `${file} imports bid code`);
    assert.ok(!/loadBids|loadBidRows|loadBidInvites|buildBidPanel/.test(source), `${file} reads bids`);
  }
  // the one public bid page shows only what describeBidInvite returns
  const page = fs.readFileSync(new URL("../app/bid/[token]/page.tsx", import.meta.url), "utf8");
  assert.ok(!/loadBids|loadBidRows|loadBidInvites|loadSummaries|loadJobs|loadContractors|buildBidPanel/.test(page));
  const action = fs.readFileSync(new URL("../app/bid/[token]/actions.ts", import.meta.url), "utf8");
  assert.deepEqual([...action.matchAll(/export async function (\w+)/g)].map((m) => m[1]), ["submitBidAction"]);
  // the public bid files never import the admin guard or anything that returns a phone number
  for (const f of ["actions.ts", "page.tsx", "BidForm.tsx"]) {
    const src = fs.readFileSync(new URL(`../app/bid/[token]/${f}`, import.meta.url), "utf8");
    assert.ok(!/admin-auth|outcome-store|lib\/message/.test(src), f);
  }
  // none of the bidding library reads a phone column or composes a message
  for (const f of ["bid.ts", "bid-store.ts", "bid-invite.ts", "bid-overview.ts"]) {
    const src = fs.readFileSync(new URL(`../lib/${f}`, import.meta.url), "utf8");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.ok(!/\.phone\b|contact_phone|whatsapp|wa\.me|fetch\(|genai|gemini/i.test(code), f);
  }
});

test("the admin request page is inside the admin guard and shows the bidding panel", () => {
  const page = fs.readFileSync(new URL("../app/admin/requests/[id]/page.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("<AdminShell>") && page.includes("<BidPanel"));
});

test("the admin Change contractor action records the new bidder's bid, and a logged-out visitor cannot trigger it", async () => {
  const sheet = world(); setContractorSheetForTests(sheet); asAdmin();
  const X = "C-44444444"; // a second contractor available on the requested date
  const extra = sheet.tabs.Contractors[1].slice();
  extra[CONTRACTOR_HEADERS.indexOf("contractor_id")] = X;
  extra[CONTRACTOR_HEADERS.indexOf("name")] = "Esha Test";
  sheet.tabs.Contractors.push(extra);
  await bidActions.openBiddingAction(REQ, "");
  const ta = await bidderLink(sheet, A);
  const tx = await bidderLink(sheet, X);
  guestMode();
  await submitBidAction(ta, { amount: "20", unit: "per_sqft" }, "en");
  await submitBidAction(tx, { amount: "25", unit: "per_sqft" }, "en");
  asAdmin();
  const bids = await loadBids(sheet, "TEST");
  const bidOf = (id) => bids.find((b) => b.contractorId === id).id;
  assert.equal((await bidActions.selectBidderAction(REQ, bidOf(A))).ok, true);
  const markers = async () => (await readTable(sheet, B.BID_TABLE)).filter((r) => r.event === "selected").map((r) => r.contractor_id);
  assert.deepEqual(await markers(), [A]);

  resetRequestState();
  assert.equal(await redirectOf(() => jobActions.changeContractorAction(REQ, X, "The developer preferred the other bidder")), "/admin/login");
  assert.deepEqual(await markers(), [A], "nothing happened");

  asAdmin();
  assert.equal((await jobActions.changeContractorAction(REQ, X, "The developer preferred the other bidder")).ok, true);
  assert.deepEqual(await markers(), [A, X], "the bid of the new contractor is recorded as chosen");
  const { panel } = await panelFor(sheet);
  assert.equal(panel.selectedBidId, bidOf(X));
});

test("the bid panel offers the Telegram demo only for TEST data, says plainly when it is not set up, and never claims a send", async () => {
  const sheet = world(); setContractorSheetForTests(sheet); asAdmin();
  await bidActions.openBiddingAction(REQ, "");
  const { panel } = await panelFor(sheet);
  const render = (telegram) => text(renderToStaticMarkup(createElement(BidPanel, { panel, today: dayStr(0), telegram })));
  const off = render({ configured: false, testMode: true });
  assert.ok(off.includes("Notify by Telegram (demo)") && off.includes("Notify all eligible matches (2)"));
  assert.ok(off.includes("Telegram is not fully set up yet") && off.includes("previews"));
  assert.ok(!/Delivered/.test(off));
  const on = render({ configured: true, testMode: true });
  assert.ok(on.includes("connected their own Telegram") && on.includes("only their own one-time bid link") && !on.includes("not fully set up"));
  const real = render({ configured: true, testMode: false });
  assert.ok(real.includes("REAL data, so the Telegram demo is switched off") && !real.includes("Notify all eligible"));
});
