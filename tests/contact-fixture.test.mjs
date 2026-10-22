// Contact details in local fixture mode: the made-up number is revealed only
// after selection, only for the chosen contractor, and each viewing is recorded.
// TEST rows in the real Sheet stay hidden exactly as before.
import test from "node:test";
import assert from "node:assert/strict";
import { buildFixtureSheet } from "../lib/fixtures.ts";
import { JOB_TABLE } from "../lib/job.ts";
import { cancelJob, selectContractor, shareContact } from "../lib/job-store.ts";
import { todayInIndia } from "../lib/registration.ts";
import { readTable } from "../lib/tables.ts";

const REQ = "R-FIXTURE2";
const ENV = { recordType: "TEST", today: todayInIndia() };
const share = (sheet, o = {}) => shareContact(sheet, { requestId: REQ }, { ...ENV, realContactAllowed: false, syntheticContactAllowed: true, ...o });
const shares = async (sheet) => (await readTable(sheet, JOB_TABLE)).filter((r) => r.event === "contact_shared");

test("in fixture mode the made-up number is shown only after selection, for the chosen contractor only, and each viewing is recorded", async () => {
  const sheet = buildFixtureSheet();
  assert.equal((await share(sheet)).error, "no_job", "nothing before a contractor is selected");
  assert.equal((await selectContractor(sheet, { requestId: REQ, contractorId: "C-ASHAASHA" }, ENV, () => "J-FIXTURE1")).ok, true);
  const shown = await share(sheet);
  assert.deepEqual([shown.ok, shown.contractorName, shown.phone, shown.heldBack, shown.shares], [true, "Asha (fixture)", "+919000000011", null, 1]);
  assert.ok(!JSON.stringify(shown).includes("+919000000012"), "another bidder's number is never reachable");
  assert.equal((await share(sheet)).shares, 2);
  const rows = await shares(sheet);
  assert.deepEqual(rows.map((r) => [r.contractor_id, r.recorded_by]), [["C-ASHAASHA", "founder (admin login)"], ["C-ASHAASHA", "founder (admin login)"]]);
  assert.ok(!JSON.stringify(sheet.tabs.Jobs).includes("+919000000011"), "the number itself is not written to the history");
  await cancelJob(sheet, { requestId: REQ, reason: "The developer paused the work" }, ENV);
  assert.equal((await share(sheet)).error, "not_in_progress");
});

test("without the fixture switch, TEST records stay hidden and nothing is recorded (the live-Sheet rule is unchanged)", async () => {
  const sheet = buildFixtureSheet();
  await selectContractor(sheet, { requestId: REQ, contractorId: "C-ASHAASHA" }, ENV, () => "J-FIXTURE1");
  for (const flag of [false, undefined]) {
    const r = await share(sheet, { syntheticContactAllowed: flag });
    assert.deepEqual([r.ok, r.phone, r.heldBack], [true, null, "test_record"]);
  }
  assert.equal((await shares(sheet)).length, 0);
});

test("the admin action turns the fixture switch on only through fixturesEnabled(), which refuses production, Vercel and REAL data", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../app/admin/requests/[id]/job-actions.ts", import.meta.url), "utf8");
  assert.ok(src.includes("syntheticContactAllowed: fixturesEnabled()"));
  const { fixturesEnabled } = await import("../lib/fixtures.ts");
  for (const env of [{ CONTRACTOR_DESK_FIXTURES: "1", NODE_ENV: "production" }, { CONTRACTOR_DESK_FIXTURES: "1", NODE_ENV: "development", VERCEL: "1" }, { CONTRACTOR_DESK_FIXTURES: "1", NODE_ENV: "development", REGISTRATION_RECORD_TYPE: "REAL" }, { NODE_ENV: "development" }]) {
    assert.equal(fixturesEnabled(env), false, JSON.stringify(env));
  }
});
