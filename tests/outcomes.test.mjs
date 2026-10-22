import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as O from "../lib/outcome.ts";
import * as S from "../lib/stats.ts";
import { recordOutcome, loadOutcomes, loadFormValues } from "../lib/outcome-store.ts";
import { SheetSetupError } from "../lib/contractor-store.ts";
import { CONTRACTOR_HEADERS } from "../lib/registration.ts";
import { REQUEST_HEADERS } from "../lib/request.ts";
import StatsView from "../app/admin/dashboard/StatsView.tsx";

// ---------- helpers ----------
const NOW = new Date("2026-10-21T10:00:00.000Z");           // 15:30 IST
const REQ_CREATED = "2026-10-20T04:30:00.000Z";             // 10:00 IST on the 20th
const base = { requestId:"R-BBBBBBBB", contractorId:"C-AAAAAAAA", messageSent:"yes", contactAttemptedAt:"2026-10-21T10:00", reply:"", repliedAt:"", matchUsable:"", rating:null, failureReason:"", jobStarted:"" };
const check = (o) => O.validateOutcome({ ...base, ...o }, { requestCreatedAt:REQ_CREATED, now:NOW.getTime() });
const errOf = (o) => { const r = check(o); assert.equal(r.ok, false, JSON.stringify(o)); return r.errors; };

// ==================== validation: nothing inferred ====================
test("a sent message needs an explicit yes/no; blank is not accepted", () => {
  assert.ok(errOf({ messageSent:"" }).messageSent);
  assert.equal(check({}).ok, true);
  assert.equal(check({ messageSent:"no", contactAttemptedAt:"" }).ok, true);
});
test("there is no 'link opened' field: the input shape cannot imply a send", () => {
  assert.ok(!Object.keys(base).some(k => /link|open|click/i.test(k)));
  const parsed = O.parseOutcomeInput({ ...base, linkOpened:true, opened:true });
  assert.ok(parsed && !("linkOpened" in parsed) && !("opened" in parsed)); // unknown fields are dropped
  assert.equal(parsed.messageSent, "yes"); // only what the founder said
  assert.equal(O.parseOutcomeInput({ ...base, messageSent:undefined }).messageSent, ""); // missing -> blank -> invalid later
  assert.ok(errOf({ messageSent:"" }).messageSent);
});
test("contact time: required if sent, India time, not future, not before the request", () => {
  assert.ok(errOf({ contactAttemptedAt:"" }).contactAttemptedAt);
  assert.ok(errOf({ contactAttemptedAt:"garbage" }).contactAttemptedAt);
  assert.ok(errOf({ contactAttemptedAt:"2026-02-30T10:00" }).contactAttemptedAt);
  assert.ok(errOf({ contactAttemptedAt:"2026-10-21T25:00" }).contactAttemptedAt);
  assert.ok(errOf({ contactAttemptedAt:"2026-10-21T16:00" }).contactAttemptedAt);   // 16:00 IST is after "now" (15:30 IST)
  assert.ok(errOf({ contactAttemptedAt:"2026-10-19T10:00" }).contactAttemptedAt);   // before the request existed
  const ok = check({ contactAttemptedAt:"2026-10-21T14:30" });
  assert.equal(ok.ok, true); assert.equal(ok.value.contactAttemptedAt, "2026-10-21T09:00:00.000Z"); // 14:30 IST = 09:00 UTC
});

// REGRESSION: the form has minute precision, but a request is created at an exact
// second. A contact entered for the same minute used to be refused as "before the
// request was received" (15:37 meant 15:37:00, earlier than 15:37:40).
describe("contact time right after the request is created (same-minute regression)", () => {
  const CREATED = "2026-10-21T10:07:40.123Z"; // 15:37:40 India time
  const LATER = new Date("2026-10-21T10:08:30.000Z").getTime(); // 15:38:30 India time
  const attempt = (contactAttemptedAt, now = LATER, requestCreatedAt = CREATED) =>
    O.validateOutcome({ ...base, contactAttemptedAt }, { requestCreatedAt, now });

  test("the same minute as the request is accepted", () => {
    const r = attempt("2026-10-21T15:37");
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.equal(r.value.contactAttemptedAt, "2026-10-21T10:07:00.000Z");
  });
  test("the next minute is accepted", () => assert.equal(attempt("2026-10-21T15:38").ok, true));
  test("a request created at second :00, :59 and with milliseconds behaves the same", () => {
    for (const created of ["2026-10-21T10:07:00.000Z", "2026-10-21T10:07:59.999Z", "2026-10-21T10:07:01.500Z"]) {
      assert.equal(attempt("2026-10-21T15:37", LATER, created).ok, true, created);
      assert.equal(attempt("2026-10-21T15:36", LATER, created).ok, false, created);
    }
  });
  test("an earlier minute is STILL refused (the chronological check is kept)", () => {
    const r = attempt("2026-10-21T15:36");
    assert.equal(r.ok, false);
    assert.equal(r.errors.contactAttemptedAt, "That is before the request was received.");
    assert.equal(attempt("2026-10-21T14:00").ok, false);
    assert.equal(attempt("2026-10-20T15:37").ok, false);
  });
  test("a time in the future is STILL refused", () => {
    assert.equal(attempt("2026-10-21T15:44").ok, false); // more than the 5-minute clock allowance after "now"
    assert.equal(attempt("2026-10-22T15:37").ok, false);
  });
  test("a reply still cannot come before the message, even within the same minute rules", () => {
    const sentAndReplied = (repliedAt) => O.validateOutcome(
      { ...base, contactAttemptedAt: "2026-10-21T15:37", reply: "yes", repliedAt },
      { requestCreatedAt: CREATED, now: LATER },
    );
    assert.equal(sentAndReplied("2026-10-21T15:37").ok, true);
    assert.equal(sentAndReplied("2026-10-21T15:37").value.responseMinutes, 0);
    assert.equal(sentAndReplied("2026-10-21T15:36").ok, false);
  });
  test("a request with an unreadable creation time does not block recording", () => {
    assert.equal(attempt("2026-10-21T15:37", LATER, "not a date").ok, true);
  });
  test("saving works end to end through the store for a same-minute contact", async () => {
    const sheet = fakeSheet({ createdAt: CREATED });
    const result = await recordOutcome(sheet, body({ contactAttemptedAt: "2026-10-21T15:37" }), { recordType: "TEST", now: new Date(LATER) }, ID);
    assert.deepEqual(result, { ok: true, updated: false, responseMinutes: null });
    assert.equal(sheet.appended.length, 1);
    assert.equal(sheet.appended[0][1][O.OUTCOME_HEADERS.indexOf("contact_attempted_at")], "2026-10-21T10:07:00.000Z");
    // and the minute before is still refused by the store
    const early = await recordOutcome(fakeSheet({ createdAt: CREATED }), body({ contactAttemptedAt: "2026-10-21T15:36" }), { recordType: "TEST", now: new Date(LATER) }, ID);
    assert.equal(early.error, "validation");
    assert.equal(early.errors.contactAttemptedAt, "That is before the request was received.");
  });
});
test("not sent: no contact time and no reply allowed", () => {
  assert.ok(errOf({ messageSent:"no", contactAttemptedAt:"2026-10-21T14:30" }).contactAttemptedAt);
  assert.ok(errOf({ messageSent:"no", contactAttemptedAt:"", reply:"yes" }).reply);
  assert.ok(errOf({ messageSent:"no", contactAttemptedAt:"", reply:"no_response" }).reply);
});
test("reply time only with a yes/no reply, not before the send, not future", () => {
  assert.ok(errOf({ reply:"no_response", repliedAt:"2026-10-21T15:00" }).repliedAt);
  assert.ok(errOf({ reply:"", repliedAt:"2026-10-21T15:00" }).repliedAt);
  assert.ok(errOf({ reply:"yes", contactAttemptedAt:"2026-10-21T14:00", repliedAt:"2026-10-21T13:00" }).repliedAt);
  assert.ok(errOf({ reply:"yes", repliedAt:"2026-10-21T17:00" }).repliedAt);
  assert.ok(errOf({ reply:"yes", repliedAt:"nope" }).repliedAt);
});
test("response time is computed from the two recorded times and never invented", () => {
  const r = check({ contactAttemptedAt:"2026-10-21T10:00", reply:"yes", repliedAt:"2026-10-21T12:15" });
  assert.equal(r.value.responseMinutes, 135);
  assert.equal(check({ contactAttemptedAt:"2026-10-21T10:00", reply:"no", repliedAt:"2026-10-21T10:00" }).value.responseMinutes, 0);
  assert.equal(check({ reply:"yes", repliedAt:"" }).value.responseMinutes, null);            // replied but no time recorded
  assert.equal(check({ reply:"no_response" }).value.responseMinutes, null);
  assert.equal(check({ reply:"" }).value.responseMinutes, null);
  assert.equal(check({ messageSent:"no", contactAttemptedAt:"" }).value.responseMinutes, null);
});
test("rating: whole number 1-5 or blank", () => {
  for (const r of [0, 6, 2.5, -1, NaN]) assert.ok(errOf({ rating:r }).rating, String(r));
  for (const r of [1, 3, 5]) assert.equal(check({ rating:r }).value.rating, r);
  assert.equal(check({ rating:null }).value.rating, null);
  assert.equal(O.parseOutcomeInput({ ...base, rating:"5" }), null); // a string is not a rating
});
test("failure reason and match usable", () => {
  assert.ok(errOf({ matchUsable:"no", failureReason:"" }).failureReason);
  assert.equal(check({ matchUsable:"no", failureReason:"declined" }).ok, true);
  assert.ok(errOf({ failureReason:"made_up" }).failureReason);
  assert.equal(check({ matchUsable:"yes" }).ok, true);
});
test("job started needs sent + a yes reply, and not an unusable match", () => {
  assert.ok(errOf({ jobStarted:"yes" }).jobStarted);                                    // no reply recorded
  assert.ok(errOf({ jobStarted:"yes", reply:"no" }).jobStarted);
  assert.ok(errOf({ jobStarted:"yes", messageSent:"no", contactAttemptedAt:"" }).jobStarted);
  assert.ok(errOf({ jobStarted:"yes", reply:"yes", matchUsable:"no", failureReason:"other" }).jobStarted);
  assert.equal(check({ jobStarted:"yes", reply:"yes" }).ok, true);
  assert.equal(check({ jobStarted:"no" }).ok, true); assert.equal(check({ jobStarted:"" }).ok, true);
});
test("malformed bodies are rejected", () => {
  for (const b of [null, [], "x", 5, { ...base, messageSent:"maybe" }, { ...base, reply:"sure" }, { ...base, requestId:5 }, { ...base, requestId:"R".repeat(100) }]) assert.equal(O.parseOutcomeInput(b), null);
});
test("IST helpers round-trip", () => {
  assert.equal(O.toIstLocal("2026-10-21T09:00:00.000Z"), "2026-10-21T14:30");
  assert.equal(O.toIstLocal(""), ""); assert.equal(O.toIstLocal("junk"), "");
  assert.equal(new Date(O.parseIstLocal("2026-10-21T14:30")).toISOString(), "2026-10-21T09:00:00.000Z");
});
test("row layout stores IDs and facts only (no names, phones, message text)", () => {
  const v = check({ reply:"yes", contactAttemptedAt:"2026-10-21T10:00", repliedAt:"2026-10-21T12:15", matchUsable:"yes", rating:4, jobStarted:"yes" }).value;
  const row = O.buildOutcomeRow(v, { id:"O-TESTTEST", recordType:"TEST", recordedAt:"r", updatedAt:"u" });
  assert.equal(row.length, O.OUTCOME_HEADERS.length);
  const g = (h) => row[O.OUTCOME_HEADERS.indexOf(h)];
  assert.equal(g("record_type"), "TEST"); assert.equal(g("response_minutes"), "135"); assert.equal(g("usefulness_rating"), "4"); assert.equal(g("message_sent"), "yes");
  assert.ok(!O.OUTCOME_HEADERS.some(h => /name|phone|message$|text|note/i.test(h.replace("message_sent", ""))));
});

// ==================== calculations ====================
let n = 0;
const out = (o = {}) => ({ id:`O-${++n}`, recordType:"REAL", requestId:"R-B", contractorId:"C-A", recordedAt:"", updatedAt:"", messageSent:"yes", contactAttemptedAt:"x", reply:"", repliedAt:"", responseMinutes:null, matchUsable:"", rating:null, failureReason:"", jobStarted:"", ...o });

test("EMPTY dataset: zero everything, no percentages, no medians", () => {
  for (const t of ["REAL", "TEST"]) {
    const s = S.computeTypeStats([], t);
    assert.equal(s.hasData, false); assert.equal(s.total, 0);
    assert.equal(s.responseRate.percent, null); assert.equal(s.responseRate.denominator, 0);
    assert.equal(s.responseTime.median, null); assert.equal(s.responseTime.n, 0);
    assert.equal(s.ratings.median, null); assert.equal(s.usableShare.percent, null); assert.equal(s.jobStartedShare.percent, null);
    assert.deepEqual(s.failureReasons, {});
  }
});
test("counts: sent / not sent / replies / waiting", () => {
  const rows = [out({ reply:"yes" }), out({ reply:"no" }), out({ reply:"no_response" }), out({ reply:"" }), out({ messageSent:"no", contactAttemptedAt:"" })];
  const s = S.computeTypeStats(rows, "REAL");
  assert.deepEqual(s.sent, { yes:4, no:1 }); assert.deepEqual(s.replies, { yes:1, no:1, noResponse:1, awaiting:1 }); assert.equal(s.total, 5);
});
test("response rate: waiting messages are not counted against it; percent only with enough data", () => {
  const four = [out({ reply:"yes" }), out({ reply:"no" }), out({ reply:"no_response" }), out({ reply:"no_response" }), out({ reply:"" }), out({ reply:"" })];
  const s4 = S.computeTypeStats(four, "REAL");
  assert.equal(s4.responseRate.numerator, 2); assert.equal(s4.responseRate.denominator, 4); assert.equal(s4.responseRate.percent, null); assert.equal(s4.responseRate.enough, false);
  const five = [...four.slice(0, 4), out({ reply:"yes" })];
  const s5 = S.computeTypeStats(five, "REAL");
  assert.equal(s5.responseRate.denominator, 5); assert.equal(s5.responseRate.enough, true); assert.equal(s5.responseRate.percent, 60); // 3 of 5
});
test("unsent messages never count toward replies or the response rate", () => {
  const rows = [out({ messageSent:"no", reply:"yes" }), out({ messageSent:"no", reply:"no_response" })]; // (corrupt rows edited by hand)
  const s = S.computeTypeStats(rows, "REAL");
  assert.equal(s.responseRate.denominator, 0); assert.deepEqual(s.replies, { yes:0, no:0, noResponse:0, awaiting:0 });
});
test("median response time: odd, even, only replies with both times, none for no_response", () => {
  const withMins = (m, reply = "yes") => out({ reply, responseMinutes:m });
  const odd = S.computeTypeStats([10, 20, 30, 40, 50].map(m => withMins(m)), "REAL");
  assert.equal(odd.responseTime.median, 30); assert.equal(odd.responseTime.n, 5); assert.equal(odd.responseTime.enough, true);
  const even = S.computeTypeStats([10, 20, 30, 40, 50, 60].map(m => withMins(m, "no")), "REAL");
  assert.equal(even.responseTime.median, 35);
  const few = S.computeTypeStats([10, 20, 30, 40].map(m => withMins(m)), "REAL");
  assert.equal(few.responseTime.median, null); assert.equal(few.responseTime.n, 4); assert.equal(few.responseTime.enough, false);
  const mixed = S.computeTypeStats([...[10, 20, 30, 40, 50].map(m => withMins(m)), out({ reply:"yes", responseMinutes:null }), out({ reply:"no_response", responseMinutes:999 })], "REAL");
  assert.equal(mixed.responseTime.n, 5); assert.equal(mixed.responseTime.median, 30);
});
test("median helper and formatting", () => {
  assert.equal(S.median([]), null); assert.equal(S.median([5]), 5); assert.equal(S.median([3, 1, 2]), 2); assert.equal(S.median([4, 1, 2, 3]), 2.5);
  assert.equal(S.formatMinutes(0), "0 min"); assert.equal(S.formatMinutes(45), "45 min"); assert.equal(S.formatMinutes(60), "1 h"); assert.equal(S.formatMinutes(135), "2 h 15 min"); assert.equal(S.formatMinutes(1500), "1 d 1 h");
});
test("usable, ratings and jobs: counts always, shares/medians only with enough data", () => {
  const rows = [
    out({ matchUsable:"yes", rating:5, jobStarted:"yes" }), out({ matchUsable:"yes", rating:4, jobStarted:"no" }), out({ matchUsable:"no", rating:2, failureReason:"declined", jobStarted:"no" }),
    out({ matchUsable:"", rating:null, jobStarted:"" }), out({ matchUsable:"yes", rating:4, jobStarted:"" }),
  ];
  const s = S.computeTypeStats(rows, "REAL");
  assert.deepEqual(s.usable, { yes:3, no:1, notSure:1 }); assert.equal(s.usableShare.denominator, 4); assert.equal(s.usableShare.percent, null);
  assert.equal(s.ratings.n, 4); assert.deepEqual(s.ratings.counts, [0, 1, 0, 2, 1]); assert.equal(s.ratings.median, null);
  assert.deepEqual(s.jobStarted, { yes:1, no:2, unknown:2 }); assert.equal(s.jobStartedShare.denominator, 3); assert.equal(s.jobStartedShare.percent, null);
  assert.deepEqual(s.failureReasons, { declined:1 });
  const more = S.computeTypeStats([...rows, out({ matchUsable:"yes", rating:5 })], "REAL");
  assert.equal(more.ratings.n, 5); assert.equal(more.ratings.median, 4); assert.equal(more.usableShare.percent, 80);
});
test("TEST and REAL are calculated separately and never mixed", () => {
  const rows = [out({ recordType:"REAL", reply:"yes" }), out({ recordType:"TEST", reply:"yes" }), out({ recordType:"TEST", reply:"no_response" }), out({ recordType:"TEST", reply:"" })];
  const real = S.computeTypeStats(rows, "REAL"), test_ = S.computeTypeStats(rows, "TEST");
  assert.equal(real.total, 1); assert.equal(test_.total, 3); assert.equal(real.sent.yes, 1); assert.equal(test_.sent.yes, 3);
  assert.equal(real.replies.noResponse, 0); assert.equal(test_.replies.noResponse, 1);
  const onlyTest = S.computeTypeStats(rows.filter(r => r.recordType === "TEST"), "REAL");
  assert.equal(onlyTest.hasData, false); // test data never makes REAL look populated
});

// ==================== reading rows back ====================
test("parseOutcomeRow tolerates hand-edited junk without guessing", () => {
  const r = O.parseOutcomeRow({ outcome_id:"O-1", record_type:"REAL", request_id:"R-X", contractor_id:"C-Y", message_sent:"maybe", contractor_reply:"sure", response_minutes:"-5", usefulness_rating:"9", match_usable:"???", job_started:"yes" });
  assert.equal(r.messageSent, ""); assert.equal(r.reply, ""); assert.equal(r.responseMinutes, null); assert.equal(r.rating, null); assert.equal(r.matchUsable, ""); assert.equal(r.jobStarted, "yes");
  assert.equal(O.parseOutcomeRow({ record_type:"OTHER", request_id:"R", contractor_id:"C" }), null);
  assert.equal(O.parseOutcomeRow({ record_type:"REAL", request_id:"", contractor_id:"C" }), null);
  assert.equal(O.parseOutcomeRow({ record_type:"REAL", request_id:"R", contractor_id:"C", response_minutes:"" }).responseMinutes, null);
});

// ==================== store with a fake Sheet ====================
const RID = "R-BBBBBBBB", CID = "C-AAAAAAAA";
const V = "v1-2026-10-21";
const rowFrom = (headers, o) => headers.map(h => o[h] ?? "");
function fakeSheet({ outcomes = [], recordType = "TEST", headers = [...O.OUTCOME_HEADERS], contractorType = recordType, requestType = recordType, createdAt = REQ_CREATED } = {}) {
  const tabs = {
    Contractors:[[...CONTRACTOR_HEADERS], rowFrom(CONTRACTOR_HEADERS, { contractor_id:CID, record_type:contractorType, name:"Ravi", primary_trade:"Plumbing", service_areas:"Baner", phone:"+919111122222", consent_version:V })],
    Requests:[[...REQUEST_HEADERS], rowFrom(REQUEST_HEADERS, { request_id:RID, record_type:requestType, created_at:createdAt, trade:"Plumbing", service_area:"Baner", contact_phone:"+918000000000" })],
    Outcomes:[headers, ...outcomes],
  };
  const col = (l) => l.charCodeAt(0) - 65;
  return { tabs, appended:[], updated:[], async read(ranges) { return ranges.map(r => { const m = /^(\w+)!([A-Z])(\d+):([A-Z])(\d*)$/.exec(r); const a = col(m[2]), b = col(m[4]);
      return tabs[m[1]].map(row => { const c = row.slice(a, b + 1); while (c.length && c[c.length-1] === "") c.pop(); return c; }).slice(Number(m[3]) - 1, m[5] ? Number(m[5]) : undefined); }); },
    async append(range, row) { this.appended.push([range, row]); tabs.Outcomes.push(row); },
    async update(range, row) { this.updated.push([range, row]); const n = Number(/(\d+):/.exec(range)[1]); tabs.Outcomes[n - 1] = row; } };
}
const ID = () => "O-NEWNEWNE";
const env = (recordType = "TEST") => ({ recordType, now:NOW });
const body = (o = {}) => ({ ...base, ...o });

test("store: a valid outcome is appended once with the server's record type", async () => {
  const sheet = fakeSheet();
  const r = await recordOutcome(sheet, body({ reply:"yes", repliedAt:"2026-10-21T12:15", contactAttemptedAt:"2026-10-21T10:00" }), env(), ID);
  assert.deepEqual(r, { ok:true, updated:false, responseMinutes:135 });
  assert.equal(sheet.appended.length, 1); assert.equal(sheet.updated.length, 0);
  const row = sheet.appended[0][1]; assert.equal(row[1], "TEST"); assert.equal(row[2], RID); assert.equal(row[3], CID); assert.equal(sheet.appended[0][0], "Outcomes!A1");
  assert.ok(!row.join("|").includes("Ravi") && !row.join("|").includes("9111122222") && !row.join("|").includes("8000000000"));
});
test("store: saving the same pair again updates that row instead of adding another", async () => {
  const sheet = fakeSheet();
  await recordOutcome(sheet, body(), env(), ID);
  const r = await recordOutcome(sheet, body({ reply:"no_response" }), env(), () => "O-OTHERRRR");
  assert.equal(r.updated, true); assert.equal(sheet.appended.length, 1); assert.equal(sheet.updated.length, 1);
  assert.equal(sheet.updated[0][0], "Outcomes!A2:O2");
  const row = sheet.tabs.Outcomes[1]; assert.equal(row[0], "O-NEWNEWNE"); /* original id kept */ assert.equal(row[8], "no_response");
});
test("store: a REAL row for the same pair is not touched by a TEST save", async () => {
  const realRow = O.buildOutcomeRow(check({}).value, { id:"O-REALREAL", recordType:"REAL", recordedAt:"r", updatedAt:"u" });
  const sheet = fakeSheet({ outcomes:[realRow] });
  const r = await recordOutcome(sheet, body(), env("TEST"), ID);
  assert.equal(r.updated, false); assert.equal(sheet.updated.length, 0); assert.equal(sheet.appended.length, 1);
  assert.equal(sheet.tabs.Outcomes[1][1], "REAL");
});
test("store: contradictory or malformed input writes nothing", async () => {
  const sheet = fakeSheet();
  assert.equal((await recordOutcome(sheet, body({ messageSent:"" }), env(), ID)).error, "validation");
  assert.equal((await recordOutcome(sheet, body({ reply:"yes", messageSent:"no", contactAttemptedAt:"" }), env(), ID)).error, "validation");
  assert.equal((await recordOutcome(sheet, "junk", env(), ID)).error, "invalid");
  assert.equal((await recordOutcome(sheet, body({ requestId:"nope" }), env(), ID)).error, "invalid");
  assert.equal(sheet.appended.length + sheet.updated.length, 0);
});
test("store: unknown IDs, or IDs from the other environment, are refused", async () => {
  const s1 = fakeSheet(); assert.equal((await recordOutcome(s1, body({ contractorId:"C-ZZZZZZZZ" }), env(), ID)).error, "not_found");
  assert.equal((await recordOutcome(s1, body({ requestId:"R-ZZZZZZZZ" }), env(), ID)).error, "not_found");
  const s2 = fakeSheet({ contractorType:"REAL", requestType:"REAL" }); // data is REAL but the server is TEST
  assert.equal((await recordOutcome(s2, body(), env("TEST"), ID)).error, "not_found");
  const s3 = fakeSheet({ contractorType:"TEST", requestType:"REAL" }); // mixed pair
  assert.equal((await recordOutcome(s3, body(), env("REAL"), ID)).error, "not_found");
  for (const s of [s1, s2, s3]) assert.equal(s.appended.length + s.updated.length, 0);
});
test("store: wrong headers refuse to read or write; Google errors propagate", async () => {
  const bad = [...O.OUTCOME_HEADERS]; [bad[2], bad[3]] = [bad[3], bad[2]];
  await assert.rejects(() => recordOutcome(fakeSheet({ headers:bad }), body(), env(), ID), SheetSetupError);
  await assert.rejects(() => loadOutcomes(fakeSheet({ headers:["wrong"] })), SheetSetupError);
  const s = fakeSheet(); s.append = async () => { throw new Error("boom"); };
  await assert.rejects(() => recordOutcome(s, body(), env(), ID), /boom/);
});
test("store: outcomes load back and the form pre-fills in India time", async () => {
  const sheet = fakeSheet();
  await recordOutcome(sheet, body({ reply:"yes", repliedAt:"2026-10-21T12:15", contactAttemptedAt:"2026-10-21T10:00", rating:4, matchUsable:"yes" }), env(), ID);
  const loaded = await loadOutcomes(sheet); assert.equal(loaded.length, 1); assert.equal(loaded[0].responseMinutes, 135); assert.equal(loaded[0].rating, 4);
  const form = await loadFormValues(sheet, RID, CID, "TEST");
  assert.equal(form.exists, true); assert.equal(form.values.contactAttemptedAt, "2026-10-21T10:00"); assert.equal(form.values.repliedAt, "2026-10-21T12:15"); assert.equal(form.values.reply, "yes");
  const blank = await loadFormValues(fakeSheet(), RID, CID, "TEST"); assert.equal(blank.exists, false); assert.equal(blank.values.messageSent, "");
  assert.equal(await loadFormValues(sheet, "bad", CID, "TEST"), null);
  assert.equal(await loadFormValues(sheet, RID, CID, "REAL"), null);
});

// ==================== dashboard rendering ====================
const view = (stats, title = "Real results") => renderToStaticMarkup(createElement(StatsView, { stats, title, caption:"c" }));
test("render: empty REAL section says so plainly", () => {
  const html = view(S.computeTypeStats([], "REAL"));
  assert.ok(html.includes("No real results yet")); assert.ok(html.includes("Nothing is estimated"));
  assert.ok(!/%|median|\d+ of \d+/i.test(html.replace("Nothing is estimated in the meantime.", "")), html);
});
test("render: empty TEST section says so too", () => assert.ok(view(S.computeTypeStats([], "TEST"), "Test results").includes("No test results yet")));
test("render: test data present, real empty -> real still shows the empty state", () => {
  const rows = [out({ recordType:"TEST", reply:"yes" })];
  assert.ok(view(S.computeTypeStats(rows, "REAL")).includes("No real results yet"));
  const t = view(S.computeTypeStats(rows, "TEST"), "Test results"); assert.ok(t.includes("Outcomes recorded"));
});
test("render: too little data shows counts and says why there is no percentage or median", () => {
  const rows = [out({ reply:"yes", responseMinutes:30 }), out({ reply:"no_response" }), out({ reply:"" })];
  const html = view(S.computeTypeStats(rows, "REAL"));
  assert.ok(html.includes("1 of 2")); assert.ok(html.includes("too few to show a percentage"));
  assert.ok(html.includes("Not enough data yet (1 reply time recorded; at least 5 needed)"));
  assert.ok(!/\(\d+%\)/.test(html), "percentage shown with too little data");
  assert.ok(html.includes("1 yes · 0 no · 1 no response · 1 still waiting"));
});
test("render: enough data shows percentages and medians", () => {
  const rows = [10, 20, 30, 40, 50].map(m => out({ reply:"yes", responseMinutes:m, rating:4, matchUsable:"yes" }));
  const html = view(S.computeTypeStats(rows, "REAL"));
  assert.ok(html.includes("5 of 5 (100%)")); assert.ok(html.includes("30 min (from 5 replies with times)")); assert.ok(html.includes("median 4"));
});
test("render: nothing identifying is ever shown", () => {
  const rows = [out({ reply:"yes", responseMinutes:30, requestId:"R-SECRETXX", contractorId:"C-SECRETXX" })];
  const html = view(S.computeTypeStats(rows, "REAL")); assert.ok(!html.includes("SECRETXX")); assert.ok(!/\+91|\d{10}/.test(html));
});
