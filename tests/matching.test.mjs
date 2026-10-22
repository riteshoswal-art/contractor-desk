import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as M from "../lib/match.ts";
import { loadContractors, loadRequests } from "../lib/records.ts";
import { CONTRACTOR_HEADERS } from "../lib/registration.ts";
import { REQUEST_HEADERS } from "../lib/request.ts";
import MatchResults from "../app/admin/requests/MatchResults.tsx";

const NOW = new Date("2026-10-21T10:00:00.000Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const V = M.ACCEPTED_CONSENT_VERSIONS[0];
let n = 0;
const C = (o = {}) => ({ id:`C-${String(++n).padStart(8,"0")}`, recordType:"TEST", name:"Test Person", trade:"Plumbing", serviceAreas:["Baner"],
  availability:"now", earliestStart:"", consentVersion:V, consentTimestamp:daysAgo(2), availabilityReportedAt:daysAgo(2), lastConfirmedAt:"", deletionRequestedAt:"", ...o });
const REQ = { id:"R-TESTTEST", recordType:"TEST", createdAt:daysAgo(0), developerName:"Dev", description:"Plumber left Baner site", trade:"Plumbing", area:"Baner", startDate:"2026-10-26", durationDays:14, notes:"", status:"New requirement" };
const run = (cs, req = REQ, extra = {}) => M.matchContractors(req, cs, { envType:"TEST", now:NOW, ...extra });

test("exact match: trade + area + availability + fresh report", () => {
  const r = run([C()]);
  assert.equal(r.candidates.length, 1); assert.equal(r.eligibleCount, 1); assert.equal(r.checked, 1);
  const c = r.candidates[0];
  assert.ok(c.reasons.some(x => x.startsWith("Trade matches: Plumbing")));
  assert.ok(c.reasons.some(x => x.includes("Baner")));
  assert.ok(c.reasons.some(x => x.includes("available now")));
  assert.ok(c.reasons.some(x => x.includes("reported by the contractor")));
  assert.equal(c.evidence.kind, "self_reported");
  assert.ok(c.missing.some(x => x.includes("not been confirmed")));
});
test("area is case-insensitive and any listed area can match", () => {
  assert.equal(run([C({ serviceAreas:["wakad","BANER"] })]).candidates.length, 1);
});
test("area mismatch is excluded and counted", () => {
  const r = run([C({ serviceAreas:["Wakad","Kothrud"] })]);
  assert.equal(r.candidates.length, 0); assert.equal(r.excluded.area_mismatch, 1);
});
test("trade mismatch is excluded and counted", () => {
  const r = run([C({ trade:"Electrical" })]);
  assert.equal(r.candidates.length, 0); assert.equal(r.excluded.trade_mismatch, 1);
});
test("unavailable (and unrecognised status) excluded", () => {
  const r = run([C({ availability:"unavailable" }), C({ availability:"" }), C({ availability:"busy???" })]);
  assert.equal(r.candidates.length, 0); assert.equal(r.excluded.unavailable, 3);
});
test("from_date: too late excluded, on-time included, no request date included with note", () => {
  assert.equal(run([C({ availability:"from_date", earliestStart:"2026-11-15" })]).excluded.starts_too_late, 1);
  const ok = run([C({ availability:"from_date", earliestStart:"2026-10-26" })]);
  assert.equal(ok.candidates.length, 1); assert.ok(ok.candidates[0].reasons.some(x => x.includes("on or before the requested start")));
  const noDate = run([C({ availability:"from_date", earliestStart:"2027-01-01" })], { ...REQ, startDate:"" });
  assert.equal(noDate.candidates.length, 1); assert.ok(noDate.candidates[0].missing.some(x => x.includes("no start date")));
});
test("stale availability: 15 days excluded, 13 days included", () => {
  assert.equal(run([C({ availabilityReportedAt:daysAgo(15) })]).excluded.stale_availability, 1);
  assert.equal(run([C({ availabilityReportedAt:daysAgo(13) })]).candidates.length, 1);
  assert.equal(run([C({ availabilityReportedAt:daysAgo(15) })], REQ, { staleDays:30 }).candidates.length, 1);
});
test("no usable timestamp, or one from the future, counts as stale", () => {
  assert.equal(run([C({ availabilityReportedAt:"" })]).excluded.stale_availability, 1);
  assert.equal(run([C({ availabilityReportedAt:"garbage" })]).excluded.stale_availability, 1);
  assert.equal(run([C({ availabilityReportedAt:daysAgo(-30) })]).excluded.stale_availability, 1);
});
test("a recent founder confirmation outweighs an old self-report", () => {
  const r = run([C({ availabilityReportedAt:daysAgo(40), lastConfirmedAt:daysAgo(1) })]);
  assert.equal(r.candidates.length, 1); assert.equal(r.candidates[0].evidence.kind, "founder_confirmed");
  assert.ok(r.candidates[0].reasons.some(x => x.includes("confirmed by you") && x.includes("may have changed")));
});
test("an old confirmation does not rescue stale data", () => {
  assert.equal(run([C({ availabilityReportedAt:daysAgo(40), lastConfirmedAt:daysAgo(30) })]).excluded.stale_availability, 1);
});
test("consent rules", () => {
  const r = run([C({ consentVersion:"" }), C({ consentVersion:"v0-unknown" }), C({ consentTimestamp:"" })]);
  assert.equal(r.candidates.length, 0); assert.equal(r.excluded.no_consent, 3);
  const d = run([C({ deletionRequestedAt:daysAgo(1) })]);
  assert.equal(d.candidates.length, 0); assert.equal(d.excluded.deletion_requested, 1);
});
test("environment separation: REAL records are invisible to TEST matching and vice versa", () => {
  const cs = [C({ recordType:"REAL" }), C({ recordType:"TEST" })];
  const t = run(cs); assert.equal(t.checked, 1); assert.equal(t.candidates.length, 1); assert.equal(t.candidates[0].recordType, "TEST");
  const r = M.matchContractors({ ...REQ, recordType:"REAL" }, cs, { envType:"REAL", now:NOW });
  assert.equal(r.checked, 1); assert.equal(r.candidates[0].recordType, "REAL");
});
test("at most five candidates; founder-confirmed first; stable order", () => {
  const cs = Array.from({ length: 8 }, (_, i) => C({ availabilityReportedAt:daysAgo(i) }));
  cs.push(C({ availabilityReportedAt:daysAgo(10), lastConfirmedAt:daysAgo(9) }));
  const r = run(cs);
  assert.equal(r.candidates.length, 5); assert.equal(r.eligibleCount, 9);
  assert.equal(r.candidates[0].evidence.kind, "founder_confirmed");
  const times = r.candidates.slice(1).map(c => new Date(c.evidence.at).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  assert.deepEqual(run(cs).candidates.map(c => c.contractorId), r.candidates.map(c => c.contractorId));
});
test("empty results: no contractors at all", () => {
  const r = run([]); assert.equal(r.candidates.length, 0); assert.equal(r.checked, 0); assert.equal(r.eligibleCount, 0);
  assert.ok(Object.values(r.excluded).every(v => v === 0));
});
test("incomplete request runs no search", () => {
  const r = run([C()], { ...REQ, trade:"" }); assert.equal(r.requestIncomplete, true); assert.equal(r.candidates.length, 0);
  assert.equal(run([C()], { ...REQ, area:"" }).requestIncomplete, true);
});
test("missing information is flagged", () => {
  const c = run([C({ name:"" })]).candidates[0]; assert.ok(c.missing.some(x => x.includes("No name")));
  const o = run([C({ trade:"Other" })], { ...REQ, trade:"Other" }).candidates[0]; assert.ok(o.missing.some(x => x.includes('"Other"')));
});
test("nothing says verified or guaranteed; no phone data in results", () => {
  const r = run([C(), C({ lastConfirmedAt:daysAgo(1) }), C({ availability:"from_date", earliestStart:"2026-10-25" })]);
  const text = JSON.stringify(r);
  assert.ok(!/verified|guarantee/i.test(text), "forbidden wording");
  assert.ok(!/phone|\+91|\d{10}/i.test(text), "phone-like data present");
  for (const c of r.candidates) assert.deepEqual(Object.keys(c).sort(), ["contractorId","evidence","missing","name","reasons","recordType","serviceAreas","startFit","trade"]);
});
test("matching never mutates the input records", () => {
  const cs = [C(), C({ trade:"Electrical" })]; const before = JSON.stringify(cs); run(cs); assert.equal(JSON.stringify(cs), before);
});

// ---------- reading back from the Sheet ----------
function fakeSheetFor(headers, rows) {
  const requested = [];
  const colIdx = (l) => l.charCodeAt(0) - 65;
  return { requested, async read(ranges) {
    ranges.forEach(r => requested.push(r));
    return ranges.map(r => { const m = /!([A-Z])(\d+):([A-Z])(\d*)$/.exec(r); const a = colIdx(m[1]), b = colIdx(m[3]);
      const grid = [headers, ...rows];
      return grid.map(row => { const cells = row.slice(a, b + 1); while (cells.length && cells[cells.length-1] === "") cells.pop(); return cells; })
        .slice(Number(m[2]) - 1, m[4] ? Number(m[4]) : undefined); }); } };
}
const rowFrom = (headers, o) => headers.map(h => o[h] ?? "");
test("loadContractors never requests the phone column and drops it", async () => {
  const row = rowFrom(CONTRACTOR_HEADERS, { contractor_id:"C-AAAAAAAA", record_type:"TEST", created_at:"2026-10-20T00:00:00Z", name:"Ravi", primary_trade:"Plumbing", service_areas:"Baner; Wakad", availability_status:"now", phone:"+919999988888", consent_version:V, consent_timestamp:"2026-10-20T00:00:00Z", availability_reported_at:"2026-10-20T00:00:00Z" });
  const sheet = fakeSheetFor([...CONTRACTOR_HEADERS], [row, rowFrom(CONTRACTOR_HEADERS, {})]);
  const list = await loadContractors(sheet);
  assert.equal(list.length, 1); assert.deepEqual(list[0].serviceAreas, ["Baner","Wakad"]); assert.equal(list[0].name, "Ravi");
  assert.ok(!JSON.stringify(list).includes("9999988888"));
  // Only the phone column's header cell (for example "I1:I1") may be read.
  // Any other range that includes that column would fetch phone numbers.
  const letter = String.fromCharCode(65 + CONTRACTOR_HEADERS.indexOf("phone"));
  for (const range of sheet.requested) {
    const [, from, to] = /!([A-Z])\d+:([A-Z])/.exec(range);
    const includesPhoneColumn = from <= letter && letter <= to;
    const headerCellOnly = range === `Contractors!${letter}1:${letter}1`;
    assert.ok(!includesPhoneColumn || headerCellOnly, `range ${range} would fetch phone numbers`);
  }
});
test("loadRequests drops the developer phone", async () => {
  const row = rowFrom(REQUEST_HEADERS, { request_id:"R-AAAAAAAA", record_type:"TEST", created_at:"2026-10-20T00:00:00Z", contact_phone:"+918888877777", description:"d", trade:"Plumbing", service_area:"Baner", duration_days:"14", status:"New requirement" });
  const list = await loadRequests(fakeSheetFor([...REQUEST_HEADERS], [row]));
  assert.equal(list[0].durationDays, 14); assert.ok(!JSON.stringify(list).includes("8888877777"));
});
test("wrong headers refuse to load", async () => {
  const bad = [...CONTRACTOR_HEADERS]; [bad[2], bad[3]] = [bad[3], bad[2]];
  await assert.rejects(() => loadContractors(fakeSheetFor(bad, [])));
});

// ---------- rendering ----------
const render = (result, req = REQ) => renderToStaticMarkup(createElement(MatchResults, { result, request:req }));
test("page shows reasons, TEST label, distinguishes confirmed vs not, hides phone", () => {
  const html = render(run([C(), C({ lastConfirmedAt:daysAgo(1) })]));
  assert.ok(html.includes("Potential match — availability not confirmed"));
  assert.ok(html.includes("recorded as confirmed by you"));
  assert.ok(html.includes("Why this match")); assert.ok(html.includes(">TEST<")); assert.ok(html.includes("Phone number: held back"));
  assert.ok(!/verified|guarantee(?!d available)/i.test(html.replace(/no availability is guaranteed/gi, "")), "forbidden wording in page");
  assert.ok(!/\+91|\d{10}/.test(html));
});
test("page empty state when nothing matches", () => {
  const html = render(run([C({ trade:"Electrical" })]));
  assert.ok(html.includes("No suitable contractors found.")); assert.ok(html.includes("Nothing has been guessed")); assert.ok(html.includes("different trade"));
  assert.ok(!html.includes("Why this match"));
  assert.ok(render(run([])).includes("There are no TEST contractor records yet."));
});
test("page for incomplete request", () => assert.ok(render(run([C()], { ...REQ, area:"" }), { ...REQ, area:"" }).includes("no search was run")));
