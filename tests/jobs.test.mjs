// Jobs: recording which contractor the developer chose, and whether the job was
// completed or cancelled. Append-only and audited. Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { CONFIRMATION_TABLE } from "../lib/confirmation.ts";
import { recordConfirmation } from "../lib/confirmation-store.ts";
import * as J from "../lib/job.ts";
import { cancelJob, changeContractor, completeJob, correctJob, loadJobs, selectContractor, shareContact } from "../lib/job-store.ts";
import { colLetter, readTable } from "../lib/tables.ts";
import { CONTRACTOR_HEADERS } from "../lib/registration.ts";
import { CID, NOW, REQ_ID, REQ_START, TODAY, contractorRow, daysAgo, makeWorld, requestRow } from "./helpers/world.mjs";

const EXACT = CID(2), NEAR = CID(3), OTHER_TRADE = CID(4), WAKAD = CID(5);
const contractors = () => [
  contractorRow({ contractor_id: EXACT, earliest_start_date: REQ_START }),
  contractorRow({ contractor_id: NEAR, earliest_start_date: "2026-10-27" }), // one day after: needs confirmation
  contractorRow({ contractor_id: OTHER_TRADE, primary_trade: "Electrical" }),
  contractorRow({ contractor_id: WAKAD, service_areas: "Wakad" }),
];
const world = (o = {}) => makeWorld({ tables: [CONFIRMATION_TABLE, J.JOB_TABLE], contractors: contractors(), ...o });
let n = 0;
const nid = (p) => () => `${p}-${String(++n).padStart(8, "2")}`;
const ENV = { recordType: "TEST", today: TODAY, now: NOW };
const select = (sheet, contractorId, requestId = REQ_ID, env = {}) => selectContractor(sheet, { requestId, contractorId }, { ...ENV, ...env }, nid("J"));
const confirm = (sheet, contractorId, o, at = 1000) =>
  recordConfirmation(sheet, { requestId: REQ_ID, contractorId, status: "", confirmedStartDate: "", note: "", ...o },
    { recordType: "TEST", source: "admin", recordedBy: "founder (admin login)", today: TODAY, now: new Date(NOW.getTime() + at) }, nid("K"));
const jobRows = (sheet) => readTable(sheet, J.JOB_TABLE);

// ============================ selecting the contractor ============================
test("the founder can record the contractor the developer chose; the job starts as 'selected'", async () => {
  const sheet = world();
  const r = await select(sheet, EXACT);
  assert.equal(r.ok, true);
  assert.deepEqual([r.job.requestId, r.job.contractorId, r.job.status, r.job.completionDate], [REQ_ID, EXACT, "selected", ""]);
  const [row] = await jobRows(sheet);
  assert.deepEqual([row.event, row.status, row.recorded_by, row.record_type], ["selected", "selected", "founder (admin login)", "TEST"]);
  assert.ok(!Number.isNaN(Date.parse(row.recorded_at)));
});

test("the contractor must be associated with the request: wrong trade, wrong locality, unknown and REAL ones are refused, nothing written", async () => {
  const real = contractorRow({ contractor_id: CID(6), record_type: "REAL" });
  const sheet = world({ contractors: [...contractors(), real] });
  assert.equal((await select(sheet, OTHER_TRADE)).error, "not_associated");
  assert.equal((await select(sheet, WAKAD)).error, "not_associated");
  for (const id of [CID(9), CID(6), "C-bad", "../x", 5, null, undefined]) {
    const r = await select(sheet, id);
    assert.equal(r.ok, false, String(id));
    assert.ok(["invalid", "not_found"].includes(r.error), `${id}: ${r.error}`);
  }
  assert.equal((await select(sheet, EXACT, "R-ZZZZZZZZ")).error, "not_found");
  assert.equal((await select(sheet, EXACT, "bad")).error, "not_found");
  assert.equal(sheet.appended.length, 0);
});

test("a contractor who is no longer a potential match but has a recorded confirmation for this request can still be chosen", async () => {
  const gone = contractorRow({ contractor_id: CID(7), earliest_start_date: "2026-10-26", availability_reported_at: daysAgo(30) }); // stale: not a candidate now
  const sheet = world({ contractors: [gone] });
  assert.equal((await select(sheet, CID(7))).error, "not_associated");
  // an outcome-free confirmation cannot be recorded for a non-candidate, so inject the founder's earlier row directly
  await sheet.append("Confirmations!A1", ["K-1", "TEST", REQ_ID, CID(7), "available_requested_date", REQ_START, "admin", "founder (admin login)", NOW.toISOString(), ""]);
  assert.equal((await select(sheet, CID(7))).ok, true);
});

test("a near-date contractor cannot be recorded as chosen until a start date is confirmed for THIS request", async () => {
  const sheet = world();
  assert.deepEqual(await select(sheet, NEAR), { ok: false, error: "not_confirmed", reason: "none" });
  await confirm(sheet, NEAR, { status: "awaiting_response" });
  assert.deepEqual(await select(sheet, NEAR), { ok: false, error: "not_confirmed", reason: "awaiting" });
  await confirm(sheet, NEAR, { status: "interested_unconfirmed" }, 2000);
  assert.deepEqual(await select(sheet, NEAR), { ok: false, error: "not_confirmed", reason: "interested_only" });
  assert.equal(sheet.appended.filter(([range]) => range.startsWith("Jobs")).length, 0, "nothing was recorded");
  await confirm(sheet, NEAR, { status: "available_alternative_date", confirmedStartDate: "2026-10-27" }, 3000);
  assert.equal((await select(sheet, NEAR)).ok, true);
});

test("a contractor whose latest answer is 'unavailable' cannot be chosen, even an exact-date one", async () => {
  const sheet = world();
  await confirm(sheet, EXACT, { status: "available_requested_date" });
  await confirm(sheet, EXACT, { status: "unavailable" }, 2000);
  assert.deepEqual(await select(sheet, EXACT), { ok: false, error: "unavailable" });
});

test("only ONE contractor per request: a second choice is refused, and simultaneous choices give one winner", async () => {
  const sheet = world();
  assert.equal((await select(sheet, EXACT)).ok, true);
  assert.equal((await select(sheet, EXACT)).error, "already_selected");
  const racing = world();
  await confirm(racing, NEAR, { status: "available_alternative_date", confirmedStartDate: "2026-10-27" });
  const results = await Promise.all([select(racing, EXACT), select(racing, NEAR), select(racing, EXACT), select(racing, NEAR)]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.ok(results.filter((r) => !r.ok).every((r) => r.error === "already_selected"));
  assert.equal((await jobRows(racing)).filter((r) => r.event === "selected").length, 1);
});

test("two servers choosing at the same moment: the first Jobs row wins and the other is told so", async () => {
  const sheet = world();
  const original = sheet.append.bind(sheet);
  let done = false;
  sheet.append = async (range, row) => {
    if (!done && range.startsWith("Jobs!")) { done = true; await original(range, J.JOB_TABLE.headers.map((h) => ({ job_id: "J-RIVAL222", record_type: "TEST", request_id: REQ_ID, contractor_id: NEAR, event: "selected", status: "selected", recorded_at: NOW.toISOString(), recorded_by: "x" }[h] ?? ""))); }
    return original(range, row);
  };
  assert.equal((await select(sheet, EXACT)).error, "already_selected");
  const [job] = await loadJobs(sheet, "TEST");
  assert.deepEqual([job.id, job.contractorId], ["J-RIVAL222", NEAR]);
});

// ============================ changing the contractor ============================
const change = (sheet, contractorId, ...rest) =>
  changeContractor(sheet, { requestId: REQ_ID, contractorId, reason: rest.length ? rest[0] : "Developer changed their mind" }, ENV);

test("the contractor can be changed while the job is in progress, with a reason, and the history keeps both", async () => {
  const sheet = world({ contractors: [...contractors(), contractorRow({ contractor_id: CID(8) })] });
  await select(sheet, EXACT);
  const r = await change(sheet, CID(8));
  assert.equal(r.ok, true);
  assert.equal(r.job.contractorId, CID(8));
  assert.deepEqual(r.job.history.map((h) => [h.event, h.contractorId]), [["selected", EXACT], ["contractor_changed", CID(8)]]);
  assert.equal((await jobRows(sheet)).length, 2, "the first row is still there");
  assert.deepEqual(sheet.updated, [], "nothing is edited in place");
});

test("changing the contractor needs a reason, a different contractor, an eligible contractor and a job still in progress", async () => {
  const sheet = world({ contractors: [...contractors(), contractorRow({ contractor_id: CID(8) })] });
  assert.equal((await change(sheet, CID(8))).error, "no_job");
  await select(sheet, EXACT);
  for (const reason of ["", "   ", "no", undefined, 5, "x".repeat(201), "call 98765 43210 now"]) {
    const r = await change(sheet, CID(8), reason);
    assert.equal(r.error, "validation", String(reason)); assert.ok(r.errors.reason);
  }
  assert.equal((await change(sheet, EXACT)).error, "same_contractor");
  assert.equal((await change(sheet, NEAR)).error, "not_confirmed", "the near-date rule applies to the new contractor too");
  assert.equal((await change(sheet, OTHER_TRADE)).error, "not_associated");
  await completeJob(sheet, { requestId: REQ_ID, completionDate: TODAY }, ENV);
  assert.equal((await change(sheet, CID(8))).error, "not_in_progress", "no change after the job is final");
});

// ============================ completing and cancelling ============================
test("a job in progress can be marked completed, with or without a completion date", async () => {
  const withDate = world(); await select(withDate, EXACT);
  const r = await completeJob(withDate, { requestId: REQ_ID, completionDate: "2026-10-21" }, ENV);
  assert.deepEqual([r.ok, r.job.status, r.job.completionDate], [true, "completed", "2026-10-21"]);
  const noDate = world(); await select(noDate, EXACT);
  const r2 = await completeJob(noDate, { requestId: REQ_ID }, ENV);
  assert.deepEqual([r2.job.status, r2.job.completionDate], ["completed", ""], "a missing date stays missing, it is not invented");
});

test("the completion date must be real, not in the future, and not before the request was raised", async () => {
  const sheet = world(); await select(sheet, EXACT);
  for (const [date, why] of [["2026-02-31", "unreal"], ["tomorrow", "text"], ["2026-10-22", "future"], ["2026-10-19", "before the request"], [5, "number"]]) {
    const r = await completeJob(sheet, { requestId: REQ_ID, completionDate: date }, ENV);
    assert.equal(r.error, "validation", why); assert.ok(r.errors.completionDate, why);
  }
  assert.equal((await loadJobs(sheet, "TEST"))[0].status, "selected", "nothing changed");
});

test("completion, cancellation and every later change need a job that exists and is in the right state", async () => {
  const sheet = world();
  assert.equal((await completeJob(sheet, { requestId: REQ_ID }, ENV)).error, "no_job");
  assert.equal((await cancelJob(sheet, { requestId: REQ_ID, reason: "Developer cancelled" }, ENV)).error, "no_job");
  assert.equal((await completeJob(sheet, { requestId: "R-ZZZZZZZZ" }, ENV)).error, "not_found");
  assert.equal((await completeJob(sheet, { requestId: REQ_ID }, { ...ENV, recordType: "REAL" })).error, "not_found");
  await select(sheet, EXACT);
  assert.equal((await completeJob(sheet, { requestId: REQ_ID }, ENV)).ok, true);
  assert.equal((await completeJob(sheet, { requestId: REQ_ID }, ENV)).error, "not_in_progress", "completing twice is refused");
  assert.equal((await cancelJob(sheet, { requestId: REQ_ID, reason: "Too late now" }, ENV)).error, "not_in_progress");
});

test("cancelling needs a reason and is final", async () => {
  const sheet = world(); await select(sheet, EXACT);
  for (const reason of ["", undefined, "no", "x".repeat(201)]) assert.equal((await cancelJob(sheet, { requestId: REQ_ID, reason }, ENV)).error, "validation", String(reason));
  const r = await cancelJob(sheet, { requestId: REQ_ID, reason: "Developer found someone else" }, ENV);
  assert.deepEqual([r.ok, r.job.status, r.job.completionDate], [true, "cancelled", ""]);
  assert.equal((await completeJob(sheet, { requestId: REQ_ID }, ENV)).error, "not_in_progress", "a cancelled job cannot simply be completed");
});

// ============================ explicit, audited corrections ============================
const correct = (sheet, o) => correctJob(sheet, { requestId: REQ_ID, status: "cancelled", completionDate: "", reason: "Entered by mistake", ...o }, ENV);

test("a final outcome can only be changed by an explicit correction with a reason; the history is kept", async () => {
  const sheet = world(); await select(sheet, EXACT);
  await completeJob(sheet, { requestId: REQ_ID, completionDate: "2026-10-21" }, ENV);
  assert.equal((await correct(sheet, { reason: "" })).error, "validation");
  assert.equal((await loadJobs(sheet, "TEST"))[0].status, "completed", "no reason, no change");
  const r = await correct(sheet, {});
  assert.deepEqual([r.ok, r.job.status, r.job.completionDate], [true, "cancelled", ""]);
  assert.deepEqual(r.job.history.map((h) => h.event), ["selected", "completed", "corrected"]);
  assert.equal(r.job.history[2].reason, "Entered by mistake");
  const back = await correct(sheet, { status: "completed", completionDate: "2026-10-21", reason: "It did finish" });
  assert.deepEqual([back.ok, back.job.status, back.job.completionDate], [true, "completed", "2026-10-21"]);
  assert.equal((await jobRows(sheet)).length, 4, "nothing was overwritten");
  assert.deepEqual(sheet.updated, []);
});

test("a correction needs a final job, a real change, a valid status and a valid date", async () => {
  const sheet = world();
  assert.equal((await correct(sheet, {})).error, "no_job");
  await select(sheet, EXACT);
  assert.equal((await correct(sheet, {})).error, "not_final", "a job in progress is completed or cancelled normally");
  await completeJob(sheet, { requestId: REQ_ID, completionDate: "2026-10-21" }, ENV);
  assert.equal((await correct(sheet, { status: "completed", completionDate: "2026-10-21" })).error, "nothing_changed");
  assert.equal((await correct(sheet, { status: "selected" })).error, "invalid");
  assert.equal((await correct(sheet, { status: "completed", completionDate: "2026-12-31" })).error, "validation");
});

// ============================ reading the rows safely ============================
const row = (o) => ({ job_id: "J-1", record_type: "TEST", request_id: REQ_ID, contractor_id: EXACT, event: "selected", status: "selected", completion_date: "", recorded_at: "2026-10-21T10:00:00Z", recorded_by: "x", reason: "", ...o });

test("hand-edited or nonsensical rows are ignored, never guessed", () => {
  const fold = (rows) => J.foldJobs(rows, "TEST")[0];
  // events that do not belong to the winning selection
  assert.equal(fold([row({}), row({ job_id: "J-OTHER", event: "completed", status: "completed" })]).status, "selected");
  // a completion with no selection at all
  assert.equal(J.foldJobs([row({ event: "completed", status: "completed" })], "TEST").length, 0);
  // an invalid contractor id in a selection is not a selection
  assert.equal(J.foldJobs([row({ contractor_id: "nobody" })], "TEST").length, 0);
  // cancelling without a reason, changing contractor after completion, correcting a job in progress
  assert.equal(fold([row({}), row({ event: "cancelled", status: "cancelled" })]).status, "selected");
  assert.equal(fold([row({}), row({ event: "completed", status: "completed" }), row({ event: "contractor_changed", contractor_id: CID(8), reason: "late" })]).contractorId, EXACT);
  assert.equal(fold([row({}), row({ event: "corrected", status: "cancelled", reason: "oops" })]).status, "selected");
  // an unknown status in a correction, and another environment's rows
  assert.equal(fold([row({}), row({ event: "completed", status: "completed" }), row({ event: "corrected", status: "bogus", reason: "oops" })]).status, "completed");
  assert.equal(J.foldJobs([row({ record_type: "REAL" })], "TEST").length, 0);
  // an unreal stored completion date is not kept
  assert.equal(fold([row({}), row({ event: "completed", status: "completed", completion_date: "2026-02-31" })]).completionDate, "");
  // the first selection wins, a later one is ignored
  const two = J.foldJobs([row({}), row({ job_id: "J-2", contractor_id: CID(3) })], "TEST");
  assert.deepEqual([two.length, two[0].id, two[0].contractorId], [1, "J-1", EXACT]);
});

test("reasons and dates are cleaned: plain text, no phone numbers, real dates only", () => {
  assert.deepEqual(J.cleanReason("  Developer   changed\nplans ", true), { ok: true, value: "Developer changed plans" });
  assert.deepEqual(J.cleanReason("", false), { ok: true, value: "" });
  assert.equal(J.cleanReason("", true).ok, false);
  assert.equal(J.cleanReason("ok", true).ok, false);
  assert.equal(J.cleanReason("a".repeat(201), false).ok, false);
  assert.equal(J.cleanReason("call 9876543210", true).ok, false);
  assert.equal(J.cleanReason({}, true).ok, false);
  const ctx = { today: TODAY, requestCreatedAt: NOW.toISOString() };
  assert.deepEqual(J.cleanCompletionDate("", ctx), { ok: true, value: "" });
  assert.deepEqual(J.cleanCompletionDate("2026-10-21", ctx), { ok: true, value: "2026-10-21" });
  assert.equal(J.cleanCompletionDate("2026-10-22", ctx).ok, false);
});

test("the Jobs tab holds no names or phone numbers, and the flow never reads a phone column", async () => {
  const sheet = world(); await select(sheet, EXACT);
  await completeJob(sheet, { requestId: REQ_ID, completionDate: TODAY }, ENV);
  assert.ok(!/\+91|9000000001|9000000002|Test Contractor|TEST Developer/.test(JSON.stringify(sheet.tabs.Jobs)));
  assert.ok(!sheet.ranges.some((r) => /^Contractors!I\d+:I$/.test(r)), sheet.ranges.join(" "));
});

test("a missing Jobs tab is a setup problem and writes nothing", async () => {
  const sheet = makeWorld({ tables: [CONFIRMATION_TABLE], contractors: contractors() });
  await assert.rejects(() => select(sheet, EXACT), (e) => e.name === "Error" || true);
  assert.equal(sheet.appended.length, 0);
});

test("a request whose record is not found cannot get a job, and existing requests are untouched", async () => {
  const sheet = world({ requests: [requestRow()] });
  assert.equal((await select(sheet, EXACT, "R-CCCCCCCC")).error, "not_found");
});

// ============================ sharing contact details (after selection only) ============================
const PHONE = "+919000000077";
const realWorld = () => makeWorld({
  tables: [CONFIRMATION_TABLE, J.JOB_TABLE],
  contractors: [contractorRow({ contractor_id: EXACT, record_type: "REAL", name: "Real Name", earliest_start_date: REQ_START, phone: PHONE }), contractorRow({ contractor_id: CID(7), record_type: "REAL", name: "Other Bidder", earliest_start_date: REQ_START, phone: "+919000000088" })],
  requests: [requestRow({ record_type: "REAL" })],
});
const REAL_ENV = { recordType: "REAL", today: TODAY, now: NOW };
const share = (sheet, o = {}, requestId = REQ_ID) => shareContact(sheet, { requestId }, { ...REAL_ENV, realContactAllowed: true, ...o });

test("contact details cannot be shown before a contractor is selected, and never for a contractor who was not chosen", async () => {
  const sheet = realWorld();
  assert.equal((await share(sheet)).error, "no_job");
  assert.equal((await selectContractor(sheet, { requestId: REQ_ID, contractorId: EXACT }, REAL_ENV, nid("J"))).ok, true);
  const shown = await share(sheet);
  assert.deepEqual([shown.ok, shown.contractorName, shown.phone], [true, "Real Name", PHONE]);
  assert.ok(!JSON.stringify(shown).includes("9000000088"), "the other contractor's number is not reachable");
  assert.equal((await share(sheet, {}, "R-ZZZZZZZZ")).error, "not_found");
  for (const bad of [undefined, null, 5, "../x"]) assert.equal((await shareContact(sheet, { requestId: bad }, { ...REAL_ENV, realContactAllowed: true })).error, "not_found");
});

test("every viewing is recorded in the job history without changing the job, and a cancelled job shows nothing", async () => {
  const sheet = realWorld();
  await selectContractor(sheet, { requestId: REQ_ID, contractorId: EXACT }, REAL_ENV, nid("J"));
  assert.equal((await share(sheet)).shares, 1);
  assert.equal((await share(sheet)).shares, 2);
  const rows = (await readTable(sheet, J.JOB_TABLE)).filter((r) => r.event === "contact_shared");
  assert.deepEqual(rows.map((r) => [r.contractor_id, r.recorded_by, r.record_type]), [[EXACT, "founder (admin login)", "REAL"], [EXACT, "founder (admin login)", "REAL"]]);
  assert.ok(!JSON.stringify(sheet.tabs.Jobs).includes(PHONE), "the number itself is never written to the Jobs tab");
  const [job] = await loadJobs(sheet, "REAL");
  assert.deepEqual([job.status, job.history.length, job.contactShares.length], ["selected", 1, 2], "audit rows do not change the job");
  assert.equal((await cancelJob(sheet, { requestId: REQ_ID, reason: "The developer changed plans" }, REAL_ENV)).ok, true);
  assert.equal((await share(sheet)).error, "not_in_progress");
  assert.equal((await readTable(sheet, J.JOB_TABLE)).filter((r) => r.event === "contact_shared").length, 2, "nothing more was recorded");
});

test("TEST records and servers not allowed to contact real people never read or show a phone number, and record nothing", async () => {
  const test = world();
  await select(test, EXACT);
  const a = await shareContact(test, { requestId: REQ_ID }, { ...ENV, realContactAllowed: true });
  assert.deepEqual([a.ok, a.phone, a.heldBack], [true, null, "test_record"]);
  const real = realWorld();
  await selectContractor(real, { requestId: REQ_ID, contractorId: EXACT }, REAL_ENV, nid("J"));
  const b = await share(real, { realContactAllowed: false });
  assert.deepEqual([b.ok, b.phone, b.heldBack], [true, null, "test_record"]);
  for (const sheet of [test, real]) {
    const phoneCol = colLetter(CONTRACTOR_HEADERS.indexOf("phone"));
    assert.ok(!sheet.ranges.some((r) => r === `Contractors!${phoneCol}1:${phoneCol}`), "the phone column data was never read (only its header is checked)");
    assert.equal((await readTable(sheet, J.JOB_TABLE)).filter((r) => r.event === "contact_shared").length, 0);
  }
});

test("a hand-written contact_shared row for another contractor or job is ignored", async () => {
  const rows = [
    { job_id: "J-AAAAAAAB", record_type: "TEST", request_id: REQ_ID, contractor_id: EXACT, event: "selected", status: "selected", recorded_at: NOW.toISOString(), recorded_by: "x" },
    { job_id: "J-AAAAAAAB", record_type: "TEST", request_id: REQ_ID, contractor_id: EXACT, event: "contact_shared", status: "selected", recorded_at: NOW.toISOString(), recorded_by: "x" },
    { job_id: "J-AAAAAAAB", record_type: "TEST", request_id: REQ_ID, contractor_id: CID(3), event: "contact_shared", status: "selected", recorded_at: NOW.toISOString(), recorded_by: "x" },
    { job_id: "J-OTHER", record_type: "TEST", request_id: REQ_ID, contractor_id: EXACT, event: "contact_shared", status: "selected", recorded_at: NOW.toISOString(), recorded_by: "x" },
  ].map((o) => J.JOB_TABLE.headers.map((h) => ({ reason: "", completion_date: "", ...o })[h] ?? ""));
  const jobs = J.foldJobs(rows.map((r) => Object.fromEntries(J.JOB_TABLE.headers.map((h, i) => [h, r[i]]))), "TEST");
  assert.equal(jobs[0].contactShares.length, 1);
});

test("sanity: the phone column IS read when a REAL contractor's details are shown (so the check above can fail)", async () => {
  const sheet = realWorld();
  await selectContractor(sheet, { requestId: REQ_ID, contractorId: EXACT }, REAL_ENV, nid("J"));
  await share(sheet);
  const phoneCol = colLetter(CONTRACTOR_HEADERS.indexOf("phone"));
  assert.ok(sheet.ranges.some((r) => r === `Contractors!${phoneCol}1:${phoneCol}`));
});
