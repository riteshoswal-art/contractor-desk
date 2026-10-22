// Reviews: who may submit one, review invitations, validation, duplicates, the
// preserved original text and the rating arithmetic. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { CONFIRMATION_TABLE } from "../lib/confirmation.ts";
import * as I from "../lib/invite.ts";
import { JOB_TABLE } from "../lib/job.ts";
import { cancelJob, completeJob, correctJob, loadJobs, selectContractor } from "../lib/job-store.ts";
import { LANGUAGE_TABLE } from "../lib/language-store.ts";
import * as R from "../lib/review.ts";
import { createInvite, describeInvite, loadInvites, loadReviews, loadSummaries, submitReview } from "../lib/review-store.ts";
import { readTable } from "../lib/tables.ts";
import { CID, NOW, REQ_ID, TODAY, contractorRow, makeWorld, requestRow } from "./helpers/world.mjs";
import { createMockProvider } from "./helpers/mock-translation.mjs";

const TABLES = [CONFIRMATION_TABLE, JOB_TABLE, I.INVITE_TABLE, R.REVIEW_TABLE, LANGUAGE_TABLE];
const A = CID(2), B = CID(3);
const REQ2 = "R-CCCCCCCC";
const ENV = { recordType: "TEST", now: NOW };
const JENV = { recordType: "TEST", today: TODAY, now: NOW };
let n = 0;
const nid = (p) => () => `${p}-${String(++n).padStart(8, "2")}`;
const world = (o = {}) =>
  makeWorld({
    tables: TABLES,
    contractors: [contractorRow({ contractor_id: A }), contractorRow({ contractor_id: B })],
    requests: [requestRow(), requestRow({ request_id: REQ2 })],
    ...o,
  });

// A job for REQ_ID with contractor A: selected, then completed.
async function completedJob(sheet, requestId = REQ_ID, contractorId = A) {
  assert.equal((await selectContractor(sheet, { requestId, contractorId }, JENV, nid("J"))).ok, true);
  assert.equal((await completeJob(sheet, { requestId, completionDate: TODAY }, JENV)).ok, true);
}
const invite = (sheet, requestId = REQ_ID, env = {}) => createInvite(sheet, { requestId }, { ...ENV, ...env }, nid("V"));
const review = (sheet, token, input = { overall: 5 }, extra = {}) =>
  submitReview(sheet, { token, input, language: "en", ...extra }, { ...ENV, ...(extra.env ?? {}) }, nid("W"));
async function readyToReview(sheet = world()) {
  await completedJob(sheet);
  const made = await invite(sheet);
  assert.equal(made.ok, true);
  return { sheet, token: made.token };
}
const reviewRows = (sheet) => readTable(sheet, R.REVIEW_TABLE);

// =========================== who may review ===========================
test("1. an invited developer can review a COMPLETED job; the contractor is taken from the job", async () => {
  const { sheet, token } = await readyToReview();
  const r = await review(sheet, token, { overall: 5, workmanship: 4, punctuality: "3", communication: "", comment: "Good work, finished on time." });
  assert.equal(r.ok, true);
  const [row] = await reviewRows(sheet);
  assert.deepEqual([row.job_id.length > 0, row.request_id, row.contractor_id, row.overall, row.workmanship, row.punctuality, row.communication, row.comment, row.status, row.record_type],
    [true, REQ_ID, A, "5", "4", "3", "", "Good work, finished on time.", "valid", "TEST"]);
  assert.ok(row.invite_id && !Number.isNaN(Date.parse(row.submitted_at)));
});

test("2. an unfinished job cannot be reviewed: no invitation can be made, and a forged one is refused", async () => {
  const sheet = world();
  assert.equal((await invite(sheet)).error, "no_job");
  await selectContractor(sheet, { requestId: REQ_ID, contractorId: A }, JENV, nid("J"));
  assert.equal((await invite(sheet)).error, "not_completed", "selected, not completed");
  // a forged invitation row for the unfinished job still cannot be used
  const token = I.generateToken();
  const job = (await loadJobs(sheet, "TEST"))[0];
  await sheet.append("ReviewInvites!A1", [nid("V")(), "TEST", job.id, REQ_ID, A, I.hashToken(token), NOW.toISOString(), I.expiryFor(NOW.getTime()), "x"]);
  assert.deepEqual(await review(sheet, token), { ok: false, error: "unavailable" });
  assert.equal((await reviewRows(sheet)).length, 0);
});

test("3. a cancelled job cannot be reviewed, including one cancelled AFTER the invitation was made", async () => {
  const cancelled = world();
  await selectContractor(cancelled, { requestId: REQ_ID, contractorId: A }, JENV, nid("J"));
  await cancelJob(cancelled, { requestId: REQ_ID, reason: "Developer cancelled" }, JENV);
  assert.equal((await invite(cancelled)).error, "not_completed");

  const { sheet, token } = await readyToReview();
  assert.equal((await correctJob(sheet, { requestId: REQ_ID, status: "cancelled", reason: "Completed by mistake" }, JENV)).ok, true);
  assert.deepEqual(await review(sheet, token), { ok: false, error: "unavailable" });
  assert.equal((await reviewRows(sheet)).length, 0);
});

test("4. a request with no selected contractor cannot be reviewed", async () => {
  const sheet = world();
  assert.equal((await invite(sheet, REQ2)).error, "no_job");
  const token = I.generateToken();
  await sheet.append("ReviewInvites!A1", ["V-1", "TEST", "J-NOJOB222", REQ2, A, I.hashToken(token), NOW.toISOString(), I.expiryFor(NOW.getTime()), "x"]);
  assert.deepEqual(await review(sheet, token), { ok: false, error: "unavailable" });
});

test("5. the reviewer cannot choose the contractor or the job: whatever they send is ignored", async () => {
  const { sheet, token } = await readyToReview();
  const r = await submitReview(sheet,
    { token, language: "en", requestId: REQ2, contractorId: B, jobId: "J-OTHER", input: { overall: 4, contractorId: B, contractor_id: B, requestId: REQ2, jobId: "J-OTHER", request_id: REQ2 } },
    ENV, nid("W"));
  assert.equal(r.ok, true);
  const [row] = await reviewRows(sheet);
  assert.deepEqual([row.contractor_id, row.request_id], [A, REQ_ID]);
  assert.equal((await reviewRows(sheet)).length, 1);
});

test("6. nobody can review using another person's request ID: there is no way to review without a valid token", async () => {
  const { sheet, token } = await readyToReview();
  for (const bad of [undefined, null, "", REQ_ID, "R-BBBBBBBB", A, "x".repeat(43), "a".repeat(43), token.slice(1), token + "x", token.toUpperCase(), ` ${token}`, 42, {}, [token]]) {
    const r = await submitReview(sheet, { token: bad, input: { overall: 5 }, language: "en", requestId: REQ_ID }, ENV, nid("W"));
    assert.deepEqual(r, { ok: false, error: "invalid_link" }, String(bad).slice(0, 20));
  }
  assert.equal((await reviewRows(sheet)).length, 0);
});

test("7. an expired invitation is refused; one day before it expires still works", async () => {
  const { sheet, token } = await readyToReview();
  const dayMs = 86400_000;
  assert.deepEqual(await review(sheet, token, { overall: 5 }, { env: { now: new Date(NOW.getTime() + I.INVITE_DAYS * dayMs + 1000) } }), { ok: false, error: "expired" });
  assert.equal((await reviewRows(sheet)).length, 0);
  assert.equal((await review(sheet, token, { overall: 5 }, { env: { now: new Date(NOW.getTime() + (I.INVITE_DAYS - 1) * dayMs) } })).ok, true);
});

test("7. an invitation is single-use; a second use, even with a different score, is refused and changes nothing", async () => {
  const { sheet, token } = await readyToReview();
  assert.equal((await review(sheet, token, { overall: 5 })).ok, true);
  assert.deepEqual(await review(sheet, token, { overall: 1, comment: "changed my mind" }), { ok: false, error: "already_reviewed" });
  const rows = await reviewRows(sheet);
  assert.equal(rows.length, 1); assert.equal(rows[0].overall, "5");
  assert.equal((await invite(sheet)).error, "already_reviewed", "no new invitation once reviewed");
});

test("7. a newer invitation replaces the older one", async () => {
  const sheet = world(); await completedJob(sheet);
  const first = await invite(sheet), second = await invite(sheet);
  assert.notEqual(first.token, second.token);
  assert.deepEqual(await review(sheet, first.token), { ok: false, error: "unavailable" });
  assert.equal((await review(sheet, second.token)).ok, true);
});

test("8. repeated clicks and retries cannot create duplicate reviews", async () => {
  const { sheet, token } = await readyToReview();
  const results = await Promise.all(Array.from({ length: 6 }, () => review(sheet, token, { overall: 4 })));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => !r.ok && r.error === "already_reviewed").length, 5);
  assert.equal((await reviewRows(sheet)).length, 1);
});

test("8. two servers writing at the same moment: the first row is the review, the other is told it was already reviewed", async () => {
  const { sheet, token } = await readyToReview();
  const job = (await loadJobs(sheet, "TEST"))[0];
  const original = sheet.append.bind(sheet);
  let done = false;
  sheet.append = async (range, row) => {
    if (!done && range.startsWith("Reviews!")) {
      done = true;
      await original(range, R.REVIEW_TABLE.headers.map((h) => ({ review_id: "W-RIVAL222", record_type: "TEST", job_id: job.id, request_id: REQ_ID, contractor_id: A, invite_id: "V-x", submitted_at: NOW.toISOString(), overall: "2", status: "valid" }[h] ?? "")));
    }
    return original(range, row);
  };
  assert.deepEqual(await review(sheet, token, { overall: 5 }), { ok: false, error: "already_reviewed" });
  assert.equal((await loadReviews(sheet, "TEST"))[0].id, "W-RIVAL222");
  assert.equal((await loadSummaries(sheet, "TEST")).get(A).count, 1, "counted once");
});

test("20. an invitation made for one job can never be used for another job", async () => {
  const sheet = world();
  await completedJob(sheet, REQ_ID, A); await completedJob(sheet, REQ2, B);
  const tokenA = (await invite(sheet, REQ_ID)).token, tokenB = (await invite(sheet, REQ2)).token;
  assert.equal((await submitReview(sheet, { token: tokenA, language: "en", requestId: REQ2, input: { overall: 5, requestId: REQ2, contractorId: B } }, ENV, nid("W"))).ok, true);
  const [first] = await reviewRows(sheet);
  assert.deepEqual([first.request_id, first.contractor_id], [REQ_ID, A], "the review landed on the job the token was made for");
  assert.deepEqual(await review(sheet, tokenA), { ok: false, error: "already_reviewed" }, "and the token is now used up");
  assert.equal((await review(sheet, tokenB, { overall: 3 })).ok, true, "the other job's token is unaffected");
  const rows = await reviewRows(sheet);
  assert.deepEqual(rows.map((r) => [r.request_id, r.contractor_id, r.overall]), [[REQ_ID, A, "5"], [REQ2, B, "3"]]);
});

test("16. an invitation whose contractor or request no longer matches the stored job is refused", async () => {
  const sheet = world(); await completedJob(sheet);
  const job = (await loadJobs(sheet, "TEST"))[0];
  for (const [jobId, requestId, contractorId] of [[job.id, REQ_ID, B], [job.id, REQ2, A], ["J-OTHER222", REQ_ID, A]]) {
    const token = I.generateToken();
    await sheet.append("ReviewInvites!A1", [nid("V")(), "TEST", jobId, requestId, contractorId, I.hashToken(token), NOW.toISOString(), I.expiryFor(NOW.getTime()), "x"]);
    assert.deepEqual(await review(sheet, token), { ok: false, error: "unavailable" }, `${jobId} ${requestId} ${contractorId}`);
  }
  assert.equal((await reviewRows(sheet)).length, 0);
});

// =========================== invitation tokens ===========================
test("tokens are 256-bit random values: 43 URL-safe characters, never repeating", () => {
  const tokens = new Set(Array.from({ length: 500 }, I.generateToken));
  assert.equal(tokens.size, 500);
  for (const t of tokens) assert.match(t, I.TOKEN_PATTERN);
  assert.equal(Buffer.from([...tokens][0], "base64url").length, 32);
});

test("only a SHA-256 digest is stored: the Sheet never contains the token", async () => {
  const { sheet, token } = await readyToReview();
  const [row] = await readTable(sheet, I.INVITE_TABLE);
  assert.equal(row.token_hash, createHash("sha256").update(token).digest("hex"));
  assert.ok(!JSON.stringify(sheet.tabs).includes(token), "the raw token is in the Sheet");
  assert.ok(!JSON.stringify(await loadInvites(sheet, "TEST")).includes(token));
  assert.equal(I.hashToken(token), row.token_hash);
  assert.ok(!I.hashesMatch(row.token_hash, I.hashToken(token + "x")));
});

test("an invitation lasts 14 days, is created by the founder, and records for which job", async () => {
  const sheet = world(); await completedJob(sheet);
  const made = await invite(sheet);
  assert.equal(made.expiresAt, new Date(NOW.getTime() + 14 * 86400_000).toISOString());
  const [row] = await readTable(sheet, I.INVITE_TABLE);
  const job = (await loadJobs(sheet, "TEST"))[0];
  assert.deepEqual([row.job_id, row.request_id, row.contractor_id, row.created_by, row.record_type], [job.id, REQ_ID, A, "founder (admin login)", "TEST"]);
});

test("neither creating nor using an invitation writes the token to any log", async () => {
  const lines = [];
  const saved = { log: console.log, error: console.error, info: console.info, warn: console.warn };
  for (const k of Object.keys(saved)) console[k] = (...a) => lines.push(a.join(" "));
  let token;
  try {
    const ready = await readyToReview(); token = ready.token;
    await review(ready.sheet, token, { overall: 3, comment: "fine" });
    await review(ready.sheet, token, { overall: 3 });
    await describeInvite(ready.sheet, token, ENV);
  } finally { Object.assign(console, saved); }
  assert.ok(!lines.join("\n").includes(token));
});

test("unreadable invitation rows are ignored", () => {
  const good = { invite_id: "V-1", record_type: "TEST", job_id: "J-1", request_id: REQ_ID, contractor_id: A, token_hash: "a".repeat(64), created_at: NOW.toISOString(), expires_at: NOW.toISOString() };
  assert.ok(I.parseInviteRow(good));
  for (const patch of [{ token_hash: "plain-token-in-the-sheet" }, { token_hash: "A".repeat(64) }, { expires_at: "soon" }, { record_type: "X" }, { job_id: "" }]) {
    assert.equal(I.parseInviteRow({ ...good, ...patch }), null, JSON.stringify(patch));
  }
});

// =========================== what the review page may show ===========================
test("15. the invitation page learns only what is needed to recognise the job: no contractor, no names, no phone numbers, no other reviews", async () => {
  const { sheet, token } = await readyToReview();
  await sheet.append("Reviews!A1", ["W-9", "TEST", "J-OTHER", REQ2, B, "V-9", NOW.toISOString(), "1", "", "", "", "secret feedback", "en", "", "not_needed", "none", "valid"]);
  const r = await describeInvite(sheet, token, ENV);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.info).sort(), ["area", "completionDate", "preferredLanguage", "startDate", "trade"]);
  assert.deepEqual([r.info.trade, r.info.area, r.info.completionDate, r.info.preferredLanguage], ["Masonry", "Baner", TODAY, "en"]);
  assert.ok(!/\+91|9000000|Test Contractor|TEST Developer|secret feedback|C-22222222/.test(JSON.stringify(r)));
  for (const bad of ["x", null, "a".repeat(43)]) assert.deepEqual(await describeInvite(sheet, bad, ENV), { ok: false, reason: "invalid" });
});

test("the page reports an expired, used or replaced link without saying which person or job it was for", async () => {
  const { sheet, token } = await readyToReview();
  assert.deepEqual(await describeInvite(sheet, token, { ...ENV, now: new Date(NOW.getTime() + 15 * 86400_000) }), { ok: false, reason: "expired" });
  await review(sheet, token, { overall: 5 });
  assert.deepEqual(await describeInvite(sheet, token, ENV), { ok: false, reason: "used" });
});

test("18. the developer's chosen language is offered when it is known; a missing Languages tab falls back to English without failing", async () => {
  const sheet = world({ tables: TABLES.filter((t) => t !== LANGUAGE_TABLE) });
  await completedJob(sheet);
  const token = (await invite(sheet)).token;
  const r = await describeInvite(sheet, token, ENV);
  assert.equal(r.ok, true); assert.equal(r.info.preferredLanguage, "en");

  const withLanguage = world(); await completedJob(withLanguage);
  await withLanguage.append("Languages!A1", ["L-1", "TEST", "request", REQ_ID, "hi", "hi", "x", "", "", "", "pending", "none", NOW.toISOString()]);
  assert.equal((await describeInvite(withLanguage, (await invite(withLanguage)).token, ENV)).info.preferredLanguage, "hi");
});

// =========================== validation ===========================
test("9. scores outside 1 to 5, or not whole numbers, are rejected and nothing is written", async () => {
  const { sheet, token } = await readyToReview();
  for (const overall of [0, 6, -1, 2.5, "0", "6", "abc", "", null, undefined, NaN, Infinity, true, [], {}, "5.0", "05", "1e1", " "]) {
    const r = await review(sheet, token, { overall });
    assert.equal(r.error, "validation", JSON.stringify(overall)); assert.ok(r.errors.overall, JSON.stringify(overall));
  }
  assert.equal((await reviewRows(sheet)).length, 0);
  for (const ok of [1, 2, 3, 4, 5, "1", "5"]) assert.equal(R.validateReview({ overall: ok }).ok, true, String(ok));
});

test("10. optional scores may be left out, but if given they must be 1 to 5", async () => {
  for (const blank of [undefined, null, ""]) {
    const v = R.validateReview({ overall: 4, workmanship: blank, punctuality: blank, communication: blank });
    assert.deepEqual([v.ok, v.value.workmanship, v.value.punctuality, v.value.communication], [true, null, null, null]);
  }
  const mixed = R.validateReview({ overall: 4, workmanship: 5, punctuality: "2" });
  assert.deepEqual([mixed.value.workmanship, mixed.value.punctuality, mixed.value.communication], [5, 2, null]);
  for (const key of ["workmanship", "punctuality", "communication"]) {
    for (const bad of [0, 6, 2.5, "x", true, -3]) {
      const v = R.validateReview({ overall: 4, [key]: bad });
      assert.equal(v.ok, false, `${key} ${bad}`); assert.ok(v.errors[key]);
    }
  }
});

test("11. over-long feedback, phone numbers and non-text are rejected safely; the limit itself is accepted", async () => {
  const { sheet, token } = await readyToReview();
  for (const comment of ["x".repeat(R.COMMENT_MAX + 1), "call me on 98765 43210", "9876543210", 12345, { text: "x" }, ["x"]]) {
    const r = await review(sheet, token, { overall: 4, comment });
    assert.equal(r.error, "validation", String(comment).slice(0, 20)); assert.ok(r.errors.comment);
  }
  assert.equal((await reviewRows(sheet)).length, 0);
  const atLimit = await review(sheet, token, { overall: 4, comment: "x".repeat(R.COMMENT_MAX) });
  assert.equal(atLimit.ok, true);
});

test("comment text is cleaned: line breaks and control characters become spaces", () => {
  assert.equal(R.validateReview({ overall: 3, comment: "  Good\n\nwork\t\u0000done  " }).value.comment, "Good work done");
});

test("an input that is not an object, or an unsupported language, is refused", async () => {
  const { sheet, token } = await readyToReview();
  for (const input of [null, undefined, "5", 5, [5], true]) assert.deepEqual(await submitReview(sheet, { token, input, language: "en" }, ENV, nid("W")), { ok: false, error: "invalid" }, String(input));
  for (const language of ["fr", "", null, 5, "HI"]) assert.deepEqual(await submitReview(sheet, { token, input: { overall: 5 }, language }, ENV, nid("W")), { ok: false, error: "invalid" }, String(language));
  assert.equal((await reviewRows(sheet)).length, 0);
});

// =========================== original-language text ===========================
const HINDI = "काम बहुत अच्छा था और समय पर पूरा हुआ।";

test("17. a Hindi review is stored exactly as written; the English field stays empty and marked pending", async () => {
  const { sheet, token } = await readyToReview();
  const r = await submitReview(sheet, { token, language: "hi", input: { overall: 5, comment: HINDI } }, ENV, nid("W"));
  assert.deepEqual([r.ok, r.translation], [true, "pending"]);
  const [row] = await reviewRows(sheet);
  assert.deepEqual([row.comment, row.comment_language, row.comment_english, row.translation_status, row.translation_method], [HINDI, "hi", "", "pending", "none"]);
});

test("17. with a (mock) translation provider the English text is added next to the original, never instead of it", async () => {
  const { sheet, token } = await readyToReview();
  const provider = createMockProvider({ translations: { [HINDI]: "The work was very good and finished on time." } });
  await submitReview(sheet, { token, language: "mr", input: { overall: 5, comment: HINDI } }, { ...ENV, provider }, nid("W"));
  const [row] = await reviewRows(sheet);
  assert.deepEqual([row.comment, row.comment_english, row.translation_status, row.translation_method], [HINDI, "The work was very good and finished on time.", "translated", "mock"]);
  assert.equal(provider.calls.length, 1);
});

test("an English review needs no translation; an empty comment calls nothing", async () => {
  const provider = createMockProvider();
  const a = await readyToReview();
  await submitReview(a.sheet, { token: a.token, language: "en", input: { overall: 4, comment: "Tidy work." } }, { ...ENV, provider }, nid("W"));
  const [rowA] = await reviewRows(a.sheet);
  assert.deepEqual([rowA.comment, rowA.comment_english, rowA.translation_status], ["Tidy work.", "Tidy work.", "not_needed"]);
  const b = await readyToReview();
  await submitReview(b.sheet, { token: b.token, language: "hi", input: { overall: 4 } }, { ...ENV, provider }, nid("W"));
  assert.equal(provider.calls.length, 0);
});

// =========================== rating arithmetic ===========================
const mk = (contractorId, jobId, overall, w = null, p = null, c = null) => ({ id: `W-${jobId}`, recordType: "TEST", jobId, requestId: `R-${jobId}`, contractorId, inviteId: "V", submittedAt: "t", overall, workmanship: w, punctuality: p, communication: c, comment: "", commentLanguage: "en", commentEnglish: "", translationStatus: "not_needed", translationMethod: "none" });
const done = (contractorId, jobId) => ({ id: jobId, recordType: "TEST", requestId: `R-${jobId}`, contractorId, status: "completed", completionDate: "", selectedAt: "t", updatedAt: "t", history: [] });

test("12. the average and the number of reviews are calculated from real reviews", () => {
  const reviews = [mk(A, "1", 5), mk(A, "2", 4), mk(A, "3", 3), mk(A, "4", 4)];
  const s = R.summarize(reviews);
  assert.deepEqual([s.count, s.average, s.confidence], [4, 4, "established"]);
  assert.equal(R.summarize([mk(A, "1", 5), mk(A, "2", 4)]).average, 4.5);
  assert.equal(R.summarize([mk(A, "1", 5), mk(A, "2", 4), mk(A, "3", 4)]).average, 4.3, "4.333 rounds to 4.3");
  assert.equal(R.summarize([mk(A, "1", 4), mk(A, "2", 5), mk(A, "3", 5), mk(A, "4", 5)]).average, 4.8, "4.75 rounds half up to 4.8");
  assert.equal(R.summarize([mk(A, "1", 1)]).average, 1);
});

test("13. a missing optional score is not counted as zero: each category uses only the reviews that scored it", () => {
  const s = R.summarize([mk(A, "1", 5, 5, null, null), mk(A, "2", 4, 3, 4, null), mk(A, "3", 3, null, null, null)]);
  assert.deepEqual(s.criteria.workmanship, { average: 4, count: 2 });
  assert.deepEqual(s.criteria.punctuality, { average: 4, count: 1 });
  assert.deepEqual(s.criteria.communication, { average: null, count: 0 });
  assert.equal(s.average, 4, "the overall average is unaffected by missing categories");
});

test("14. no reviews is 'Not yet rated', never a low score; one or two reviews are called too few to judge", () => {
  assert.equal(R.ratingText(undefined), "Not yet rated");
  assert.equal(R.ratingText(R.summarize([])), "Not yet rated");
  assert.deepEqual(R.summarize([]), { count: 0, average: null, criteria: { workmanship: { average: null, count: 0 }, punctuality: { average: null, count: 0 }, communication: { average: null, count: 0 } }, confidence: "none" });
  assert.equal(R.ratingText(R.summarize([mk(A, "1", 5)])), "5.0 out of 5 from 1 review (too few to judge)");
  assert.equal(R.ratingText(R.summarize([mk(A, "1", 5), mk(A, "2", 4)])), "4.5 out of 5 from 2 reviews (too few to judge)");
  assert.equal(R.ratingText(R.summarize([mk(A, "1", 5), mk(A, "2", 4), mk(A, "3", 4)])), "4.3 out of 5 from 3 reviews");
  assert.ok(!/excellent|good|poor|fair|high quality|best/i.test(R.ratingText(R.summarize([mk(A, "1", 5), mk(A, "2", 5), mk(A, "3", 5)]))), "no quality label");
});

test("only valid reviews of COMPLETED jobs by the job's own contractor are counted, once per job", () => {
  const jobs = [done(A, "1"), done(A, "2"), { ...done(A, "3"), status: "cancelled" }, done(B, "4")];
  const reviews = [
    mk(A, "1", 5), mk(A, "1", 1), // a second review for the same job is ignored
    mk(A, "2", 4),
    mk(A, "3", 5), // job cancelled: not counted
    mk(A, "4", 5), // job 4 belongs to B: wrong contractor, not counted
    mk(A, "ghost", 5), // job does not exist
    mk(B, "4", 3),
  ];
  const sums = R.summariesByContractor(reviews, jobs);
  assert.deepEqual([sums.get(A).count, sums.get(A).average], [2, 4.5]);
  assert.deepEqual([sums.get(B).count, sums.get(B).average], [1, 3]);
  assert.equal(sums.get(CID(9)), undefined, "a contractor with no valid review has no entry");
});

test("a job later corrected from completed to cancelled stops counting, and counting again if corrected back; never twice", async () => {
  const { sheet, token } = await readyToReview();
  await review(sheet, token, { overall: 5 });
  assert.equal((await loadSummaries(sheet, "TEST")).get(A).count, 1);
  await correctJob(sheet, { requestId: REQ_ID, status: "cancelled", reason: "Entered by mistake" }, JENV);
  assert.equal((await loadSummaries(sheet, "TEST")).get(A), undefined);
  await correctJob(sheet, { requestId: REQ_ID, status: "completed", completionDate: TODAY, reason: "It did finish" }, JENV);
  assert.equal((await loadSummaries(sheet, "TEST")).get(A).count, 1, "one review, counted once");
});

test("hand-edited review rows are ignored, never guessed", () => {
  const good = { review_id: "W-1", record_type: "TEST", job_id: "J-1", request_id: REQ_ID, contractor_id: A, invite_id: "V", submitted_at: "t", overall: "4", workmanship: "", punctuality: "", communication: "", comment: "", comment_language: "en", comment_english: "", translation_status: "not_needed", translation_method: "none", status: "valid" };
  assert.ok(R.parseReviewRow(good));
  for (const patch of [{ overall: "9" }, { overall: "" }, { overall: "great" }, { status: "hidden" }, { status: "" }, { record_type: "X" }, { contractor_id: "" }]) {
    assert.equal(R.parseReviewRow({ ...good, ...patch }), null, JSON.stringify(patch));
  }
  assert.equal(R.parseReviewRow({ ...good, workmanship: "9" }).workmanship, null, "an unreadable optional score is not a score");
});

test("REAL and TEST reviews are kept apart", async () => {
  const { sheet, token } = await readyToReview();
  await review(sheet, token, { overall: 5 });
  assert.equal((await loadReviews(sheet, "REAL")).length, 0);
  assert.equal((await loadSummaries(sheet, "REAL")).size, 0);
  assert.equal((await describeInvite(sheet, token, { recordType: "REAL", now: NOW })).ok, false);
});

test("a missing Reviews, ReviewInvites or Jobs tab is a setup problem and writes nothing", async () => {
  const isSetupProblem = (e) => e.constructor.name === "SheetSetupError";
  // no ReviewInvites tab: an invitation cannot be made
  const noInvites = world({ tables: TABLES.filter((t) => t !== I.INVITE_TABLE) });
  await completedJob(noInvites);
  await assert.rejects(() => invite(noInvites), isSetupProblem);
  // no Reviews tab: an invitation cannot be made either (it checks for an earlier review)
  const noReviews = world({ tables: TABLES.filter((t) => t !== R.REVIEW_TABLE) });
  await completedJob(noReviews);
  await assert.rejects(() => invite(noReviews), isSetupProblem);
  // and if the tab disappears AFTER an invitation was made, saving the review fails safely
  const vanished = world(); await completedJob(vanished);
  const made = await invite(vanished);
  assert.equal(made.ok, true);
  delete vanished.tabs.Reviews;
  await assert.rejects(() => review(vanished, made.token), isSetupProblem);
  assert.equal(vanished.appended.filter(([range]) => range.startsWith("Reviews")).length, 0);
  const noJobs = world({ tables: TABLES.filter((t) => t !== JOB_TABLE) });
  await assert.rejects(() => invite(noJobs));
  assert.equal(noJobs.appended.length, 0);
});

test("the review flow never reads a phone number column", async () => {
  const { sheet, token } = await readyToReview();
  await review(sheet, token, { overall: 5 });
  await describeInvite(sheet, token, ENV);
  assert.ok(!sheet.ranges.some((r) => /^Contractors!I\d+:I$/.test(r) || /^Requests!E\d+:E$/.test(r)), sheet.ranges.join(" "));
});
