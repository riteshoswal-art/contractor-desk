// The one-time setup for the newer tabs: dry run by default, creates only what
// is missing, never touches existing tabs.
import test from "node:test";
import assert from "node:assert/strict";
import { applySetup, planSetup, REQUIRED_TABLES } from "../lib/sheet-setup.ts";
import { CONFIRMATION_TABLE } from "../lib/confirmation.ts";
import { LANGUAGE_TABLE } from "../lib/language-store.ts";
import { defineTable } from "../lib/tables.ts";
import { createSheet } from "../lib/google-sheets.ts";
import { makeSheet } from "./helpers/fakes.mjs";

const snapshot = (sheet) => JSON.stringify(sheet.tabs);

test("the newer tabs are the required tabs: Confirmations, Languages, Jobs, ReviewInvites, Reviews", () => {
  assert.deepEqual(REQUIRED_TABLES.map((t) => t.tab), ["Confirmations", "Languages", "Jobs", "ReviewInvites", "Reviews", "Bids", "BidInvites"]);
});

test("dry run: reports a missing tab and changes nothing", async () => {
  const sheet = makeSheet({});
  const before = snapshot(sheet);
  assert.deepEqual(await planSetup(sheet, [CONFIRMATION_TABLE]), [{ tab: "Confirmations", state: "missing" }]);
  assert.equal(snapshot(sheet), before);
  assert.equal(sheet.appended.length + sheet.updated.length, 0);
});

test("apply: creates the missing tab with exactly the expected headers", async () => {
  const sheet = makeSheet({});
  assert.deepEqual(await applySetup(sheet, [CONFIRMATION_TABLE]), [{ tab: "Confirmations", state: "created" }]);
  assert.deepEqual(sheet.tabs.Confirmations, [[...CONFIRMATION_TABLE.headers]]);
  // a second run finds it already set up and does nothing more
  const before = snapshot(sheet);
  assert.deepEqual(await applySetup(sheet, [CONFIRMATION_TABLE]), [{ tab: "Confirmations", state: "ok" }]);
  assert.equal(snapshot(sheet), before);
});

test("apply never edits the existing Contractors, Requests or Outcomes tabs", async () => {
  const sheet = makeSheet({});
  const before = JSON.stringify({ c: sheet.tabs.Contractors, r: sheet.tabs.Requests, o: sheet.tabs.Outcomes });
  await applySetup(sheet, [CONFIRMATION_TABLE]);
  assert.equal(JSON.stringify({ c: sheet.tabs.Contractors, r: sheet.tabs.Requests, o: sheet.tabs.Outcomes }), before);
  assert.ok(sheet.updated.every(([range]) => range.startsWith("Confirmations!")), JSON.stringify(sheet.updated));
  assert.equal(sheet.appended.length, 0);
});

test("a tab that exists with different headers is reported and left untouched", async () => {
  const wrong = defineTable("Confirmations", ["something", "else"]);
  const sheet = makeSheet({ tables: [wrong] });
  const before = snapshot(sheet);
  assert.deepEqual(await planSetup(sheet, [CONFIRMATION_TABLE]), [{ tab: "Confirmations", state: "header_mismatch" }]);
  assert.deepEqual(await applySetup(sheet, [CONFIRMATION_TABLE]), [{ tab: "Confirmations", state: "header_mismatch" }]);
  assert.equal(snapshot(sheet), before);
});

test("a tab with data in it is never overwritten", async () => {
  const sheet = makeSheet({ tables: [CONFIRMATION_TABLE] });
  sheet.tabs.Confirmations.push(["K-1", "TEST", "R-BBBBBBBB", "C-AAAAAAAA", "unavailable", "", "admin", "founder", "2026-10-21T10:00:00Z", ""]);
  const before = snapshot(sheet);
  assert.deepEqual(await applySetup(sheet, [CONFIRMATION_TABLE]), [{ tab: "Confirmations", state: "ok" }]);
  assert.equal(snapshot(sheet), before);
});

test("a Sheet connection that cannot list or add tabs fails clearly instead of guessing", async () => {
  const sheet = makeSheet({});
  delete sheet.listTabs;
  await assert.rejects(() => planSetup(sheet, [CONFIRMATION_TABLE]), /cannot list tabs/);
  const noAdd = makeSheet({});
  delete noAdd.addTab;
  await assert.rejects(() => applySetup(noAdd, [CONFIRMATION_TABLE]), /cannot add tabs/);
});

test("Google failures during setup are not swallowed", async () => {
  const sheet = makeSheet({ failWith: Object.assign(new Error("denied"), { status: 403 }) });
  await assert.rejects(() => planSetup(sheet, [CONFIRMATION_TABLE]), /denied/);
});

test("the real connection wrapper offers tab listing and adding only when the API supports them", async () => {
  const calls = [];
  const api = {
    batchGet: async () => ({ data: {} }), append: async () => ({}), update: async () => ({}),
    tabTitles: async () => ["Contractors"], addTab: async (_id, title) => { calls.push(title); return {}; },
  };
  const sheet = createSheet(api, "sheet-id", async () => {});
  assert.deepEqual(await sheet.listTabs(), ["Contractors"]);
  await sheet.addTab("Confirmations");
  assert.deepEqual(calls, ["Confirmations"]);
  const basic = createSheet({ batchGet: api.batchGet, append: api.append, update: api.update }, "sheet-id", async () => {});
  assert.equal(basic.listTabs, undefined);
  assert.equal(basic.addTab, undefined);
});

test("by default every required tab is created with its own headers, and a second run does nothing", async () => {
  const sheet = makeSheet({});
  const created = await applySetup(sheet);
  assert.deepEqual(created, REQUIRED_TABLES.map((t) => ({ tab: t.tab, state: "created" })));
  for (const t of REQUIRED_TABLES) assert.deepEqual(sheet.tabs[t.tab], [[...t.headers]], t.tab);
  assert.deepEqual(sheet.tabs.Languages, [[...LANGUAGE_TABLE.headers]]);
  const before = snapshot(sheet);
  assert.deepEqual((await applySetup(sheet)).map((i) => i.state), REQUIRED_TABLES.map(() => "ok"));
  assert.equal(snapshot(sheet), before);
});

test("only the missing tabs are created when some already exist", async () => {
  const sheet = makeSheet({ tables: [CONFIRMATION_TABLE] });
  const result = await applySetup(sheet);
  assert.deepEqual(result[0], { tab: "Confirmations", state: "ok" });
  assert.ok(result.slice(1).every((i) => i.state === "created"));
  assert.equal(result.length, REQUIRED_TABLES.length);
});
