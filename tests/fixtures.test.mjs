// Local fixture mode: an in-memory Sheet of made-up records for trying the
// screens in a browser. These tests focus on the safety switches and on the fake
// Sheet behaving like the real one.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { fixtureSheet, fixturesEnabled, buildFixtureSheet } from "../lib/fixtures.ts";
import { createMemorySheet } from "../lib/memory-sheet.ts";
import { getContractorSheet, NotConfiguredError, setContractorSheetForTests } from "../lib/google-sheets.ts";
import { planSetup, REQUIRED_TABLES } from "../lib/sheet-setup.ts";
import { matchContractors } from "../lib/match.ts";
import { loadContractors, loadRequests } from "../lib/records.ts";
import { loadOutcomes } from "../lib/outcome-store.ts";
import { completeJob, selectContractor } from "../lib/job-store.ts";
import { createInvite, loadSummaries, submitReview } from "../lib/review-store.ts";
import { todayInIndia } from "../lib/registration.ts";

afterEach(() => {
  delete globalThis.__contractorDeskFixtureSheet;
  process.env.NODE_ENV = "test";
  delete process.env.CONTRACTOR_DESK_FIXTURES;
  delete process.env.VERCEL;
  delete process.env.REGISTRATION_RECORD_TYPE;
  setContractorSheetForTests(null);
});

// ============================ the safety switches ============================
test("fixture mode needs the flag AND the development server; nothing else switches it on", () => {
  const on = { CONTRACTOR_DESK_FIXTURES: "1", NODE_ENV: "development" };
  assert.equal(fixturesEnabled(on), true);
  for (const [env, why] of [
    [{}, "nothing set"],
    [{ NODE_ENV: "development" }, "no flag"],
    [{ CONTRACTOR_DESK_FIXTURES: "1" }, "no environment"],
    [{ CONTRACTOR_DESK_FIXTURES: "1", NODE_ENV: "production" }, "a production build"],
    [{ CONTRACTOR_DESK_FIXTURES: "1", NODE_ENV: "test" }, "the test environment"],
    [{ ...on, VERCEL: "1" }, "on Vercel"],
    [{ ...on, VERCEL: "anything" }, "on Vercel (any value)"],
    [{ ...on, REGISTRATION_RECORD_TYPE: "REAL" }, "set to REAL data"],
    [{ ...on, CONTRACTOR_DESK_FIXTURES: "true" }, "flag with the wrong value"],
    [{ ...on, CONTRACTOR_DESK_FIXTURES: "0" }, "flag off"],
    [{ ...on, CONTRACTOR_DESK_FIXTURES: "" }, "flag empty"],
  ]) {
    assert.equal(fixturesEnabled(env), false, why);
  }
});

test("the app's Sheet connection hands out the fixture only in a development server with the flag", async () => {
  process.env.CONTRACTOR_DESK_FIXTURES = "1";
  process.env.NODE_ENV = "test"; setContractorSheetForTests(null); // the test hook only works in the test environment
  process.env.NODE_ENV = "development";
  assert.equal(getContractorSheet(), fixtureSheet());
  assert.equal(getContractorSheet(), getContractorSheet(), "one shared fixture, not a new one per call");
});

test("in production, on Vercel, or for REAL data the connection refuses the fixture and asks for real settings", () => {
  for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "development", VERCEL: "1" }, { NODE_ENV: "development", REGISTRATION_RECORD_TYPE: "REAL" }]) {
    process.env.NODE_ENV = "test"; setContractorSheetForTests(null);
    for (const k of ["VERCEL", "REGISTRATION_RECORD_TYPE", "GOOGLE_SHEET_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL"]) delete process.env[k];
    process.env.CONTRACTOR_DESK_FIXTURES = "1";
    Object.assign(process.env, env);
    assert.throws(() => getContractorSheet(), NotConfiguredError, JSON.stringify(env));
  }
});

// ============================ the in-memory Sheet behaves like the real one ============================
const grid = () => ({ Things: [["id", "name", "note"], ["1", "a", ""], ["2", "b", "x"]] });

test("reads follow the same range forms the app uses, and leave out trailing empty cells", async () => {
  const sheet = createMemorySheet({ Wide: [["A", "B", "C", "D"], ["1", "2", "", ""], ["3", "4", "5", "6"]], ...grid() });
  assert.deepEqual(await sheet.read(["Things!1:1"]), [[["id", "name", "note"]]]);
  assert.deepEqual(await sheet.read(["Things!A1:C"]), [[["id", "name", "note"], ["1", "a"], ["2", "b", "x"]]]);
  assert.deepEqual(await sheet.read(["Things!B1:B1"]), [[["name"]]]);
  assert.deepEqual(await sheet.read(["Things!A2:A"]), [[["1"], ["2"]]]);
  assert.deepEqual(await sheet.read(["Wide!C1:D"]), [[["C", "D"], [], ["5", "6"]]]);
  assert.deepEqual(await sheet.read(["Things!1:1", "Things!A2:A3"]), [[["id", "name", "note"]], [["1"], ["2"]]]);
});

test("append adds a row, update replaces one row, and neither touches other tabs", async () => {
  const sheet = createMemorySheet({ ...grid(), Other: [["z"]] });
  await sheet.append("Things!A1", ["3", "c", ""]);
  await sheet.update("Things!A2:C2", ["1", "A", "edited"]);
  assert.deepEqual(sheet.tabs.Things, [["id", "name", "note"], ["1", "A", "edited"], ["2", "b", "x"], ["3", "c", ""]]);
  assert.deepEqual(sheet.tabs.Other, [["z"]]);
});

test("a missing tab fails with status 400, exactly like Google, so the app reports a setup problem", async () => {
  const sheet = createMemorySheet({});
  for (const call of [() => sheet.read(["Nope!1:1"]), () => sheet.append("Nope!A1", ["x"]), () => sheet.update("Nope!A2:B2", ["x"])]) {
    await assert.rejects(call, (e) => e.status === 400);
  }
  await assert.rejects(() => sheet.read(["not a range"]), /cannot read/);
});

test("tabs can be listed and added once; the starting data is copied, not shared", async () => {
  const start = grid();
  const sheet = createMemorySheet(start);
  await sheet.append("Things!A1", ["3", "c", ""]);
  assert.equal(start.Things.length, 3, "the original data was not changed");
  assert.deepEqual(await sheet.listTabs(), ["Things"]);
  await sheet.addTab("New");
  assert.deepEqual(await sheet.listTabs(), ["Things", "New"]);
  await assert.rejects(() => sheet.addTab("New"));
});

// ============================ the seeded fixture data ============================
test("the fixture has every tab the app needs, with exactly the headers the app checks", async () => {
  const sheet = buildFixtureSheet();
  assert.deepEqual((await planSetup(sheet)).map((p) => p.state), REQUIRED_TABLES.map(() => "ok"));
  assert.equal((await loadContractors(sheet)).length, 3);
  assert.equal((await loadRequests(sheet)).length, 1);
  assert.deepEqual(await loadOutcomes(sheet), []);
});

test("the fixture is all made up and all TEST, and each server gets one shared copy", async () => {
  const sheet = fixtureSheet();
  assert.equal(fixtureSheet(), sheet);
  const text = JSON.stringify(sheet.tabs);
  assert.ok(!/@|ritesh|oswal|forge27|mesaschool/i.test(text));
  for (const c of await loadContractors(sheet)) assert.equal(c.recordType, "TEST");
  assert.ok((await loadRequests(sheet)).every((r) => r.recordType === "TEST"));
  const phone = sheet.tabs.Contractors[0].indexOf("phone");
  for (const r of sheet.tabs.Contractors.slice(1)) assert.match(r[phone], /^\+9190000\d{5}$/, "every phone number is a made-up 90000-series number");
});

test("the fixture shows each matching case: an exact match, a near-date match needing confirmation, and a non-match", async () => {
  const sheet = buildFixtureSheet();
  const request = (await loadRequests(sheet))[0];
  const result = matchContractors(request, await loadContractors(sheet), { envType: "TEST" });
  const byId = Object.fromEntries(result.candidates.map((c) => [c.contractorId, c]));
  assert.deepEqual(result.candidates.length, 2);
  assert.equal(byId["C-ASHAASHA"].startFit.label, null);
  assert.equal(byId["C-BHIMBHIM"].startFit.label, "Start date needs confirmation");
  assert.equal(byId["C-CHITRACH"], undefined, "a different trade never matches");
});

test("a whole job runs on the fixture: choose, complete, invite, review, rating", async () => {
  const sheet = buildFixtureSheet();
  const request = (await loadRequests(sheet))[0];
  const env = { recordType: "TEST", today: todayInIndia() };
  assert.equal((await selectContractor(sheet, { requestId: request.id, contractorId: "C-BHIMBHIM" }, env, () => "J-1")).error, "not_confirmed");
  assert.equal((await selectContractor(sheet, { requestId: request.id, contractorId: "C-ASHAASHA" }, env, () => "J-2")).ok, true);
  assert.equal((await completeJob(sheet, { requestId: request.id }, env)).ok, true);
  const made = await createInvite(sheet, { requestId: request.id }, { recordType: "TEST" }, () => "V-1");
  assert.equal(made.ok, true);
  assert.equal((await submitReview(sheet, { token: made.token, input: { overall: 5, comment: "Fixture feedback" }, language: "en" }, { recordType: "TEST" }, () => "W-1")).ok, true);
  const summary = (await loadSummaries(sheet, "TEST")).get("C-ASHAASHA");
  assert.deepEqual([summary.count, summary.average, summary.confidence], [1, 5, "early"]);
});

test("a whole bidding run works on the fixture: open, invite, bid in different units, near-date blocked, select, then the job carries on", async () => {
  const { openBidding, createBidInvite, submitBid, selectBidder, loadBids } = await import("../lib/bid-store.ts");
  const sheet = buildFixtureSheet();
  const request = (await loadRequests(sheet))[0];
  const env = { recordType: "TEST", today: todayInIndia() };
  let n = 0;
  const id = (p) => () => p + "-" + String(++n).split("").map((d) => "ABCDEFGHJK"[Number(d)]).join("").padStart(8, "A");
  assert.equal((await openBidding(sheet, { requestId: request.id }, env, id("E"))).ok, true);
  const asha = await createBidInvite(sheet, { requestId: request.id, contractorId: "C-ASHAASHA" }, env, id("I"));
  const bhim = await createBidInvite(sheet, { requestId: request.id, contractorId: "C-BHIMBHIM" }, env, id("I"));
  assert.deepEqual(await createBidInvite(sheet, { requestId: request.id, contractorId: "C-CHITRACH" }, env, id("I")), { ok: false, error: "not_candidate" });
  const a = await submitBid(sheet, { token: asha.token, input: { amount: "20", unit: "per_sqft" }, language: "en" }, { recordType: "TEST" }, id("B"));
  const b = await submitBid(sheet, { token: bhim.token, input: { amount: "1500", unit: "per_day" }, language: "en" }, { recordType: "TEST" }, id("B"));
  assert.deepEqual([a.ok, a.provisional, b.ok, b.provisional], [true, false, true, true]);
  assert.equal((await selectBidder(sheet, { requestId: request.id, bidId: b.bidId }, env, id("J"))).error, "not_confirmed");
  const chosen = await selectBidder(sheet, { requestId: request.id, bidId: a.bidId }, env, id("J"));
  assert.deepEqual([chosen.ok, chosen.job.contractorId], [true, "C-ASHAASHA"]);
  assert.equal((await loadBids(sheet, "TEST")).length, 2);
});
