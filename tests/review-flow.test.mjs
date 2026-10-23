// The review feature as a person meets it: admin-only actions, the public review
// action, the review form in English/Hindi/Marathi, the admin overview, and a
// check that no public route can read review data. Pretend Sheet; synthetic data.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jobActions from "../app/admin/requests/[id]/job-actions.ts";
import { submitReviewAction } from "../app/review/[token]/actions.ts";
import ReviewForm from "../app/review/[token]/ReviewForm.tsx";
import MatchResults from "../app/admin/requests/MatchResults.tsx";
import { CONFIRMATION_TABLE } from "../lib/confirmation.ts";
import { getDict } from "../lib/i18n.ts";
import { INVITE_TABLE, evaluateInvite, generateToken, hashToken } from "../lib/invite.ts";
import { buildJobRows, contractorRatings } from "../lib/job-overview.ts";
import { JOB_TABLE } from "../lib/job.ts";
import { setContractorSheetForTests } from "../lib/google-sheets.ts";
import { LANGUAGE_TABLE } from "../lib/language-store.ts";
import { matchContractors } from "../lib/match.ts";
import { loadContractors, loadRequests } from "../lib/records.ts";
import { REVIEW_TABLE, summarize } from "../lib/review.ts";
import { loadReviews } from "../lib/review-store.ts";
import { readTable } from "../lib/tables.ts";
import { CONTRACTOR_HEADERS } from "../lib/registration.ts";
import { REQUEST_HEADERS } from "../lib/request.ts";
import { resetRequestState, setCookie, setRequestHeader } from "./stubs/next-headers.mjs";
import { makeSheet } from "./helpers/fakes.mjs";

const PASSWORD = "synthetic-test-password";
const SECRET = "synthetic-secret-synthetic-secret-0123456789";
const TABLES = [CONFIRMATION_TABLE, LANGUAGE_TABLE, JOB_TABLE, INVITE_TABLE, REVIEW_TABLE];
const A = "C-22222222";
const REQ = "R-BBBBBBBB";
let ipCounter = 0;

// Real-clock fixtures, so these tests never go stale as the calendar moves on.
const iso = (d = new Date()) => d.toISOString();
const dayStr = (offset) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10);
const cells = (headers, o) => headers.map((h) => o[h] ?? "");
function world() {
  const contractor = cells(CONTRACTOR_HEADERS, {
    contractor_id: A, record_type: "TEST", created_at: iso(), name: "Test Contractor", primary_trade: "Masonry", service_areas: "Baner",
    availability_status: "now", phone: "+919000000001", consent_version: "v1-2026-10-21", consent_text: "x", consent_timestamp: iso(), availability_reported_at: iso(),
  });
  const request = cells(REQUEST_HEADERS, {
    request_id: REQ, record_type: "TEST", created_at: iso(), developer_name: "TEST Developer", contact_phone: "+919000000002",
    description: "TEST ONLY: fictional job", trade: "Masonry", service_area: "Baner", start_date: dayStr(5), duration_days: "7", status: "New requirement",
  });
  return makeSheet({ contractors: [contractor], requests: [request], tables: TABLES });
}

const token = (expiry = String(Math.floor(Date.now() / 1000) + 3600)) =>
  `${expiry}.${createHmac("sha256", SECRET).update(`admin:${expiry}`).digest("base64url")}`;
const asAdmin = () => setCookie("cd_admin", token());
const redirectOf = async (fn) => {
  try { await fn(); } catch (error) { if (error?.redirectUrl) return error.redirectUrl; throw error; }
  return null;
};

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
  select: () => jobActions.selectContractorAction(REQ, A),
  change: () => jobActions.changeContractorAction(REQ, A, "A good enough reason"),
  complete: () => jobActions.completeJobAction(REQ, ""),
  cancel: () => jobActions.cancelJobAction(REQ, "A good enough reason"),
  correct: () => jobActions.correctJobAction(REQ, "cancelled", "", "A good enough reason"),
  invite: () => jobActions.createInviteAction(REQ),
  share: () => jobActions.shareContactAction(REQ),
};

test("every admin job action sends a visitor who is not logged in to the login page and writes nothing", async () => {
  const sheet = world(); setContractorSheetForTests(sheet);
  for (const [name, call] of Object.entries(ACTION_CALLS)) {
    assert.equal(await redirectOf(call), "/admin/login", name);
  }
  // a forged or expired cookie is no better
  for (const bad of ["9999999999.fake", "garbage", token(String(Math.floor(Date.now() / 1000) - 10))]) {
    setCookie("cd_admin", bad);
    for (const [name, call] of Object.entries(ACTION_CALLS)) assert.equal(await redirectOf(call), "/admin/login", `${name} with ${bad.slice(0, 12)}`);
  }
  assert.equal(sheet.appended.length, 0, "nothing was written");
  assert.deepEqual(sheet.updated, []);
});

test("the source of every exported job action goes through the admin guard", () => {
  const source = fs.readFileSync(new URL("../app/admin/requests/[id]/job-actions.ts", import.meta.url), "utf8");
  assert.ok(source.includes("await requireAdmin();"));
  const exported = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(exported.sort(), ["cancelJobAction", "changeContractorAction", "completeJobAction", "correctJobAction", "createInviteAction", "selectContractorAction", "shareContactAction"]);
  for (const name of exported) {
    const body = source.slice(source.indexOf(`export async function ${name}`)).split(/\nexport async function /)[0];
    assert.ok(body.includes("guarded("), `${name} does not use the admin guard`);
  }
});

test("a logged-in admin can record the contractor, complete the job and create ONE invitation link, shown once", async () => {
  const sheet = world(); setContractorSheetForTests(sheet); asAdmin();
  assert.equal((await jobActions.selectContractorAction(REQ, A)).ok, true);
  assert.equal((await jobActions.selectContractorAction(REQ, A)).error, "already_selected");
  const done = await jobActions.completeJobAction(REQ, dayStr(0));
  assert.equal(done.ok, true);
  assert.equal((await jobActions.completeJobAction(REQ, "")).error, "not_in_progress");
  const made = await jobActions.createInviteAction(REQ);
  assert.equal(made.ok, true);
  assert.match(made.link, /^http:\/\/localhost:3000\/review\/[A-Za-z0-9_-]{43}$/);
  const [row] = await readTable(sheet, INVITE_TABLE);
  assert.ok(!JSON.stringify(sheet.tabs).includes(made.link.split("/").pop()), "only the digest is stored");
  assert.equal(row.token_hash, hashToken(made.link.split("/").pop()));
});

test("the link uses https on a real address, and falls back to a path when the address looks odd", async () => {
  const sheet = world(); setContractorSheetForTests(sheet); asAdmin();
  await jobActions.selectContractorAction(REQ, A); await jobActions.completeJobAction(REQ, "");
  setRequestHeader("host", "contractor-desk.example.com");
  assert.match((await jobActions.createInviteAction(REQ)).link, /^https:\/\/contractor-desk\.example\.com\/review\/[A-Za-z0-9_-]{43}$/);
  setRequestHeader("host", "evil.com/<script>");
  assert.match((await jobActions.createInviteAction(REQ)).link, /^\/review\/[A-Za-z0-9_-]{43}$/, "no link is built from an odd address");
});

test("creating the link writes nothing to a log, and says nothing was sent", async () => {
  const sheet = world(); setContractorSheetForTests(sheet); asAdmin();
  await jobActions.selectContractorAction(REQ, A); await jobActions.completeJobAction(REQ, "");
  const lines = []; const saved = { ...console };
  for (const k of ["log", "error", "info", "warn"]) console[k] = (...a) => lines.push(a.join(" "));
  let made;
  try { made = await jobActions.createInviteAction(REQ); } finally { Object.assign(console, saved); }
  assert.ok(!lines.join("\n").includes(made.link.split("/").pop()));
});

test("a missing tab gives a clear 'set up' answer, not a crash, and nothing is written", async () => {
  const sheet = makeSheet({ tables: [CONFIRMATION_TABLE] }); // no Jobs tab
  setContractorSheetForTests(sheet); asAdmin();
  const lines = []; const saved = { ...console }; console.error = (...a) => lines.push(a.join(" "));
  let result;
  try { result = await jobActions.selectContractorAction(REQ, A); } finally { Object.assign(console, saved); }
  assert.ok(["setup", "not_found"].includes(result.error), result.error);
  assert.equal(sheet.appended.length, 0);
  assert.ok(lines.every((l) => /^\[admin\/job\] \w+( tab_not_set_up| failed)$/.test(l)), lines.join(" | "));
});

// ============================ the public review action ============================
async function invited() {
  const sheet = world(); setContractorSheetForTests(sheet); asAdmin();
  await jobActions.selectContractorAction(REQ, A);
  await jobActions.completeJobAction(REQ, dayStr(0));
  const made = await jobActions.createInviteAction(REQ);
  resetRequestState(); // the developer is NOT logged in as admin
  setRequestHeader("x-forwarded-for", `203.0.113.${++ipCounter}`);
  return { sheet, token: made.link.split("/").pop() };
}

test("the developer needs no admin login: the invitation token is the only authority", async () => {
  const { sheet, token: t } = await invited();
  const r = await submitReviewAction(t, { overall: 4, comment: "Good work" }, "en");
  assert.deepEqual([r.ok, r.translation], [true, "not_needed"]);
  const [review] = await loadReviews(sheet, "TEST");
  assert.deepEqual([review.contractorId, review.requestId, review.overall, review.comment], [A, REQ, 4, "Good work"]);
  assert.deepEqual(await submitReviewAction(t, { overall: 1 }, "en"), { ok: false, error: "already_reviewed" });
});

test("a wrong, missing or malformed token gets nothing; the admin cookie does not help a stranger", async () => {
  const { sheet } = await invited();
  for (const bad of [undefined, "", REQ, A, generateToken(), "x".repeat(43)]) {
    assert.deepEqual(await submitReviewAction(bad, { overall: 5 }, "en"), { ok: false, error: "invalid_link" }, String(bad));
  }
  assert.equal((await loadReviews(sheet, "TEST")).length, 0);
});

test("an unfinished or cancelled job turns the link into 'unavailable'", async () => {
  const { sheet, token: t } = await invited();
  asAdmin();
  assert.equal((await jobActions.correctJobAction(REQ, "cancelled", "", "Completed by mistake")).ok, true);
  resetRequestState(); setRequestHeader("x-forwarded-for", "203.0.113.200");
  assert.deepEqual(await submitReviewAction(t, { overall: 5 }, "en"), { ok: false, error: "unavailable" });
  assert.equal((await loadReviews(sheet, "TEST")).length, 0);
});

test("the public action is rate limited per caller, and failures log only a label", async () => {
  const { t } = { t: (await invited()).token };
  setRequestHeader("x-forwarded-for", "203.0.113.250");
  const results = [];
  for (let i = 0; i < 24; i++) results.push((await submitReviewAction(generateToken(), { overall: 5 }, "en")).error);
  assert.equal(results.filter((e) => e === "too_many_requests").length, 4, "20 attempts, then blocked");
  setRequestHeader("x-forwarded-for", "203.0.113.251");
  assert.notEqual((await submitReviewAction(t, { overall: 5 }, "en")).error, "too_many_requests", "another caller is not affected");

  setContractorSheetForTests(makeSheet({ failWith: Object.assign(new Error("boom 9000000001"), { status: 503 }) }));
  setRequestHeader("x-forwarded-for", "203.0.113.252");
  const lines = []; const saved = { ...console }; console.error = (...a) => lines.push(a.join(" "));
  let r;
  try { r = await submitReviewAction(t, { overall: 5, comment: "private words" }, "en"); } finally { Object.assign(console, saved); }
  assert.deepEqual(r, { ok: false, error: "unavailable_service" });
  assert.deepEqual(lines, ["[review] save_failed"]);
});

// ============================ the review form ============================
const INFO = { trade: "Masonry", area: "Baner", startDate: "2026-10-26", completionDate: "2026-10-28", preferredLanguage: "en" };
const form = (language) => renderToStaticMarkup(createElement(ReviewForm, { token: "x".repeat(43), info: { ...INFO, preferredLanguage: language } }));
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ");

test("the review form has the five fields: one required star rating, three optional ones, and feedback", () => {
  const html = form("en");
  assert.equal((html.match(/role="radiogroup"/g) ?? []).length, 4, "overall + three optional ratings");
  assert.equal((html.match(/role="radio"/g) ?? []).length, 20, "five stars each");
  for (const n of [1, 2, 3, 4, 5]) assert.ok(html.includes(`aria-label="${n} out of 5"`));
  assert.ok(html.includes("<textarea") && html.includes('maxLength="600"'));
  assert.ok(html.includes('type="submit"'));
  assert.equal((html.match(/class="req">\*/g) ?? []).length, 1, "only the overall rating is required");
});

test("the form names the job without exposing the contractor, any name or any phone number", () => {
  for (const language of ["en", "hi", "mr"]) {
    const html = form(language); const shown = text(html);
    assert.ok(!/C-[A-Z2-9]{8}|R-[A-Z2-9]{8}|\+91|\b[6-9]\d{9}\b|Test Contractor|TEST Developer/.test(html), language);
    assert.ok(shown.includes("26-10-2026") && shown.includes("28-10-2026"), `${language}: dates as digits`);
  }
  assert.ok(text(form("en")).includes("Masonry job in Baner"));
});

test("the form is fully translated: Hindi and Marathi show their own labels, and English is left behind nowhere", () => {
  for (const language of ["hi", "mr"]) {
    const t = getDict(language).review; const shown = text(form(language));
    for (const s of [t.title, t.intro, t.jobHeading, t.overallLabel, t.overallHelp, t.workmanshipLabel, t.punctualityLabel, t.communicationLabel, t.commentLabel, t.submit, t.contractorNote]) {
      assert.ok(shown.includes(s), `${language}: ${s.slice(0, 30)}`);
    }
    assert.ok(form(language).includes(`aria-label="${t.starLabel.replace("{n}", "3")}"`), `${language}: star labels`);
    assert.ok(!shown.includes(getDict("en").review.title), `${language}: English heading left behind`);
    assert.ok(!/Overall rating|Send my review/.test(shown), language);
  }
});

test("the form opens in the developer's own language and still offers all three", () => {
  for (const language of ["en", "hi", "mr"]) {
    const html = form(language);
    assert.match(html, new RegExp(`<div lang="${language}">`));
    for (const native of ["English", "हिन्दी", "मराठी"]) assert.ok(html.includes(`>${native}</button>`));
  }
});

// ============================ no public way to read reviews ============================
test("no public API route or public page reads reviews, jobs or invitations", () => {
  const api = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}/${e.name}`);
      else api.push(`${dir}/${e.name}`);
    }
  };
  walk(fileURLToPath(new URL("../app/api", import.meta.url)));
  assert.ok(api.length >= 3, "the scan found the API routes");
  for (const file of api) {
    const source = fs.readFileSync(file, "utf8");
    // what a route imports decides what data it can reach (comments may say "reviewed")
    const imports = [...source.matchAll(/from "(@\/lib\/[^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(imports.filter((i) => /\/(review|review-store|invite|job|job-store|job-overview)$/.test(i)), [], `${file} imports review data`);
    assert.ok(!/loadJobs|loadReviews|loadInvites|loadSummaries/.test(source), `${file} reads review data`);
  }
  // the one public page shows only what describeInvite returns
  const page = fs.readFileSync(new URL("../app/review/[token]/page.tsx", import.meta.url), "utf8");
  assert.ok(!/loadReviews|loadSummaries|loadJobs|loadContractors|summaries/.test(page));
  const action = fs.readFileSync(new URL("../app/review/[token]/actions.ts", import.meta.url), "utf8");
  assert.deepEqual([...action.matchAll(/export async function (\w+)/g)].map((m) => m[1]), ["submitReviewAction"]);
});

test("the admin reviews page and the request page are inside the admin guard", () => {
  for (const file of ["../app/admin/reviews/page.tsx", "../app/admin/requests/[id]/page.tsx"]) {
    assert.ok(fs.readFileSync(new URL(file, import.meta.url), "utf8").includes("<AdminShell>"), file);
  }
  const shell = fs.readFileSync(new URL("../app/admin/AdminShell.tsx", import.meta.url), "utf8");
  assert.ok(shell.includes("await requireAdmin();"));
});

// ============================ the admin overview ============================
const job = (o = {}) => ({ id: "J-1", recordType: "TEST", requestId: "R-AAAAAAAA", contractorId: A, status: "completed", completionDate: "2026-10-21", selectedAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", history: [], ...o });
const inv = (o = {}) => ({ id: "V-1", recordType: "TEST", jobId: "J-1", requestId: "R-AAAAAAAA", contractorId: A, tokenHash: "a".repeat(64), createdAt: "2026-10-21T00:00:00Z", expiresAt: "2026-11-04T00:00:00Z", ...o });
const rev = (o = {}) => ({ id: "W-1", recordType: "TEST", jobId: "J-1", requestId: "R-AAAAAAAA", contractorId: A, inviteId: "V-1", submittedAt: "2026-10-22T00:00:00Z", overall: 4, workmanship: null, punctuality: null, communication: null, comment: "", commentLanguage: "en", commentEnglish: "", translationStatus: "not_needed", translationMethod: "none", ...o });
const NOWMS = Date.parse("2026-10-22T00:00:00Z");
const rows = (o) => buildJobRows({ jobs: [job()], invites: [], reviews: [], requests: [{ id: "R-AAAAAAAA", trade: "Masonry", area: "Baner" }], contractors: [{ id: A, name: "Ravi" }], nowMs: NOWMS, ...o });

test("overview: completed jobs awaiting an invitation, with an invitation, and with a review are told apart", () => {
  const none = rows()[0];
  assert.deepEqual([none.eligibleForFeedback, none.awaitingInvitation, none.invite.state, none.review], [true, true, "none", null]);
  const active = rows({ invites: [inv()] })[0];
  assert.deepEqual([active.invite.state, active.awaitingInvitation, active.eligibleForFeedback], ["active", false, true]);
  const expired = rows({ invites: [inv({ expiresAt: "2026-10-21T12:00:00Z" })] })[0];
  assert.deepEqual([expired.invite.state, expired.awaitingInvitation], ["expired", true], "an expired link needs a new invitation");
  const reviewed = rows({ invites: [inv()], reviews: [rev()] })[0];
  assert.deepEqual([reviewed.invite.state, reviewed.eligibleForFeedback, reviewed.awaitingInvitation, reviewed.review.overall], ["used", false, false, 4]);
  assert.equal(none.contractorName, "Ravi"); assert.equal(none.trade, "Masonry");
});

test("overview: unfinished and cancelled jobs are never eligible; a review on a cancelled job is not shown", () => {
  for (const status of ["selected", "cancelled"]) {
    const r = rows({ jobs: [job({ status })], reviews: [rev()] })[0];
    assert.deepEqual([r.eligibleForFeedback, r.awaitingInvitation, r.review], [false, false, null], status);
  }
});

test("overview: a newer invitation replaces an older one, and the count is kept", () => {
  const r = rows({ invites: [inv(), inv({ id: "V-2", createdAt: "2026-10-21T06:00:00Z" })] })[0];
  assert.deepEqual([r.invite.state, r.invite.count], ["active", 2]);
  assert.equal(evaluateInvite(inv(), { nowMs: NOWMS, job: job(), invitesForJob: [inv(), inv({ id: "V-2" })], reviewExistsForJob: false }), "superseded");
});

test("overview: contractors are listed only if they have a valid review, most reviews first", () => {
  const sums = new Map([["C-AAAAAAAA", summarize([rev({ overall: 5 })])], ["C-BBBBBBBB", summarize([rev({ overall: 3 }), rev({ overall: 4, id: "W-2" })])]]);
  const list = contractorRatings(sums, [{ id: "C-BBBBBBBB", name: "Sita" }]);
  assert.deepEqual(list.map((r) => [r.contractorId, r.summary.count]), [["C-BBBBBBBB", 2], ["C-AAAAAAAA", 1]]);
  assert.equal(list[0].contractorName, "Sita");
  assert.equal(contractorRatings(new Map(), []).length, 0);
});

// ============================ ratings on the matching page ============================
test("a candidate shows 'Not yet rated', or the average with its count; the line is absent if ratings cannot be read", async () => {
  const sheet = world();
  const request = (await loadRequests(sheet))[0];
  const result = matchContractors(request, await loadContractors(sheet), { envType: "TEST" });
  const render = (extras) => text(renderToStaticMarkup(createElement(MatchResults, { result, request, extras })));
  assert.ok(render({ [A]: { rating: { summary: null } } }).includes("Reviews: Not yet rated"));
  assert.ok(render({ [A]: { rating: { summary: summarize([rev({ overall: 5 }), rev({ overall: 4, id: "W-2" })]) } } }).includes("4.5 out of 5 from 2 reviews (too few to judge)"));
  assert.ok(render({ [A]: { rating: { summary: summarize([1, 2, 3].map((n) => rev({ overall: 4, id: `W-${n}` }))) } } }).includes("4.0 out of 5 from 3 reviews"));
  assert.ok(!render({ [A]: {} }).includes("Reviews:"));
  assert.ok(!render(undefined).includes("Reviews:"), "unchanged when ratings are not supplied");
});
