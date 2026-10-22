// Two follow-ups to bidding, tested on a pretend Sheet with synthetic data:
//   1. when the contractor on a job is changed (or chosen outside the bid screen),
//      the Bids tab records which bid that was, in order;
//   2. each bid shows its contractor's latest written feedback from valid reviews.
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import * as B from "../lib/bid.ts";
import { BID_INVITE_TABLE } from "../lib/bid-invite.ts";
import { buildBidPanel } from "../lib/bid-overview.ts";
import { createBidInvite, loadBidInvites, openBidding, recordChosenBid, selectBidder, submitBid, voidBid } from "../lib/bid-store.ts";
import { loadBidWorkspace } from "../app/admin/requests/[id]/bid-data.ts";
import BidPanel from "../app/admin/requests/[id]/BidPanel.tsx";
import { CONFIRMATION_TABLE } from "../lib/confirmation.ts";
import { loadConfirmations } from "../lib/confirmation-store.ts";
import { INVITE_TABLE } from "../lib/invite.ts";
import { JOB_TABLE } from "../lib/job.ts";
import { cancelJob, changeContractor, completeJob, correctJob, loadJobs, selectContractor } from "../lib/job-store.ts";
import { LANGUAGE_TABLE } from "../lib/language-store.ts";
import { matchContractors } from "../lib/match.ts";
import { loadContractors, loadRequests } from "../lib/records.ts";
import { REVIEW_TABLE, recentComments } from "../lib/review.ts";
import { createInvite, loadReviews, loadSummaries, submitReview } from "../lib/review-store.ts";
import { readTable } from "../lib/tables.ts";
import { CID, NOW, REQ_ID, REQ_START, TODAY, contractorRow, makeWorld } from "./helpers/world.mjs";

const A = CID(2), TWO = CID(6);
const TABLES = [CONFIRMATION_TABLE, LANGUAGE_TABLE, JOB_TABLE, INVITE_TABLE, REVIEW_TABLE, B.BID_TABLE, BID_INVITE_TABLE];
const world = () =>
  makeWorld({
    tables: TABLES,
    contractors: [
      contractorRow({ contractor_id: A, name: "Asha Test", earliest_start_date: REQ_START, phone: "+919000000011" }),
      contractorRow({ contractor_id: TWO, name: "Esha Test", earliest_start_date: REQ_START, phone: "+919000000015" }),
    ],
  });
const LETTERS = "ABCDEFGHJK";
let n = 100;
const nid = (p) => () => `${p}-${String(++n).split("").map((d) => LETTERS[Number(d)]).join("").padStart(8, "A")}`;
const ENV = { recordType: "TEST", today: TODAY, now: NOW };
const tokenEnv = { recordType: "TEST", now: NOW };
const invite = (sheet, contractorId) => createBidInvite(sheet, { requestId: REQ_ID, contractorId }, ENV, nid("I"));
const markers = async (sheet) => (await readTable(sheet, B.BID_TABLE)).filter((r) => r.event === "selected").map((r) => r.contractor_id);
const change = (sheet, contractorId) =>
  changeContractor(sheet, { requestId: REQ_ID, contractorId, reason: "The developer preferred the other bidder" }, ENV);

async function twoBids() {
  const sheet = world();
  await openBidding(sheet, { requestId: REQ_ID }, ENV, nid("E"));
  const a = await invite(sheet, A);
  const b = await invite(sheet, TWO);
  const ra = await submitBid(sheet, { token: a.token, input: { amount: "20", unit: "per_sqft" }, language: "en" }, tokenEnv, nid("B"));
  const rb = await submitBid(sheet, { token: b.token, input: { amount: "25", unit: "per_sqft" }, language: "en" }, tokenEnv, nid("B"));
  assert.equal(ra.ok && rb.ok, true);
  return { sheet, ra, rb };
}
const select = (sheet, bidId) => selectBidder(sheet, { requestId: REQ_ID, bidId }, ENV, nid("J"));

async function panelOf(sheet) {
  const [request] = await loadRequests(sheet);
  const cs = await loadContractors(sheet);
  const rows = await readTable(sheet, B.BID_TABLE);
  const round = B.foldRound(rows, "TEST", REQ_ID);
  const jobs = await loadJobs(sheet, "TEST");
  const job = jobs.find((j) => j.requestId === REQ_ID);
  const reviews = await loadReviews(sheet, "TEST");
  const bids = B.foldBids(rows, "TEST").filter((x) => x.requestId === REQ_ID);
  return buildBidPanel({
    request, round, state: B.biddingState(round, job, NOW.getTime()), job, bids,
    invites: (await loadBidInvites(sheet, "TEST")).filter((i) => i.requestId === REQ_ID),
    candidates: matchContractors(request, cs, { envType: "TEST", now: NOW, max: 99 }).candidates,
    contractorNames: new Map(cs.map((c) => [c.id, c.name])),
    confirmations: await loadConfirmations(sheet, "TEST"),
    summaries: await loadSummaries(sheet, "TEST"),
    reviewComments: new Map(bids.map((b) => [b.contractorId, recentComments(reviews, jobs, b.contractorId)])),
    nowMs: NOW.getTime(),
  });
}

// ============================ fix 1: the chosen bid follows the contractor on the job ============================
test("changing the contractor to another bidder records THEIR bid as chosen, in order, and the panel follows the job", async () => {
  const { sheet, ra, rb } = await twoBids();
  assert.equal((await select(sheet, ra.bidId)).ok, true);
  assert.deepEqual(await markers(sheet), [A]);

  assert.equal((await change(sheet, TWO)).ok, true);
  assert.equal(await recordChosenBid(sheet, { requestId: REQ_ID }, ENV), "recorded");
  assert.deepEqual(await markers(sheet), [A, TWO], "an audit trail: first A, then B");
  let panel = await panelOf(sheet);
  assert.deepEqual([panel.selectedContractorId, panel.selectedBidId], [TWO, rb.bidId]);
  assert.deepEqual(panel.groups.flatMap((g) => g.bids).map((x) => [x.contractorId, x.chosen]), [[A, false], [TWO, true]]);
  assert.equal(await recordChosenBid(sheet, { requestId: REQ_ID }, ENV), "none", "running it again adds nothing");
  assert.equal((await readTable(sheet, JOB_TABLE)).filter((r) => r.event === "selected").length, 1, "still one job");

  assert.equal((await change(sheet, A)).ok, true); // and back again
  assert.equal(await recordChosenBid(sheet, { requestId: REQ_ID }, ENV), "recorded");
  assert.deepEqual(await markers(sheet), [A, TWO, A]);
  panel = await panelOf(sheet);
  assert.deepEqual([panel.selectedContractorId, panel.selectedBidId], [A, ra.bidId]);
});

test("a withdrawn bid, a contractor with no bid, a cancelled job and unusable input record nothing", async () => {
  // contractor changed to someone whose bid was withdrawn
  const first = await twoBids();
  await voidBid(first.sheet, { requestId: REQ_ID, bidId: first.rb.bidId, reason: "Withdrawn at their request" }, ENV);
  await select(first.sheet, first.ra.bidId);
  assert.equal((await change(first.sheet, TWO)).ok, true);
  assert.equal(await recordChosenBid(first.sheet, { requestId: REQ_ID }, ENV), "none", "a withdrawn bid is never recorded as chosen");
  assert.deepEqual(await markers(first.sheet), [A]);
  assert.equal((await panelOf(first.sheet)).selectedBidId, "", "the contractor is on the job without a live bid");

  // a cancelled job
  const second = await twoBids();
  await select(second.sheet, second.ra.bidId);
  await cancelJob(second.sheet, { requestId: REQ_ID, reason: "The developer paused the work" }, ENV);
  assert.equal(await recordChosenBid(second.sheet, { requestId: REQ_ID }, ENV), "none");

  // no job yet, and bad input
  const third = await twoBids();
  assert.equal(await recordChosenBid(third.sheet, { requestId: REQ_ID }, ENV), "none");
  for (const bad of [undefined, null, 5, "../x", "R-ZZZZZZZZ"]) assert.equal(await recordChosenBid(third.sheet, { requestId: bad }, ENV), "none", String(bad));
});

test("with no bid tabs it is a quiet 'none'; a write failure is 'failed', the job stays correct, and choosing the same bidder again repairs it", async () => {
  const noTabs = makeWorld({ tables: [CONFIRMATION_TABLE, JOB_TABLE], contractors: [contractorRow({ contractor_id: A, earliest_start_date: REQ_START })] });
  await selectContractor(noTabs, { requestId: REQ_ID, contractorId: A }, ENV, nid("J"));
  assert.equal(await recordChosenBid(noTabs, { requestId: REQ_ID }, ENV), "none");

  const { sheet, ra, rb } = await twoBids();
  await select(sheet, ra.bidId);
  await change(sheet, TWO);
  const realAppend = sheet.append.bind(sheet);
  let failures = 1;
  sheet.append = async (range, row) => {
    if (range.startsWith("Bids!") && row[4] === "selected" && failures-- > 0) throw new Error("network blip");
    return realAppend(range, row);
  };
  assert.equal(await recordChosenBid(sheet, { requestId: REQ_ID }, ENV), "failed");
  assert.equal((await loadJobs(sheet, "TEST"))[0].contractorId, TWO, "the job itself is correct");
  const repaired = await select(sheet, rb.bidId);
  assert.deepEqual([repaired.ok, repaired.completedMarker], [true, true]);
  assert.deepEqual(await markers(sheet), [A, TWO]);
  assert.equal((await select(sheet, ra.bidId)).error, "already_selected", "the other bidder still cannot be chosen over the job's contractor");
});

test("choosing a bidder in the Phase 4 box (outside the bid screen) also records which bid it was", async () => {
  const { sheet, rb } = await twoBids();
  await selectContractor(sheet, { requestId: REQ_ID, contractorId: TWO }, ENV, nid("J"));
  assert.equal(await recordChosenBid(sheet, { requestId: REQ_ID }, ENV), "recorded");
  assert.equal((await panelOf(sheet)).selectedBidId, rb.bidId);
});

// ============================ fix 2: latest written feedback beside each bid ============================
const job = (id, requestId, contractorId = A, status = "completed") => ({ id, recordType: "TEST", requestId, contractorId, status, completionDate: "", selectedAt: "", updatedAt: "", history: [], contactShares: [] });
const JOBS = [job("J-1", REQ_ID), job("J-2", "R-CCCCCCCC"), job("J-3", "R-DDDDDDDD"), job("J-4", "R-EEEEEEEE", A, "cancelled"), job("J-5", "R-FFFFFFFF"), job("J-6", "R-GGGGGGGG", TWO)];
const R = (o = {}) => ({ id: "W-1", recordType: "TEST", jobId: "J-1", requestId: REQ_ID, contractorId: A, inviteId: "V-1", submittedAt: "2026-10-20T00:00:00.000Z", overall: 4, workmanship: null, punctuality: null, communication: null, comment: "Good work", commentLanguage: "en", commentEnglish: "", translationStatus: "not_needed", translationMethod: "none", ...o });

test("recent comments: valid reviews only, with text only, newest first, at most three, only this contractor", () => {
  const reviews = [
    R({ id: "W-1", jobId: "J-1", submittedAt: "2026-10-01T00:00:00.000Z", comment: "oldest" }),
    R({ id: "W-2", jobId: "J-2", requestId: "R-CCCCCCCC", submittedAt: "2026-10-02T00:00:00.000Z", comment: "second" }),
    R({ id: "W-3", jobId: "J-3", requestId: "R-DDDDDDDD", submittedAt: "2026-10-03T00:00:00.000Z", comment: "third" }),
    R({ id: "W-4", jobId: "J-5", requestId: "R-FFFFFFFF", submittedAt: "2026-10-04T00:00:00.000Z", comment: "newest" }),
    R({ id: "W-5", jobId: "J-4", requestId: "R-EEEEEEEE", submittedAt: "2026-10-09T00:00:00.000Z", comment: "cancelled job" }),
    R({ id: "W-6", jobId: "J-6", requestId: "R-GGGGGGGG", contractorId: TWO, submittedAt: "2026-10-10T00:00:00.000Z", comment: "someone else" }),
    R({ id: "W-7", jobId: "J-1", submittedAt: "2026-10-11T00:00:00.000Z", comment: "second review for the same job" }),
    R({ id: "W-8", jobId: "J-NOPE", submittedAt: "2026-10-12T00:00:00.000Z", comment: "no such job" }),
    R({ id: "W-9", jobId: "J-3", requestId: "R-WRONG", submittedAt: "2026-10-13T00:00:00.000Z", comment: "wrong request" }),
  ];
  assert.deepEqual(recentComments(reviews, JOBS, A).map((c) => c.comment), ["newest", "third", "second"], "newest first, three at most, nothing invalid");
  assert.deepEqual(recentComments(reviews, JOBS, TWO).map((c) => c.comment), ["someone else"]);
  assert.deepEqual(recentComments(reviews, JOBS, CID(9)), []);
  assert.deepEqual(recentComments([R({ comment: "   " }), R({ id: "W-2", comment: "" })], JOBS, A), [], "scores without words are not comments");
  assert.equal(recentComments(reviews, JOBS, A, 1).length, 1);
});

test("comments keep the original wording; 'English version pending' only for Hindi or Marathi text with no real translation", () => {
  const one = (o) => recentComments([R(o)], JOBS, A)[0];
  assert.deepEqual([one({}).englishPending, one({}).commentEnglish], [false, ""]);
  const hi = one({ commentLanguage: "hi", comment: "काम अच्छा था" });
  assert.deepEqual([hi.comment, hi.englishPending], ["काम अच्छा था", true]);
  assert.equal(one({ commentLanguage: "mr", comment: "काम चांगले" }).englishPending, true);
  const translated = one({ commentLanguage: "hi", comment: "काम", commentEnglish: "The work was good", translationStatus: "translated" });
  assert.deepEqual([translated.englishPending, translated.commentEnglish], [false, "The work was good"]);
  assert.equal(one({ commentLanguage: "", comment: "unknown language" }).englishPending, false, "an unknown language is not labelled as pending");
});

async function reviewed(comment, language = "en") {
  const { sheet, ra } = await twoBids();
  await select(sheet, ra.bidId);
  await completeJob(sheet, { requestId: REQ_ID, completionDate: "" }, ENV);
  const made = await createInvite(sheet, { requestId: REQ_ID }, tokenEnv, nid("V"));
  const sent = await submitReview(sheet, { token: made.token, input: { overall: 5, comment }, language }, tokenEnv, nid("W"));
  assert.equal(sent.ok, true);
  return sheet;
}

test("each bid's comparison data carries its contractor's latest valid comments, and none once the job is cancelled", async () => {
  const sheet = await reviewed("Finished early and tidy");
  const bidsShown = (await panelOf(sheet)).groups[0].bids;
  const asha = bidsShown.find((b) => b.contractorId === A);
  const esha = bidsShown.find((b) => b.contractorId === TWO);
  assert.deepEqual(asha.recentComments.map((c) => [c.comment, c.overall, c.commentLanguage, c.englishPending]), [["Finished early and tidy", 5, "en", false]]);
  assert.deepEqual(esha.recentComments, [], "another bidder's page is not affected");
  assert.ok(!JSON.stringify(asha.recentComments).match(/\+91|9000000\d{3}|[A-Za-z0-9_-]{43}/), "no phone number or token");
  await correctJob(sheet, { requestId: REQ_ID, status: "cancelled", reason: "Completed by mistake" }, ENV);
  assert.deepEqual((await panelOf(sheet)).groups[0].bids.find((b) => b.contractorId === A).recentComments, []);
});

test("the admin panel shows the comment, its language label and the pending note, and escapes any markup in it", async () => {
  const sheet = await reviewed("काम अच्छा <b>bold</b> था", "hi");
  const html = renderToStaticMarkup(createElement(BidPanel, { panel: await panelOf(sheet), today: "2026-10-21", telegram: { configured: false, testMode: true } }));
  assert.ok(html.includes("काम अच्छा &lt;b&gt;bold&lt;/b&gt; था"), "shown as written, with markup escaped");
  assert.ok(!html.includes("<b>bold</b>"));
  assert.ok(html.includes("Hindi, as written") && html.includes("English version pending"));
  assert.ok(html.includes("5/5"));
  assert.ok(!/\+91|9000000\d{3}/.test(html));
});

test("without a Reviews tab the bid panel still loads, with no comments and no error", async () => {
  const sheet = await reviewed("Fine work");
  delete sheet.tabs.Reviews;
  const [request] = await loadRequests(sheet);
  const space = await loadBidWorkspace(sheet, "TEST", request, await loadContractors(sheet), await loadConfirmations(sheet, "TEST"), null);
  assert.deepEqual(space.missingTabs, []);
  assert.ok(space.panel);
  assert.ok(space.panel.groups.flatMap((g) => g.bids).every((b) => b.recentComments.length === 0));
  assert.equal(space.panel.ratingsAvailable, false);
});
