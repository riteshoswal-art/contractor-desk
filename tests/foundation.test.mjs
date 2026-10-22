// The shared building blocks for the newer tabs: the table helper and the
// in-process lock.
import test from "node:test";
import assert from "node:assert/strict";
import { SheetSetupError } from "../lib/contractor-store.ts";
import { appendTableRow, colLetter, defineTable, readTable, withLock } from "../lib/tables.ts";
import { makeSheet } from "./helpers/fakes.mjs";

const T = defineTable("Things", ["thing_id", "name", "note"]);

test("colLetter handles columns past Z", () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(colLetter), ["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
});

test("tables: append then read back, in order", async () => {
  const sheet = makeSheet({ tables: [T] });
  await appendTableRow(sheet, T, { thing_id: "1", name: "a", note: "" });
  await appendTableRow(sheet, T, { thing_id: "2", name: "b", note: "x" });
  const rows = await readTable(sheet, T);
  assert.deepEqual(rows.map((r) => [r.thing_id, r.name, r.note]), [["1", "a", ""], ["2", "b", "x"]]);
});

test("tables: wrong headers or a missing tab are setup errors, and nothing is written", async () => {
  const wrong = makeSheet({ tables: [defineTable("Things", ["thing_id", "WRONG", "note"])] });
  await assert.rejects(() => readTable(wrong, T), SheetSetupError);
  await assert.rejects(() => appendTableRow(wrong, T, { thing_id: "1", name: "a", note: "" }), SheetSetupError);
  assert.equal(wrong.appended.length, 0);
  const missing = makeSheet({});
  await assert.rejects(() => readTable(missing, T), SheetSetupError);
});

test("tables: other failures are not disguised as setup problems", async () => {
  const down = makeSheet({ tables: [T], failWith: Object.assign(new Error("boom"), { status: 503 }) });
  await assert.rejects(() => readTable(down, T), (e) => !(e instanceof SheetSetupError));
});

test("tables: text that looks like a formula is neutralised", async () => {
  const sheet = makeSheet({ tables: [T] });
  await appendTableRow(sheet, T, { thing_id: "1", name: "=HYPERLINK(\"http://x\")", note: "+1" });
  const [r] = await readTable(sheet, T);
  assert.ok(r.name.startsWith("'=") && r.note.startsWith("'+"));
});

test("lock: work for the same key runs one at a time, in order; other keys are independent", async () => {
  const log = [];
  const slow = (name, ms) => async () => { log.push(`${name}:start`); await new Promise((r) => setTimeout(r, ms)); log.push(`${name}:end`); return name; };
  const results = await Promise.all([withLock("k", slow("a", 20)), withLock("k", slow("b", 1)), withLock("other", slow("c", 1))]);
  assert.deepEqual(results, ["a", "b", "c"]);
  assert.ok(log.indexOf("a:end") < log.indexOf("b:start"), log.join(" "));
});

test("lock: a failure does not block later work", async () => {
  await assert.rejects(() => withLock("f", async () => { throw new Error("x"); }));
  assert.equal(await withLock("f", async () => "fine"), "fine");
});
