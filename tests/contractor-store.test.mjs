import test from "node:test";
import assert from "node:assert/strict";
import * as R from "../lib/registration.ts";
import { saveContractor, SheetSetupError } from "../lib/contractor-store.ts";

const ok = { ...R.emptyValues, trade:"Plumbing", area:"Baner", availability:"now", phone:"+91 98765 43210", consent:true };
const meta = (t="TEST") => ({ id:"C-TEST0001", recordType:t, nowIso:"2026-10-21T10:00:00.000Z" });

// Fake in-memory sheet that mimics ranges used by the store.
function fakeSheet(rows = [], headers = [...R.CONTRACTOR_HEADERS]) {
  const data = [headers, ...rows];
  const col = (letter) => data.slice(1).map(r => (r[letter.charCodeAt(0)-65] ? [r[letter.charCodeAt(0)-65]] : []));
  return { data, appended: 0,
    async read(ranges) { return ranges.map(r => {
      if (r.endsWith("!1:1")) return [data[0]];
      const m = /!([A-Z])2:\1$/.exec(r); return col(m[1]); }); },
    async append(range, row) { this.appended++; data.push(row); } };
}

test("parseSubmission rejects bad shapes", () => {
  for (const b of [null, [], "x", 5, {name:5}, {consent:"true"}, {phone:"1".repeat(201)}, {website:1}]) assert.equal(R.parseSubmission(b), null);
  assert.ok(R.parseSubmission({}));
});
test("consent must be boolean true", () => {
  assert.equal(R.parseSubmission({ consent:"true" }), null);
  assert.equal(R.parseSubmission({ consent:false }).values.consent, false);
  assert.ok(R.validate({ ...ok, consent:false }, "2026-10-21").consent);
});
test("cleans control chars and spaces", () => {
  assert.equal(R.parseSubmission({ name:"  Ra\nmesh \t Patil " }).values.name, "Ra mesh Patil");
});
test("normalizePhone", () => {
  for (const p of ["9876543210","+91 98765-43210","919876543210","+919876543210"]) assert.equal(R.normalizePhone(p), "+919876543210");
});
test("todayInIndia uses IST", () => {
  assert.equal(R.todayInIndia(new Date("2026-10-21T20:00:00Z")), "2026-10-22"); // 01:30 IST next day
  assert.equal(R.todayInIndia(new Date("2026-10-21T10:00:00Z")), "2026-10-21");
});
test("row has right columns, order and server values", () => {
  const row = R.buildContractorRow({ ...ok, name:"Ramesh" }, meta());
  assert.equal(row.length, R.CONTRACTOR_HEADERS.length);
  const get = (h) => row[R.CONTRACTOR_HEADERS.indexOf(h)];
  assert.equal(get("contractor_id"), "C-TEST0001"); assert.equal(get("record_type"), "TEST");
  assert.equal(get("phone"), "+919876543210"); assert.equal(get("service_areas"), "Baner");
  assert.equal(get("consent_version"), R.CONSENT_VERSION); assert.equal(get("consent_text"), R.CONSENT_TEXT);
  assert.equal(get("consent_timestamp"), "2026-10-21T10:00:00.000Z");
  assert.equal(get("earliest_start_date"), "");
  assert.equal(get("last_availability_confirmed_at"), "");
});
test("from_date and other area", () => {
  const row = R.buildContractorRow({ ...ok, area:"Other", otherArea:"Wagholi", availability:"from_date", availabilityDate:"2030-01-15" }, meta());
  assert.equal(row[R.CONTRACTOR_HEADERS.indexOf("service_areas")], "Wagholi");
  assert.equal(row[R.CONTRACTOR_HEADERS.indexOf("earliest_start_date")], "2030-01-15");
});
test("formula-like text is neutralized", () => {
  const row = R.buildContractorRow({ ...ok, name:'=HYPERLINK("http://x")' }, meta());
  assert.equal(row[R.CONTRACTOR_HEADERS.indexOf("name")], `'=HYPERLINK("http://x")`);
  assert.equal(R.neutralizeCell("Ramesh"), "Ramesh");
});
test("saves a new contractor once", async () => {
  const s = fakeSheet();
  assert.equal(await saveContractor(s, ok, meta()), "saved");
  assert.equal(s.appended, 1);
});
test("duplicate phone (any format) is skipped, same type", async () => {
  const s = fakeSheet();
  await saveContractor(s, ok, meta());
  assert.equal(await saveContractor(s, { ...ok, phone:"9876543210" }, meta()), "duplicate");
  assert.equal(s.appended, 1);
});
test("TEST row does not block REAL, and vice versa", async () => {
  const s = fakeSheet();
  await saveContractor(s, ok, meta("TEST"));
  assert.equal(await saveContractor(s, ok, meta("REAL")), "saved");
  assert.equal(s.appended, 2);
  assert.equal(await saveContractor(s, ok, meta("REAL")), "duplicate");
});
test("header mismatch refuses to write", async () => {
  const bad = [...R.CONTRACTOR_HEADERS]; [bad[3], bad[4]] = [bad[4], bad[3]];
  const s = fakeSheet([], bad);
  await assert.rejects(() => saveContractor(s, ok, meta()), SheetSetupError);
  assert.equal(s.appended, 0);
  await assert.rejects(() => saveContractor(fakeSheet([], []), ok, meta()), SheetSetupError);
});
test("Google failure propagates (nothing claimed saved)", async () => {
  const s = fakeSheet(); s.append = async () => { throw new Error("boom"); };
  await assert.rejects(() => saveContractor(s, ok, meta()), /boom/);
});
