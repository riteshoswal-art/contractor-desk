// Bidding: rounds, private invitations, one bid per contractor per job, price
// and unit checks, grouping by unit, and choosing a bidder through the existing
// job store. Pretend Sheet; synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import * as B from "../lib/bid.ts";
import { BID_INVITE_TABLE, evaluateBidInvite } from "../lib/bid-invite.ts";
import {
  cancelBidding, closeBidding, correctBid, createBidInvite, describeBidInvite, loadBidInvites, loadBids,
  openBidding, reopenBidding, selectBidder, submitBid, voidBid,
} from "../lib/bid-store.ts";
import { buildBidPanel } from "../lib/bid-overview.ts";
import { CONFIRMATION_TABLE, latestByPair } from "../lib/confirmation.ts";
import { recordConfirmation, loadConfirmations } from "../lib/confirmation-store.ts";
import { SheetSetupError } from "../lib/contractor-store.ts";
import { INVITE_TABLE } from "../lib/invite.ts";
import { JOB_TABLE } from "../lib/job.ts";
import { completeJob, loadJobs } from "../lib/job-store.ts";
import { LANGUAGE_TABLE } from "../lib/language-store.ts";
import { matchContractors } from "../lib/match.ts";
import { loadContractors, loadRequests } from "../lib/records.ts";
import { REVIEW_TABLE, recentComments } from "../lib/review.ts";
import { createInvite, loadReviews, loadSummaries, submitReview } from "../lib/review-store.ts";
import { readTable } from "../lib/tables.ts";
import { CID, NOW, REQ_ID, REQ_START, TODAY, contractorRow, makeWorld, requestRow } from "./helpers/world.mjs";

const EXACT = CID(2), NEAR = CID(3), OTHER_TRADE = CID(4), WAKAD = CID(5);
const TABLES = [CONFIRMATION_TABLE, LANGUAGE_TABLE, JOB_TABLE, INVITE_TABLE, REVIEW_TABLE, B.BID_TABLE, BID_INVITE_TABLE];
const contractors = () => [
  contractorRow({ contractor_id: EXACT, name: "Asha Test", earliest_start_date: REQ_START, phone: "+919000000011" }),
  contractorRow({ contractor_id: NEAR, name: "Bhim Test", earliest_start_date: "2026-10-27", phone: "+919000000012" }), // one day after: needs confirmation
  contractorRow({ contractor_id: OTHER_TRADE, name: "Chitra Test", primary_trade: "Electrical", phone: "+919000000013" }),
  contractorRow({ contractor_id: WAKAD, name: "Dev Test", service_areas: "Wakad", phone: "+919000000014" }),
];
const world = (o = {}) => makeWorld({ tables: TABLES, contractors: contractors(), ...o });

// Readable, unique, valid IDs: B-AAAAAABB, ... (no 0 or 1, which IDs never contain)
const LETTERS = "ABCDEFGHJK";
let n = 0;
const nid = (p) => () => `${p}-${String(++n).split("").map((d) => LETTERS[Number(d)]).join("").padStart(8, "A")}`;
const ENV = { recordType: "TEST", today: TODAY, now: NOW };
const at = (ms) => ({ ...ENV, now: new Date(NOW.getTime() + ms) });
const DAY = 86400_000;

const open = (sheet, extra = {}, env = ENV) => openBidding(sheet, { requestId: REQ_ID, ...extra }, env, nid("E"));
const invite = (sheet, contractorId, env = ENV) => createBidInvite(sheet, { requestId: REQ_ID, contractorId }, env, nid("I"));
const bid = (sheet, token, input, env = ENV, language = "en") =>
  submitBid(sheet, { token, input, language }, { recordType: env.recordType, now: env.now }, nid("B"));
const OK = { amount: "1250", unit: "per_sqft", notes: "Includes material" };
const select = (sheet, bidId, env = ENV) => selectBidder(sheet, { requestId: REQ_ID, bidId }, env, nid("J"));
const confirm = (sheet, contractorId, o, ms = 1000) =>
  recordConfirmation(sheet, { requestId: REQ_ID, contractorId, status: "", confirmedStartDate: "", note: "", ...o },
    { recordType: "TEST", source: "admin", recordedBy: "founder (admin login)", today: TODAY, now: new Date(NOW.getTime() + ms) }, nid("K"));
const rowsOf = (sheet, table) => readTable(sheet, table);
const submitted = async (sheet) => (await rowsOf(sheet, B.BID_TABLE)).filter((r) => r.event === "submitted");

// An open round with a live bid from the exact-date contractor.
async function withBid(sheet = world(), contractorId = EXACT, input = OK) {
  assert.equal((await open(sheet)).ok, true);
  const made = await invite(sheet, contractorId);
  assert.equal(made.ok, true);
  const sent = await bid(sheet, made.token, input);
  assert.equal(sent.ok, true);
  return { sheet, token: made.token, bidId: sent.bidId };
}

// ============================ 1. a valid, authorised bid ============================
test("an invited contractor can submit a valid bid; the contractor, job, time and currency are stored by the server", async () => {
  const sheet = world();
  await open(sheet);
  const made = await invite(sheet, EXACT);
  assert.match(made.token, /^[A-Za-z0-9_-]{43}$/);
  const r = await bid(sheet, made.token, OK);
  assert.deepEqual([r.ok, r.provisional], [true, false]);
  const [row] = await submitted(sheet);
  assert.deepEqual(
    [row.request_id, row.contractor_id, row.rate_amount, row.currency, row.rate_unit, row.notes, row.notes_language, row.record_type],
    [REQ_ID, EXACT, "1250.00", "INR", "per_sqft", "Includes material", "en", "TEST"],
  );
  assert.equal(row.recorded_at, NOW.toISOString(), "server time, not anything the browser sent");
  assert.equal(row.recorded_by, "contractor (invitation link)");
  const [one] = await loadBids(sheet, "TEST");
  assert.deepEqual([one.contractorId, one.amount, one.unit, one.voided], [EXACT, "1250.00", "per_sqft", false]);
});

// ============================ 2-5. who may bid ============================
test("an unknown, malformed, review or non-text token is refused and writes nothing", async () => {
  const { sheet } = await withBid();
  const before = sheet.appended.length;
  const reviewLike = "R".repeat(43);
  for (const t of [undefined, null, "", "short", "x".repeat(43), "x".repeat(44), reviewLike, REQ_ID, EXACT, 42, {}, ["a"]]) {
    assert.deepEqual(await bid(sheet, t, OK), { ok: false, error: "invalid_link" }, String(t));
    assert.deepEqual(await describeBidInvite(sheet, t, { recordType: "TEST", now: NOW }), { ok: false, reason: "invalid" }, `describe ${t}`);
  }
  assert.equal(sheet.appended.length, before);
});

test("a review invitation token cannot place a bid, and a bid token cannot write a review", async () => {
  const sheet = world();
  await open(sheet);
  const made = await invite(sheet, EXACT);
  // Put the SAME token into the review-invite tab: it must still not be a bid token elsewhere.
  assert.deepEqual(await submitReview(sheet, { token: made.token, input: { overall: 5 }, language: "en" }, { recordType: "TEST", now: NOW }, nid("W")), { ok: false, error: "invalid_link" });
});

test("an expired invitation is refused; it works right up to the moment it expires", async () => {
  const sheet = world();
  await open(sheet);
  const made = await invite(sheet, EXACT);
  const [row] = await loadBidInvites(sheet, "TEST");
  assert.equal(Date.parse(row.expiresAt) - Date.parse(row.createdAt), 14 * DAY);
  assert.deepEqual(await bid(sheet, made.token, OK, at(14 * DAY)), { ok: false, error: "expired" });
  assert.deepEqual(await describeBidInvite(sheet, made.token, { recordType: "TEST", now: at(14 * DAY).now }), { ok: false, reason: "expired" });
  assert.equal((await submitted(sheet)).length, 0);
  assert.equal((await bid(sheet, made.token, OK, at(2 * DAY))).ok, true, "still valid well before it expires");
});

test("a link belongs to ONE contractor: the contractor in the form is ignored, and an older link stops working when a newer one is made", async () => {
  const sheet = world();
  await open(sheet);
  const a = await invite(sheet, EXACT);
  const b = await invite(sheet, NEAR);
  // a user-editable field naming someone else changes nothing
  const r = await bid(sheet, a.token, { ...OK, contractorId: NEAR, contractor_id: NEAR, requestId: "R-CCCCCCCC" });
  assert.equal(r.ok, true);
  const [row] = await submitted(sheet);
  assert.deepEqual([row.contractor_id, row.request_id], [EXACT, REQ_ID]);
  // a's token cannot be used by b's contractor: b's token still works only for b
  const second = await bid(sheet, b.token, { amount: "900", unit: "per_day" });
  assert.equal(second.ok, true);
  assert.deepEqual((await submitted(sheet)).map((x) => x.contractor_id), [EXACT, NEAR]);

  const sheet2 = world();
  await open(sheet2);
  const old = await invite(sheet2, EXACT);
  await invite(sheet2, EXACT);
  assert.deepEqual(await bid(sheet2, old.token, OK), { ok: false, error: "unavailable" }, "replaced by a newer link");
});

test("a link belongs to ONE job: it cannot bid on another request, and a request with bidding not open refuses", async () => {
  const other = "R-CCCCCCCC";
  const sheet = world({ requests: [requestRow(), requestRow({ request_id: other })] });
  await open(sheet);
  const made = await invite(sheet, EXACT);
  assert.equal((await bid(sheet, made.token, { ...OK, requestId: other, request_id: other })).ok, true);
  const [row] = await submitted(sheet);
  assert.equal(row.request_id, REQ_ID, "the request comes from the invitation");
  // the second request never had bidding opened
  assert.deepEqual(await createBidInvite(sheet, { requestId: other, contractorId: EXACT }, ENV, nid("I")), { ok: false, error: "bidding_not_open" });
});

// ============================ 6-7. one bid per contractor per job ============================
test("one bid per contractor per job: a second submission, and a second link, are refused", async () => {
  const { sheet, token } = await withBid();
  assert.deepEqual(await bid(sheet, token, { amount: "1", unit: "per_day" }), { ok: false, error: "already_bid" });
  assert.deepEqual(await invite(sheet, EXACT), { ok: false, error: "already_bid" });
  assert.equal((await submitted(sheet)).length, 1);
  assert.deepEqual(await describeBidInvite(sheet, token, { recordType: "TEST", now: NOW }), { ok: false, reason: "used" });
  const [kept] = await loadBids(sheet, "TEST");
  assert.equal(kept.amount, "1250.00", "the first bid was not overwritten");
});

test("repeated clicks, retries and concurrent submissions create exactly one bid", async () => {
  const sheet = world();
  await open(sheet);
  const made = await invite(sheet, EXACT);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => bid(sheet, made.token, { amount: String(100 + i), unit: "per_sqft" })));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.deepEqual([...new Set(results.filter((r) => !r.ok).map((r) => r.error))], ["already_bid"]);
  assert.equal((await submitted(sheet)).length, 1);
});

test("if two servers each wrote a bid, the FIRST row in the Sheet is the bid and the other is ignored", async () => {
  const sheet = world();
  const row = (id, amount, at) => B.BID_TABLE.headers.map((h) => ({ bid_id: id, record_type: "TEST", request_id: REQ_ID, contractor_id: EXACT, event: "submitted", rate_amount: amount, currency: "INR", rate_unit: "per_day", recorded_at: at, recorded_by: "x" })[h] ?? "");
  sheet.tabs.Bids.push(row("B-AAAAAAAB", "500.00", NOW.toISOString()), row("B-AAAAAAAC", "100.00", NOW.toISOString()));
  const bids = await loadBids(sheet, "TEST");
  assert.deepEqual(bids.map((b) => [b.id, b.amount]), [["B-AAAAAAAB", "500.00"]]);
});

test("a hand-edited row (wrong currency, bad amount, unknown unit, other record type) is ignored, never guessed", () => {
  const base = { bid_id: "B-AAAAAAAB", record_type: "TEST", request_id: REQ_ID, contractor_id: EXACT, event: "submitted", rate_amount: "10.00", currency: "INR", rate_unit: "per_day", notes: "", notes_language: "en", closes_at: "", invite_id: "", recorded_at: NOW.toISOString(), recorded_by: "x", reason: "" };
  assert.equal(B.foldBids([base], "TEST").length, 1);
  for (const bad of [{ currency: "USD" }, { rate_amount: "-1" }, { rate_amount: "abc" }, { rate_unit: "per_hour" }, { record_type: "REAL" }, { contractor_id: "nope" }, { recorded_at: "yesterday" }, { bid_id: "" }]) {
    assert.equal(B.foldBids([{ ...base, ...bad }], "TEST").length, 0, JSON.stringify(bad));
  }
});

// ============================ 8-10. what is typed ============================
test("zero, negative, invalid, non-finite and unreasonably large prices are refused; nothing is written", async () => {
  const sheet = world();
  await open(sheet);
  const made = await invite(sheet, EXACT);
  const before = sheet.appended.length;
  for (const amount of [0, "0", "0.00", -5, "-5", "abc", "", "  ", NaN, Infinity, -Infinity, "1e5", "12.345", "99999999999", 1e21, null, undefined, {}, [], true, "12,34,5x", "1 2 3 ."]) {
    const r = await bid(sheet, made.token, { amount, unit: "per_sqft" });
    assert.equal(r.error, "validation", JSON.stringify(amount));
    assert.ok(r.errors.amount, JSON.stringify(amount));
  }
  assert.equal(sheet.appended.length, before);
  assert.equal(B.validateBid({ amount: 100_001, unit: "per_sqft" }).errors.amount, "That price is too large for this rate unit. Please check it.");
  assert.equal(B.validateBid({ amount: 100_000, unit: "per_sqft" }).ok, true);
  assert.equal(B.validateBid({ amount: "12.345", unit: "per_day" }).errors.amount, "Use at most 2 digits after the decimal point.");
});

test("prices are stored exactly: two decimals, commas and Devanagari digits understood, no floating-point drift", () => {
  const ok = (amount, unit = "per_day") => B.validateBid({ amount, unit }).value.amount;
  assert.equal(ok("1250"), "1250.00");
  assert.equal(ok("1,250.5"), "1250.50");
  assert.equal(ok("१२५०"), "1250.00"); // १२५०
  assert.equal(ok(0.1), "0.10");
  assert.equal(ok("0.01"), "0.01");
  assert.equal(B.toPaise("1250.50"), 125050);
  assert.equal(B.formatBidPrice("1250.50", "per_sqft"), "₹1,250.50 per square foot");
  assert.equal(B.formatBidPrice("125000.00", "per_day"), "₹1,25,000 per day");
});

test("the rate unit must come from the controlled list", async () => {
  assert.deepEqual(B.RATE_UNITS.map((u) => u.value), ["per_sqft", "per_sqm", "per_day", "per_unit", "fixed_scope"]);
  for (const unit of ["per_hour", "", undefined, null, 5, "PER_SQFT", "per sqft", {}]) {
    const v = B.validateBid({ amount: "10", unit });
    assert.equal(v.ok, false, String(unit));
    assert.ok(v.errors.unit);
  }
  for (const u of B.RATE_UNITS) assert.equal(B.validateBid({ amount: "10", unit: u.value }).ok, true, u.value);
  const sheet = world();
  await open(sheet);
  const made = await invite(sheet, EXACT);
  assert.equal((await bid(sheet, made.token, { amount: "10", unit: "per_hour" })).errors.unit, "Please choose a rate unit from the list.");
});

test("notes: up to 500 characters, no phone numbers, text only; they are optional", () => {
  const v = (notes) => B.validateBid({ amount: "10", unit: "per_day", notes });
  assert.equal(v("x".repeat(500)).ok, true);
  assert.equal(v("x".repeat(501)).errors.notes, "Keep the notes to 500 characters or fewer.");
  assert.equal(v("call me on 9000000001").errors.notes, "Please do not put phone numbers in the notes.");
  assert.equal(v("call ९००००००००१").errors.notes, "Please do not put phone numbers in the notes.");
  assert.equal(v(42).errors.notes, "The notes must be text.");
  for (const none of [undefined, null, ""]) assert.equal(v(none).value.notes, "");
});

// ============================ 11. the bidding state ============================
test("bidding that is not open (never opened, closed, cancelled, past its deadline, or a contractor selected) takes no new bids", async () => {
  const sheet = world();
  assert.deepEqual(await invite(sheet, EXACT), { ok: false, error: "bidding_not_open" }, "not opened yet");

  assert.equal((await open(sheet, { deadline: TODAY })).ok, true);
  const a = await invite(sheet, EXACT);
  const b = await invite(sheet, NEAR);
  assert.deepEqual(await bid(sheet, a.token, OK, at(DAY)), { ok: false, error: "closed" }, "the closing day (India time) has ended");
  assert.equal((await bid(sheet, a.token, OK)).ok, true, "still open on the closing day");

  assert.equal((await closeBidding(sheet, { requestId: REQ_ID }, ENV, nid("E"))).state, "closed");
  assert.deepEqual(await bid(sheet, b.token, OK), { ok: false, error: "closed" });
  assert.deepEqual(await describeBidInvite(sheet, b.token, { recordType: "TEST", now: NOW }), { ok: false, reason: "closed" });

  assert.equal((await cancelBidding(sheet, { requestId: REQ_ID, reason: "The developer paused the job" }, ENV, nid("E"))).state, "cancelled");
  assert.deepEqual(await bid(sheet, b.token, OK), { ok: false, error: "closed" });
  assert.equal((await submitted(sheet)).length, 1);
});

test("only an explicit, reasoned reopening makes bidding open again; every change is recorded", async () => {
  const sheet = world();
  await open(sheet);
  const made = await invite(sheet, EXACT);
  await closeBidding(sheet, { requestId: REQ_ID }, ENV, nid("E"));
  assert.equal((await reopenBidding(sheet, { requestId: REQ_ID, reason: "" }, ENV, nid("E"))).error, "validation");
  assert.equal((await reopenBidding(sheet, { requestId: REQ_ID, reason: "ok" }, ENV, nid("E"))).error, "validation", "too short");
  assert.equal((await open(sheet)).error, "wrong_state", "opening twice is not allowed");
  assert.equal((await reopenBidding(sheet, { requestId: REQ_ID, reason: "Two more contractors asked to bid" }, ENV, nid("E"))).state, "open");
  assert.equal((await bid(sheet, made.token, OK)).ok, true, "the earlier link works again");
  const events = (await rowsOf(sheet, B.BID_TABLE)).filter((r) => r.contractor_id === "").map((r) => r.event);
  assert.deepEqual(events.filter((e) => e !== "submitted"), ["opened", "closed", "reopened"]);
  assert.equal((await closeBidding(sheet, { requestId: "R-ZZZZZZZZ" }, ENV, nid("E"))).error, "not_found");
});

test("a closing date must be a real date, not in the past and within 60 days", () => {
  assert.deepEqual(B.cleanDeadline("", TODAY), { ok: true, value: "" });
  assert.equal(B.cleanDeadline("2026-10-31", TODAY).value, "2026-10-31T18:29:59.000Z", "end of that day in India");
  for (const bad of ["2026-10-20", "2026-13-01", "soon", 5, "2027-01-30"]) assert.equal(B.cleanDeadline(bad, TODAY).ok, false, String(bad));
  assert.equal(B.cleanDeadline("2026-12-20", TODAY).ok, true);
});

// ============================ 12-14. availability and eligibility ============================
test("a near-date contractor can bid provisionally, and the bid does NOT confirm their start date", async () => {
  const sheet = world();
  await open(sheet);
  const made = await invite(sheet, NEAR);
  const info = await describeBidInvite(sheet, made.token, { recordType: "TEST", now: NOW });
  assert.equal(info.info.provisional, true);
  const r = await bid(sheet, made.token, OK);
  assert.deepEqual([r.ok, r.provisional], [true, true]);
  assert.deepEqual(await loadConfirmations(sheet, "TEST"), [], "no confirmation was created by bidding");
  assert.equal(sheet.tabs.Confirmations.length, 1, "the Confirmations tab holds only its header");
  const found = matchContractors((await loadRequests(sheet))[0], await loadContractors(sheet), { envType: "TEST", now: NOW, max: 99 }).candidates.find((c) => c.contractorId === NEAR);
  assert.equal(B.standing(found, undefined, { id: REQ_ID, startDate: REQ_START }).reason, "not_confirmed");
  // and the contractor's own registration was not changed
  assert.equal((await loadContractors(sheet)).find((c) => c.id === NEAR).earliestStart, "2026-10-27");
});

test("an unconfirmed near-date contractor cannot be selected; after a recorded confirmation they can", async () => {
  const { sheet, bidId } = await withBid(world(), NEAR);
  const refused = await select(sheet, bidId);
  assert.deepEqual([refused.ok, refused.error, refused.reason], [false, "not_confirmed", "none"]);
  assert.deepEqual(await loadJobs(sheet, "TEST"), []);
  assert.equal((await confirm(sheet, NEAR, { status: "interested_unconfirmed" })).ok, true);
  assert.equal((await select(sheet, bidId)).error, "not_confirmed", "interest alone is not a confirmed date");
  assert.equal((await confirm(sheet, NEAR, { status: "available_alternative_date", confirmedStartDate: "2026-10-27" }, 2000)).ok, true);
  const chosen = await select(sheet, bidId);
  assert.equal(chosen.ok, true);
  assert.equal(chosen.job.contractorId, NEAR);
});

test("a contractor who said 'unavailable' cannot be invited, cannot bid, and cannot be selected", async () => {
  const sheet = world();
  await open(sheet);
  const made = await invite(sheet, EXACT);
  await confirm(sheet, EXACT, { status: "unavailable" });
  assert.deepEqual(await bid(sheet, made.token, OK), { ok: false, error: "not_eligible" });
  assert.deepEqual(await invite(sheet, EXACT), { ok: false, error: "unavailable" });
  assert.deepEqual(await describeBidInvite(sheet, made.token, { recordType: "TEST", now: NOW }), { ok: false, reason: "unavailable" });
  assert.equal((await submitted(sheet)).length, 0);

  // said "unavailable" AFTER bidding: still cannot be selected
  const { sheet: s2, bidId } = await withBid();
  await confirm(s2, EXACT, { status: "unavailable" });
  assert.equal((await select(s2, bidId)).error, "unavailable");
});

test("a trade or locality mismatch can never become eligible by price: no link, no bid, no selection", async () => {
  const sheet = world();
  await open(sheet);
  for (const id of [OTHER_TRADE, WAKAD]) assert.deepEqual(await invite(sheet, id), { ok: false, error: "not_candidate" }, id);
  assert.deepEqual(await invite(sheet, CID(9)), { ok: false, error: "not_candidate" }, "unknown contractor");
  for (const bad of ["C-bad", "../x", 5, null]) assert.deepEqual(await invite(sheet, bad), { ok: false, error: "invalid" }, String(bad));

  // a contractor who changes trade after being invited can no longer bid
  const made = await invite(sheet, EXACT);
  const idx = sheet.tabs.Contractors.findIndex((r) => r[0] === EXACT);
  const header = sheet.tabs.Contractors[0];
  sheet.tabs.Contractors[idx][header.indexOf("primary_trade")] = "Electrical";
  assert.deepEqual(await bid(sheet, made.token, { amount: "1", unit: "per_day" }), { ok: false, error: "not_eligible" });
  assert.equal((await submitted(sheet)).length, 0);
});

test("a REAL contractor or request is invisible to TEST bidding, and unknown or malformed jobs are rejected", async () => {
  const sheet = world({ contractors: [...contractors(), contractorRow({ contractor_id: CID(6), record_type: "REAL" })], requests: [requestRow(), requestRow({ request_id: "R-DDDDDDDD", record_type: "REAL" })] });
  assert.equal((await openBidding(sheet, { requestId: "R-DDDDDDDD" }, ENV, nid("E"))).error, "not_found", "REAL request seen from TEST");
  assert.equal((await openBidding(sheet, { requestId: "R-ZZZZZZZZ" }, ENV, nid("E"))).error, "not_found");
  for (const id of ["", "nope", 5, null, undefined, "R-AAAAAAA", "../R-BBBBBBBB"]) assert.equal((await openBidding(sheet, { requestId: id }, ENV, nid("E"))).error, "not_found", String(id));
  await open(sheet);
  assert.equal((await createBidInvite(sheet, { requestId: "R-ZZZZZZZZ", contractorId: EXACT }, ENV, nid("I"))).error, "not_found");
  assert.deepEqual(await invite(sheet, CID(6)), { ok: false, error: "not_candidate" }, "REAL contractor in TEST");
  assert.equal((await select(sheet, "B-AAAAAAAB")).error, "no_bid");
  assert.equal((await selectBidder(sheet, { requestId: "R-ZZZZZZZZ", bidId: "B-AAAAAAAB" }, ENV, nid("J"))).error, "not_found");
});

// ============================ 15-17. comparison and units ============================
const view = (o) => ({ amount: "10.00", unit: "per_sqft", id: "x", ...o });

test("bids are grouped by rate unit, cheapest first inside a group, ties in arrival order", () => {
  const groups = B.groupByUnit([
    view({ id: "a", amount: "20.00", unit: "per_sqft" }),
    view({ id: "b", amount: "1500.00", unit: "per_day" }),
    view({ id: "c", amount: "18.50", unit: "per_sqft" }),
    view({ id: "d", amount: "20.00", unit: "per_sqft" }),
    view({ id: "e", amount: "900.00", unit: "per_day" }),
    view({ id: "f", amount: "5.00", unit: "fixed_scope" }),
  ]);
  assert.deepEqual(groups.map((g) => [g.unit, g.bids.map((b) => b.id)]), [
    ["per_sqft", ["c", "a", "d"]],
    ["per_day", ["e", "b"]],
    ["fixed_scope", ["f"]],
  ]);
  assert.equal(groups[2].fixedScope, true);
  assert.deepEqual(B.groupByUnit([]), []);
});

test("incompatible units are never ranked together and no total cost is produced", async () => {
  const sheet = world();
  await open(sheet);
  const a = await invite(sheet, EXACT);
  const b = await invite(sheet, NEAR);
  await bid(sheet, a.token, { amount: "20", unit: "per_sqft" });
  await bid(sheet, b.token, { amount: "1500", unit: "per_day" });
  await confirm(sheet, NEAR, { status: "available_alternative_date", confirmedStartDate: "2026-10-27" });
  const panel = await panelOf(sheet);
  assert.deepEqual(panel.groups.map((g) => [g.unit, g.bids.map((x) => x.contractorId)]), [["per_sqft", [EXACT]], ["per_day", [NEAR]]]);
  // ₹20 sorts "below" ₹1,500, but they are in different groups, so there is no cross-group order or "cheapest overall"
  const json = JSON.stringify(panel);
  assert.ok(!/total|cheapest overall|lowest overall|rank|score/i.test(json.replace(/Cheapest first is not the same as best/g, "")), "no total, rank or score in the data");
  assert.equal(panel.groups.every((g) => g.bids.every((x) => !("totalCost" in x))), true);
});

// ============================ reviews and ratings in the comparison ============================
async function panelOf(sheet, env = ENV) {
  const [request] = await loadRequests(sheet);
  const cs = await loadContractors(sheet);
  const rows = (await rowsOf(sheet, B.BID_TABLE));
  const round = B.foldRound(rows, "TEST", REQ_ID);
  const jobs = await loadJobs(sheet, "TEST");
  const job = jobs.find((j) => j.requestId === REQ_ID);
  const reviews = await loadReviews(sheet, "TEST");
  return buildBidPanel({
    request, round, state: B.biddingState(round, job, env.now.getTime()), job,
    bids: B.foldBids(rows, "TEST").filter((x) => x.requestId === REQ_ID),
    invites: (await loadBidInvites(sheet, "TEST")).filter((i) => i.requestId === REQ_ID),
    candidates: matchContractors(request, cs, { envType: "TEST", now: env.now, max: 99 }).candidates,
    contractorNames: new Map(cs.map((c) => [c.id, c.name])),
    confirmations: await loadConfirmations(sheet, "TEST"),
    summaries: await loadSummaries(sheet, "TEST"),
    reviewComments: new Map((await loadBids(sheet, "TEST")).map((b) => [b.contractorId, recentComments(reviews, jobs, b.contractorId)])),
    nowMs: env.now.getTime(),
  });
}

test("a contractor with no reviews shows 'Not yet rated' with zero reviews and no sub-scores", async () => {
  const { sheet } = await withBid();
  const [shown] = (await panelOf(sheet)).groups[0].bids;
  assert.deepEqual([shown.rating, shown.reviewCount, shown.criteria], ["Not yet rated", 0, []]);
});

test("ratings come from valid reviews only, with counts and a 'too few' note; a cancelled job's review stops counting", async () => {
  const { sheet } = await withBid();
  assert.equal((await select(sheet, (await loadBids(sheet, "TEST"))[0].id)).ok, true);
  assert.equal((await completeJob(sheet, { requestId: REQ_ID, completionDate: "" }, ENV)).ok, true);
  const made = await createInvite(sheet, { requestId: REQ_ID }, { recordType: "TEST", now: NOW }, nid("V"));
  assert.equal((await submitReview(sheet, { token: made.token, input: { overall: 4, workmanship: 5, comment: "" }, language: "en" }, { recordType: "TEST", now: NOW }, nid("W"))).ok, true);
  const panel = await panelOf(sheet);
  const shown = panel.groups[0].bids[0];
  assert.deepEqual([shown.rating, shown.reviewCount, shown.criteria], ["4.0 out of 5 from 1 review (too few to judge)", 1, ["Workmanship 5.0 (1)"]]);
  // a job later corrected to cancelled: that review is no longer counted
  const { correctJob } = await import("../lib/job-store.ts");
  assert.equal((await correctJob(sheet, { requestId: REQ_ID, status: "cancelled", reason: "Completed by mistake" }, ENV)).ok, true);
  assert.equal((await panelOf(sheet)).groups[0].bids[0].rating, "Not yet rated");
});

// ============================ 20-21. choosing the bidder ============================
test("choosing a bidder records the right contractor and the right bid, once, with an audit trail", async () => {
  const sheet = world();
  await open(sheet);
  const a = await invite(sheet, EXACT);
  const b = await invite(sheet, NEAR);
  const ra = await bid(sheet, a.token, { amount: "20", unit: "per_sqft" });
  const rb = await bid(sheet, b.token, { amount: "1500", unit: "per_day" });
  await confirm(sheet, NEAR, { status: "available_alternative_date", confirmedStartDate: "2026-10-27" });

  const chosen = await select(sheet, rb.bidId);
  assert.deepEqual([chosen.ok, chosen.job.contractorId, chosen.job.status, chosen.bidId], [true, NEAR, "selected", rb.bidId]);
  const [job] = await rowsOf(sheet, JOB_TABLE);
  assert.deepEqual([job.event, job.contractor_id, job.request_id, job.recorded_by], ["selected", NEAR, REQ_ID, "founder (admin login)"]);
  const marker = (await rowsOf(sheet, B.BID_TABLE)).find((r) => r.event === "selected");
  assert.deepEqual([marker.bid_id, marker.contractor_id, marker.request_id, marker.recorded_by], [rb.bidId, NEAR, REQ_ID, "founder (admin login)"]);
  assert.equal(marker.recorded_at, NOW.toISOString());

  const panel = await panelOf(sheet);
  assert.equal(panel.state, "selected");
  assert.deepEqual([panel.selectedContractorId, panel.selectedBidId], [NEAR, rb.bidId]);
  const all = panel.groups.flatMap((g) => g.bids);
  assert.deepEqual(all.map((x) => [x.contractorId, x.chosen]), [[EXACT, false], [NEAR, true]]);
  assert.ok(all.every((x) => !x.canSelect), "nothing more can be selected");
  assert.equal(ra.ok, true);
});

test("conflicting selections are refused: a second bidder, a repeat is harmless, and simultaneous clicks give one winner", async () => {
  const sheet = world();
  await open(sheet);
  const a = await invite(sheet, EXACT);
  const b = await invite(sheet, NEAR);
  const ra = await bid(sheet, a.token, OK);
  const rb = await bid(sheet, b.token, OK);
  await confirm(sheet, NEAR, { status: "available_requested_date" });

  const [x, y] = await Promise.all([select(sheet, ra.bidId), select(sheet, rb.bidId)]);
  assert.equal([x, y].filter((r) => r.ok).length, 1);
  assert.equal([x, y].find((r) => !r.ok).error, "already_selected");
  assert.equal((await rowsOf(sheet, JOB_TABLE)).filter((r) => r.event === "selected").length, 1);

  const winner = x.ok ? ra : rb;
  const loser = x.ok ? rb : ra;
  const again = await select(sheet, winner.bidId);
  assert.deepEqual([again.ok, again.completedMarker], [true, false], "repeating the same choice changes nothing");
  assert.equal((await select(sheet, loser.bidId)).error, "already_selected");
  assert.equal((await rowsOf(sheet, B.BID_TABLE)).filter((r) => r.event === "selected").length, 1);
  assert.equal((await rowsOf(sheet, JOB_TABLE)).length, 1);
});

test("if the audit marker cannot be written after the job, the job is still correct and repeating the choice completes it", async () => {
  const { sheet, bidId } = await withBid();
  const realAppend = sheet.append.bind(sheet);
  let failures = 1;
  sheet.append = async (range, row) => {
    if (range.startsWith("Bids!") && row[4] === "selected" && failures-- > 0) throw new Error("network blip");
    return realAppend(range, row);
  };
  await assert.rejects(() => select(sheet, bidId), /network blip/);
  assert.equal((await loadJobs(sheet, "TEST"))[0].contractorId, EXACT, "the job (the source of truth) was recorded");
  assert.equal((await rowsOf(sheet, B.BID_TABLE)).filter((r) => r.event === "selected").length, 0);
  const retry = await select(sheet, bidId);
  assert.deepEqual([retry.ok, retry.completedMarker], [true, true]);
  assert.equal((await rowsOf(sheet, JOB_TABLE)).length, 1, "no second job");
  assert.equal((await rowsOf(sheet, B.BID_TABLE)).filter((r) => r.event === "selected").length, 1);
});

test("only a live bid for THIS request can be selected, and only while bidding is open or closed", async () => {
  const { sheet, bidId } = await withBid();
  for (const bad of [undefined, null, "", "B-bad", 5, "B-ZZZZZZZZ"]) assert.equal((await select(sheet, bad)).error, "no_bid", String(bad));
  assert.equal((await voidBid(sheet, { requestId: REQ_ID, bidId, reason: "Entered by mistake" }, ENV)).ok, true);
  assert.equal((await select(sheet, bidId)).error, "no_bid", "a withdrawn bid");

  const { sheet: s2, bidId: id2 } = await withBid();
  await cancelBidding(s2, { requestId: REQ_ID, reason: "The developer paused the job" }, ENV, nid("E"));
  assert.equal((await select(s2, id2)).error, "bidding_not_open");
  await reopenBidding(s2, { requestId: REQ_ID, reason: "The developer is ready again" }, ENV, nid("E"));
  await closeBidding(s2, { requestId: REQ_ID }, ENV, nid("E"));
  assert.equal((await select(s2, id2)).ok, true, "a closed round can still select");
});

// ============================ administrative correction ============================
test("an administrator can correct a bid with a reason without creating a second bid; history is kept; it stops after selection", async () => {
  const { sheet, bidId } = await withBid();
  assert.equal((await correctBid(sheet, { requestId: REQ_ID, bidId, input: { amount: "1100", unit: "per_sqft", notes: "Revised" }, reason: "" }, ENV)).error, "validation");
  assert.equal((await correctBid(sheet, { requestId: REQ_ID, bidId, input: OK, reason: "Nothing differs here" }, ENV)).error, "nothing_changed");
  const fixed = await correctBid(sheet, { requestId: REQ_ID, bidId, input: { amount: "1100", unit: "per_sqft", notes: "Revised" }, reason: "Contractor phoned in a typo" }, ENV);
  assert.deepEqual([fixed.ok, fixed.bid.amount, fixed.bid.notes, fixed.bid.corrected, fixed.bid.id], [true, "1100.00", "Revised", true, bidId]);
  assert.deepEqual(fixed.bid.history.map((h) => [h.event, h.amount]), [["submitted", "1250.00"], ["corrected", "1100.00"]]);
  assert.equal((await loadBids(sheet, "TEST")).length, 1, "still exactly one bid");
  assert.equal((await submitted(sheet)).length, 1);

  assert.equal((await voidBid(sheet, { requestId: REQ_ID, bidId, reason: "Withdrawn at their request" }, ENV)).ok, true);
  assert.equal((await voidBid(sheet, { requestId: REQ_ID, bidId, reason: "Withdrawn again" }, ENV)).error, "voided");
  assert.equal((await correctBid(sheet, { requestId: REQ_ID, bidId, input: OK, reason: "Trying after withdrawal" }, ENV)).error, "voided");
  assert.deepEqual(await invite(sheet, EXACT), { ok: false, error: "already_bid" }, "a withdrawn bid is not a way to bid twice");

  const { sheet: s2, bidId: id2 } = await withBid();
  await select(s2, id2);
  assert.equal((await correctBid(s2, { requestId: REQ_ID, bidId: id2, input: { amount: "1", unit: "per_day" }, reason: "After the selection" }, ENV)).error, "job_selected");
  assert.equal((await voidBid(s2, { requestId: REQ_ID, bidId: id2, reason: "After the selection" }, ENV)).error, "job_selected");
});

// ============================ privacy ============================
test("the comparison data and the contractor's page carry no phone numbers, tokens or digests", async () => {
  const sheet = world();
  await open(sheet);
  const a = await invite(sheet, EXACT);
  const b = await invite(sheet, NEAR);
  await bid(sheet, a.token, OK);
  const panel = await panelOf(sheet);
  const info = await describeBidInvite(sheet, b.token, { recordType: "TEST", now: NOW });
  for (const data of [panel, info]) {
    const json = JSON.stringify(data);
    assert.ok(!/\+91|9000000\d{3}|phone|developer_name|TEST Developer/i.test(json), "no phone number or developer details");
    assert.ok(!/[A-Za-z0-9_-]{43}/.test(json) && !/[0-9a-f]{64}/.test(json), "no token or digest");
  }
  assert.deepEqual(Object.keys(info.info).sort(), ["area", "durationDays", "preferredLanguage", "provisional", "startDate", "trade"]);
  // the Sheet never holds a usable token
  const stored = JSON.stringify(sheet.tabs);
  assert.ok(!stored.includes(a.token) && !stored.includes(b.token));
  // one contractor's page cannot reveal the other's price
  assert.ok(!JSON.stringify(info).includes("1250"));
});

test("nothing returned to a bidder contains another bidder's token", async () => {
  const sheet = world();
  await open(sheet);
  const a = await invite(sheet, EXACT);
  const b = await invite(sheet, NEAR);
  const results = [await bid(sheet, a.token, OK), await bid(sheet, a.token, OK), await bid(sheet, b.token, { amount: "x", unit: "per_day" }), await describeBidInvite(sheet, b.token, { recordType: "TEST", now: NOW })];
  const json = JSON.stringify(results);
  assert.ok(!json.includes(a.token) && !json.includes(b.token));
});

// ============================ the Bids tab missing ============================
test("with the Bids and BidInvites tabs missing, every bidding action reports a setup problem and writes nothing", async () => {
  const sheet = makeWorld({ tables: [CONFIRMATION_TABLE, JOB_TABLE], contractors: contractors() });
  const token = "q".repeat(43);
  await assert.rejects(() => open(sheet), SheetSetupError);
  await assert.rejects(() => invite(sheet, EXACT), SheetSetupError);
  await assert.rejects(() => bid(sheet, token, OK), SheetSetupError);
  await assert.rejects(() => describeBidInvite(sheet, token, { recordType: "TEST", now: NOW }), SheetSetupError);
  await assert.rejects(() => select(sheet, "B-AAAAAAAB"), SheetSetupError);
  await assert.rejects(() => correctBid(sheet, { requestId: REQ_ID, bidId: "B-AAAAAAAB", input: OK, reason: "A reason" }, ENV), SheetSetupError);
  assert.equal(sheet.appended.length, 0);
  assert.equal(sheet.updated.length, 0);
});

test("a Bids tab with the wrong headers is never written to", async () => {
  const sheet = world();
  sheet.tabs.Bids[0][0] = "something_else";
  await assert.rejects(() => open(sheet), SheetSetupError);
  assert.equal(sheet.appended.length, 0);
});

// ============================ existing job completion and reviews still work ============================
test("after a bidder is chosen, completing the job, inviting a review and rating work exactly as before", async () => {
  const { sheet, bidId } = await withBid();
  assert.equal((await select(sheet, bidId)).ok, true);
  assert.equal((await completeJob(sheet, { requestId: REQ_ID, completionDate: "2026-10-21" }, ENV)).ok, true);
  const made = await createInvite(sheet, { requestId: REQ_ID }, { recordType: "TEST", now: NOW }, nid("V"));
  assert.equal(made.ok, true);
  assert.equal((await submitReview(sheet, { token: made.token, input: { overall: 5 }, language: "en" }, { recordType: "TEST", now: NOW }, nid("W"))).ok, true);
  const summary = (await loadSummaries(sheet, "TEST")).get(EXACT);
  assert.deepEqual([summary.count, summary.average], [1, 5]);
  // and bidding is over for good
  assert.equal((await openBidding(sheet, { requestId: REQ_ID }, ENV, nid("E"))).error, "already_selected");
});

test("the Phase 4 rules are unchanged: a job can still be recorded without bidding, and then bidding cannot start", async () => {
  const { selectContractor } = await import("../lib/job-store.ts");
  const sheet = world();
  assert.equal((await selectContractor(sheet, { requestId: REQ_ID, contractorId: EXACT }, ENV, nid("J"))).ok, true);
  assert.equal((await open(sheet)).error, "already_selected");
  assert.equal((await selectContractor(sheet, { requestId: REQ_ID, contractorId: NEAR }, ENV, nid("J"))).error, "already_selected");
  const p = await panelOf(sheet);
  assert.deepEqual([p.state, p.selectedContractorId, p.selectedBidId], ["selected", EXACT, ""]);
});

// ============================ invitation states ============================
test("invitation states are worked out in a fixed order: used, closed, replaced, expired, active", () => {
  const inv = (id, expiresAt = "2026-11-04T00:00:00Z") => ({ id, recordType: "TEST", requestId: REQ_ID, contractorId: EXACT, tokenHash: "a".repeat(64), createdAt: "2026-10-21T00:00:00Z", expiresAt });
  const first = inv("I-1"), second = inv("I-2");
  const now = Date.parse("2026-10-22T00:00:00Z");
  const ctx = (o) => ({ nowMs: now, state: "open", invitesForPair: [first, second], bidExists: false, ...o });
  assert.equal(evaluateBidInvite(second, ctx()), "active");
  assert.equal(evaluateBidInvite(first, ctx()), "superseded");
  assert.equal(evaluateBidInvite(second, ctx({ nowMs: Date.parse("2026-11-05T00:00:00Z") })), "expired");
  for (const state of ["not_opened", "closed", "selected", "cancelled"]) assert.equal(evaluateBidInvite(second, ctx({ state })), "closed", state);
  assert.equal(evaluateBidInvite(second, ctx({ bidExists: true, state: "closed" })), "used");
});

test("hand-edited invitation rows (not a SHA-256 digest, bad dates, wrong IDs) are ignored", async () => {
  const sheet = world();
  const good = { invite_id: "I-AAAAAAAB", record_type: "TEST", request_id: REQ_ID, contractor_id: EXACT, token_hash: "a".repeat(64), created_at: NOW.toISOString(), expires_at: new Date(NOW.getTime() + DAY).toISOString(), created_by: "x" };
  const push = (o) => sheet.tabs.BidInvites.push(BID_INVITE_TABLE.headers.map((h) => ({ ...good, ...o })[h] ?? ""));
  push({}); push({ token_hash: "plain-token" }); push({ expires_at: "never" }); push({ request_id: "x" }); push({ contractor_id: "y" }); push({ record_type: "REAL" });
  assert.equal((await loadBidInvites(sheet, "TEST")).length, 1);
});

test("the latest confirmation decides: a bid is eligible again if 'unavailable' is later replaced by a confirmed date", async () => {
  const { sheet } = await withBid();
  await confirm(sheet, EXACT, { status: "unavailable" }, 1000);
  assert.equal((await panelOf(sheet)).groups[0].bids[0].standing, "unavailable");
  await confirm(sheet, EXACT, { status: "available_requested_date" }, 2000);
  const shown = (await panelOf(sheet)).groups[0].bids[0];
  assert.deepEqual([shown.standing, shown.canSelect], ["eligible", true]);
  assert.equal(latestByPair(await loadConfirmations(sheet, "TEST")).size, 1);
});
