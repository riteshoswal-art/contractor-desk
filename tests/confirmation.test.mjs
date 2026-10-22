// Availability confirmation: stored for ONE request and ONE contractor, append
// only, and never assumed from messages, links or bids.
import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../lib/confirmation.ts";
import { loadConfirmations, recordConfirmation } from "../lib/confirmation-store.ts";
import { SheetSetupError } from "../lib/contractor-store.ts";
import { CID, NOW, REQ_ID, REQ_START, TODAY, contractorRow, makeWorld, requestRow } from "./helpers/world.mjs";

const REQ = { id: REQ_ID, startDate: REQ_START };
const ENV = { recordType: "TEST", source: "admin", recordedBy: "founder (admin login)", today: TODAY, now: NOW };
let n = 0;
const newId = () => `K-${String(++n).padStart(8, "2")}`;
const world = (opts = {}) => makeWorld({ tables: [C.CONFIRMATION_TABLE], ...opts });
const near = () => contractorRow({ contractor_id: CID(3), earliest_start_date: "2026-10-27" }); // 1 day after: near-date
const record = (sheet, o, env = {}) =>
  recordConfirmation(sheet, { requestId: REQ_ID, contractorId: CID(3), status: "", confirmedStartDate: "", note: "", ...o }, { ...ENV, ...env }, newId);

// ----- the five statuses -----
test("all five statuses exist, with plain-language labels", () => {
  assert.deepEqual(C.CONFIRMATION_STATUSES.map((s) => s.value), [
    "awaiting_response", "interested_unconfirmed", "available_requested_date", "available_alternative_date", "unavailable",
  ]);
  assert.ok(C.CONFIRMATION_STATUSES.every((s) => s.label.length > 5));
});

test("status: awaiting response is recorded, and is NOT a confirmation", async () => {
  const sheet = world({ contractors: [near()] });
  assert.equal((await record(sheet, { status: "awaiting_response" })).ok, true);
  const [c] = await loadConfirmations(sheet, "TEST");
  assert.equal(c.status, "awaiting_response");
  assert.deepEqual(C.confirmedStart(c, REQ), { confirmed: false, reason: "awaiting" });
});

test("status: interested but unconfirmed is recorded, and is NOT a confirmation", async () => {
  const sheet = world({ contractors: [near()] });
  await record(sheet, { status: "interested_unconfirmed" });
  const [c] = await loadConfirmations(sheet, "TEST");
  assert.deepEqual(C.confirmedStart(c, REQ), { confirmed: false, reason: "interested_only" });
});

test("status: available for the requested date: date is set by the server from the request", async () => {
  const sheet = world({ contractors: [near()] });
  assert.equal((await record(sheet, { status: "available_requested_date" })).ok, true);
  const [c] = await loadConfirmations(sheet, "TEST");
  assert.equal(c.confirmedStartDate, REQ_START);
  assert.deepEqual(C.confirmedStart(c, REQ), { confirmed: true, startDate: REQ_START, exactDate: true });
  // a typed date is refused rather than trusted
  const typed = await record(sheet, { status: "available_requested_date", confirmedStartDate: "2026-10-28" });
  assert.equal(typed.ok, false); assert.ok(typed.errors.confirmedStartDate);
});

test("status: available for an alternative date records that date; it must be real, not past, and different", async () => {
  const sheet = world({ contractors: [near()] });
  const ok = await record(sheet, { status: "available_alternative_date", confirmedStartDate: "2026-10-27" });
  assert.deepEqual([ok.ok, ok.confirmedStartDate], [true, "2026-10-27"]);
  const [c] = await loadConfirmations(sheet, "TEST");
  assert.deepEqual(C.confirmedStart(c, REQ), { confirmed: true, startDate: "2026-10-27", exactDate: false });
  for (const [date, why] of [["", "missing"], ["2026-02-31", "not a real date"], ["tomorrow", "text"], ["2026-10-20", "past"], [REQ_START, "same as requested"], ["2030-01-01", "too far"]]) {
    const r = await record(sheet, { status: "available_alternative_date", confirmedStartDate: date });
    assert.equal(r.ok, false, why); assert.ok(r.errors.confirmedStartDate, why);
  }
});

test("status: unavailable is recorded and blocks reliance", async () => {
  const sheet = world({ contractors: [near()] });
  await record(sheet, { status: "unavailable" });
  const [c] = await loadConfirmations(sheet, "TEST");
  assert.deepEqual(C.confirmedStart(c, REQ), { confirmed: false, reason: "unavailable" });
});

// ----- the rule: an unconfirmed near-date contractor is never a confirmed choice -----
test("a near-date contractor with no confirmation, or only awaiting/interested, is not confirmed", () => {
  assert.deepEqual(C.confirmedStart(undefined, REQ), { confirmed: false, reason: "none" });
  for (const status of ["awaiting_response", "interested_unconfirmed", "unavailable"]) {
    const c = { requestId: REQ_ID, status, confirmedStartDate: "" };
    assert.equal(C.confirmedStart(c, REQ).confirmed, false, status);
  }
});

test("an alternative date more than two days from the request is recorded but does not count as confirmed", () => {
  const c = { requestId: REQ_ID, status: "available_alternative_date", confirmedStartDate: "2026-10-29" }; // +3
  assert.deepEqual(C.confirmedStart(c, REQ), { confirmed: false, reason: "outside_window" });
  assert.equal(C.confirmedStart({ ...c, confirmedStartDate: "2026-10-28" }, REQ).confirmed, true); // +2
  assert.equal(C.confirmedStart({ ...c, confirmedStartDate: "2026-10-24" }, REQ).confirmed, true); // -2
  assert.equal(C.confirmedStart({ ...c, confirmedStartDate: "2026-10-23" }, REQ).confirmed, false); // -3
});

test("a confirmation belongs to one request: it is never reused for another", () => {
  const c = { requestId: REQ_ID, status: "available_requested_date", confirmedStartDate: REQ_START };
  assert.equal(C.confirmedStart(c, REQ).confirmed, true);
  assert.deepEqual(C.confirmedStart(c, { id: "R-CCCCCCCC", startDate: REQ_START }), { confirmed: false, reason: "none" });
  // and a requested-date confirmation does not survive the request's date being different
  assert.equal(C.confirmedStart(c, { id: REQ_ID, startDate: "2026-10-30" }).confirmed, false);
});

test("a confirmation for request A is invisible to request B in the same Sheet", async () => {
  const B = "R-CCCCCCCC";
  const sheet = world({ contractors: [near()], requests: [requestRow(), requestRow({ request_id: B })] });
  await record(sheet, { status: "available_requested_date" });
  const all = await loadConfirmations(sheet, "TEST");
  const latest = C.latestByPair(all);
  assert.equal(C.confirmedStart(latest.get(C.pairKey(REQ_ID, CID(3))), REQ).confirmed, true);
  assert.equal(C.confirmedStart(latest.get(C.pairKey(B, CID(3))), { id: B, startDate: REQ_START }).confirmed, false);
});

// ----- guards on who can be confirmed -----
test("only a current potential match can be confirmed: trade/locality/unknown ids are refused and nothing is written", async () => {
  const sheet = world({
    contractors: [near(), contractorRow({ contractor_id: CID(4), primary_trade: "Electrical" }), contractorRow({ contractor_id: CID(5), service_areas: "Wakad" })],
  });
  for (const contractorId of [CID(4), CID(5), CID(9), "C-bad", "../x"]) {
    const r = await record(sheet, { contractorId, status: "available_requested_date" });
    assert.deepEqual(r, { ok: false, error: contractorId.length === 10 && contractorId !== "../x" ? "not_found" : "not_found" }, contractorId);
  }
  assert.equal((await record(sheet, { requestId: "R-ZZZZZZZZ", status: "unavailable" })).ok, false);
  assert.equal(sheet.appended.length, 0);
});

test("a contractor too far from the date is not a candidate, so a confirmation cannot rescue them", async () => {
  const sheet = world({ contractors: [contractorRow({ contractor_id: CID(3), earliest_start_date: "2026-10-30" })] }); // +4
  assert.equal((await record(sheet, { status: "available_requested_date" })).ok, false);
  assert.equal(sheet.appended.length, 0);
});

test("REAL records are invisible from TEST and the other way round", async () => {
  const sheet = world({ contractors: [contractorRow({ contractor_id: CID(3), record_type: "REAL", earliest_start_date: "2026-10-27" })] });
  assert.equal((await record(sheet, { status: "unavailable" })).ok, false);
});

test("validation: unknown status, long note and phone numbers in the note are refused", async () => {
  const sheet = world({ contractors: [near()] });
  for (const [o, field] of [[{ status: "confirmed!" }, "status"], [{ status: "" }, "status"], [{ status: "unavailable", note: "x".repeat(201) }, "note"], [{ status: "unavailable", note: "call 98765 43210" }, "note"], [{ status: "unavailable", confirmedStartDate: "2026-10-27" }, "confirmedStartDate"]]) {
    const r = await record(sheet, o);
    assert.equal(r.ok, false, JSON.stringify(o)); assert.ok(r.errors[field], JSON.stringify(o));
  }
  assert.equal((await record(sheet, { status: "unavailable", note: "x".repeat(200) })).ok, true);
  assert.equal((await record(sheet, { status: 5 })).ok === false, true);
});

test("a request with no start date cannot be 'available for the requested date'", async () => {
  const sheet = world({ contractors: [contractorRow({ contractor_id: CID(3), availability_status: "now", earliest_start_date: "" })], requests: [requestRow({ start_date: "" })] });
  const r = await record(sheet, { status: "available_requested_date" });
  assert.equal(r.ok, false); assert.ok(r.errors.status);
});

// ----- audit trail -----
test("every change is a new row: history is kept and the latest row is the current status", async () => {
  const sheet = world({ contractors: [near()] });
  await record(sheet, { status: "awaiting_response" }, { now: new Date("2026-10-21T10:00:00Z") });
  await record(sheet, { status: "interested_unconfirmed", note: "replied on WhatsApp" }, { now: new Date("2026-10-21T11:00:00Z") });
  await record(sheet, { status: "available_alternative_date", confirmedStartDate: "2026-10-27" }, { now: new Date("2026-10-21T12:00:00Z") });
  await record(sheet, { status: "unavailable" }, { now: new Date("2026-10-21T13:00:00Z") });
  const all = await loadConfirmations(sheet, "TEST");
  assert.equal(all.length, 4);
  assert.deepEqual(C.historyOf(all, REQ_ID, CID(3)).map((c) => c.status), ["awaiting_response", "interested_unconfirmed", "available_alternative_date", "unavailable"]);
  const current = C.latestByPair(all).get(C.pairKey(REQ_ID, CID(3)));
  assert.equal(current.status, "unavailable");
  assert.equal(C.confirmedStart(current, REQ).confirmed, false, "a later 'unavailable' overrides an earlier confirmation");
  assert.deepEqual(sheet.updated, [], "history rows are never edited");
  assert.ok(all.every((c) => c.recordedBy === "founder (admin login)" && c.source === "admin" && !Number.isNaN(Date.parse(c.recordedAt))));
});

test("the source and the person recorded are stored, so a reader can tell how strong the statement is", async () => {
  const sheet = world({ contractors: [near()] });
  await record(sheet, { status: "available_alternative_date", confirmedStartDate: "2026-10-27" }, { source: "contractor_link", recordedBy: "contractor (private link)" });
  const [c] = await loadConfirmations(sheet, "TEST");
  assert.deepEqual([c.source, c.recordedBy], ["contractor_link", "contractor (private link)"]);
  assert.ok(C.SOURCE_LABELS.contractor_link.includes("contractor"));
});

test("hand-edited or unknown rows are ignored, never guessed", () => {
  assert.equal(C.parseConfirmationRow({ record_type: "TEST", request_id: REQ_ID, contractor_id: CID(3), status: "definitely" }), null);
  assert.equal(C.parseConfirmationRow({ record_type: "OTHER", request_id: REQ_ID, contractor_id: CID(3), status: "unavailable" }), null);
  assert.equal(C.parseConfirmationRow({ record_type: "TEST", request_id: "", contractor_id: CID(3), status: "unavailable" }), null);
  const odd = C.parseConfirmationRow({ record_type: "TEST", request_id: REQ_ID, contractor_id: CID(3), status: "available_alternative_date", confirmed_start_date: "2026-02-31" });
  assert.equal(odd.confirmedStartDate, "");
  assert.equal(C.confirmedStart(odd, REQ).confirmed, false, "an unreal stored date confirms nothing");
});

test("a missing Confirmations tab is a setup problem and writes nothing", async () => {
  const sheet = makeWorld({ contractors: [near()] }); // no extra tab
  await assert.rejects(() => record(sheet, { status: "unavailable" }), SheetSetupError);
  assert.equal(sheet.appended.length, 0);
});

// ----- what the results page shows -----
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MatchResults from "../app/admin/requests/MatchResults.tsx";
import { matchContractors } from "../lib/match.ts";
import { loadContractors, loadRequests } from "../lib/records.ts";

async function pageFor(sheet, statusSteps = []) {
  for (const step of statusSteps) await record(sheet, step);
  const request = (await loadRequests(sheet))[0];
  const result = matchContractors(request, await loadContractors(sheet), { envType: "TEST", now: NOW });
  const all = await loadConfirmations(sheet, "TEST");
  const latest = C.latestByPair(all);
  const extras = {};
  for (const c of result.candidates) {
    const cur = latest.get(C.pairKey(request.id, c.contractorId));
    extras[c.contractorId] = { confirmation: { current: cur ?? null, state: C.confirmedStart(cur, request), history: C.historyOf(all, request.id, c.contractorId) } };
  }
  return renderToStaticMarkup(createElement(MatchResults, { result, request, extras }));
}

test("page: an unconfirmed near-date contractor stays 'Start date needs confirmation' (with no confirmation, or only awaiting/interested)", async () => {
  for (const steps of [[], [{ status: "awaiting_response" }], [{ status: "interested_unconfirmed" }]]) {
    const html = await pageFor(world({ contractors: [near()] }), steps);
    assert.ok(html.includes("Start date needs confirmation"), JSON.stringify(steps));
    assert.ok(!html.includes("Start date confirmed"), JSON.stringify(steps));
    assert.ok(!html.includes("confirmed for this request"), JSON.stringify(steps));
    assert.ok(html.includes("Confirmation for this request:"), JSON.stringify(steps));
  }
});

test("page: after a recorded confirmation for THIS request the date shows as confirmed, with who and when", async () => {
  const html = await pageFor(world({ contractors: [near()] }), [{ status: "available_alternative_date", confirmedStartDate: "2026-10-27", note: "called at 5pm" }]);
  assert.ok(html.includes("Start date confirmed: 27 Oct 2026"));
  assert.ok(html.includes("confirmed for this request"));
  assert.ok(html.includes("Recorded by the founder"));
  assert.ok(html.includes("called at 5pm"));
  assert.ok(!html.includes("not confirmed for the requested date"));
});

test("page: a later 'unavailable' takes the confirmed badge away and the history is listed", async () => {
  const html = await pageFor(world({ contractors: [near()] }), [{ status: "available_requested_date" }, { status: "unavailable" }]);
  assert.ok(!html.includes("Start date confirmed"));
  assert.ok(html.includes("Said they are unavailable."));
  assert.ok(html.includes("History (2 entries)"));
});

test("page: nothing says 'verified' or 'guaranteed', and no phone number appears", async () => {
  const html = await pageFor(world({ contractors: [near()] }), [{ status: "available_requested_date" }]);
  assert.ok(!/verified|guarantee(?!d available)/i.test(html.replace(/no availability is guaranteed/gi, "")));
  assert.ok(!/\+91|\d{10}/.test(html));
});
