// Google allows about 60 Sheet reads a minute. The real Sheet connection shares
// identical reads for a few seconds (cleared by any write) and retries "too many
// requests" answers, so clicking around the operator pages never shows
// "Could not read the Sheet".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createSheet } from "../lib/google-sheets.ts";
import { captureErrors } from "./helpers/fakes.mjs";

function api({ failFirst = 0, status = 429 } = {}) {
  let n = 0;
  const calls = [];
  return {
    calls,
    async batchGet(p) {
      calls.push("read");
      if (n++ < failFirst) throw Object.assign(new Error("quota"), { code: status });
      return { data: { valueRanges: [{ values: [[`v${calls.length}`]] }] } };
    },
    async append() { calls.push("append"); return {}; },
    async update() { calls.push("update"); return {}; },
  };
}
const noPause = { pause: async () => {} };

test("identical reads within the cache window are shared", async () => {
  const a = api();
  const sheet = createSheet(a, "id", async () => {}, { readCacheMs: 5000, ...noPause });
  const [x, y] = await Promise.all([sheet.read(["Bids!A:Z"]), sheet.read(["Bids!A:Z"])]);
  const z = await sheet.read(["Bids!A:Z"]);
  assert.deepEqual(x, y);
  assert.deepEqual(z, x);
  assert.equal(a.calls.filter((c) => c === "read").length, 1);
  x[0][0][0] = "changed"; // callers get their own copy
  assert.equal((await sheet.read(["Bids!A:Z"]))[0][0][0], "v1");
});

test("a write clears the cache, so the next read is fresh", async () => {
  const a = api();
  const sheet = createSheet(a, "id", async () => {}, { readCacheMs: 5000, ...noPause });
  await sheet.read(["Bids!A:Z"]);
  await sheet.append("Bids!A:Z", ["x"]);
  await sheet.read(["Bids!A:Z"]);
  await sheet.update("Bids!A2:Z2", ["y"]);
  await sheet.read(["Bids!A:Z"]);
  assert.deepEqual(a.calls, ["read", "append", "read", "update", "read"]);
});

test("without a cache window every read goes to Google (tests and setup)", async () => {
  const a = api();
  const sheet = createSheet(a, "id", async () => {});
  await sheet.read(["A!1:1"]);
  await sheet.read(["A!1:1"]);
  assert.equal(a.calls.length, 2);
});

test("a 429 is retried and then succeeds", async () => {
  const a = api({ failFirst: 2 });
  const sheet = createSheet(a, "id", async () => {}, { retries: 3, ...noPause });
  const errors = captureErrors();
  try {
    assert.deepEqual(await sheet.read(["A!1:1"]), [[["v3"]]]);
  } finally {
    errors.restore();
  }
  assert.equal(a.calls.length, 3);
  assert.equal(errors.lines.length, 0, "a retried success logs nothing");
});

test("after the last retry the failure is logged and thrown, and not cached", async () => {
  const a = api({ failFirst: 10 });
  const sheet = createSheet(a, "id", async () => {}, { retries: 2, readCacheMs: 5000, ...noPause });
  const errors = captureErrors();
  try {
    await assert.rejects(sheet.read(["A!1:1"]));
  } finally {
    errors.restore();
  }
  assert.equal(a.calls.length, 3);
  assert.match(errors.lines.join("\n"), /sheets_request_failed status=429/);
});

test("other errors (for example 403) are not retried", async () => {
  const a = api({ failFirst: 1, status: 403 });
  const sheet = createSheet(a, "id", async () => {}, { retries: 3, ...noPause });
  const errors = captureErrors();
  try {
    await assert.rejects(sheet.read(["A!1:1"]));
  } finally {
    errors.restore();
  }
  assert.equal(a.calls.length, 1);
});

test("the real Sheet connection turns both protections on", () => {
  const src = fs.readFileSync("lib/google-sheets.ts", "utf8");
  assert.match(src, /LIVE_SHEET_OPTIONS: SheetOptions = \{ readCacheMs: 15_000, retries: 5 \}/);
  assert.equal(src.split("LIVE_SHEET_OPTIONS);").length - 1, 2, "both sign-in methods use it");
});

test("operator links do not pre-load pages in the background", () => {
  for (const f of ["app/admin/AdminNav.tsx", "app/admin/requests/page.tsx", "app/admin/reviews/page.tsx"]) {
    const s = fs.readFileSync(f, "utf8");
    const links = s.match(/<Link\b/g) ?? [];
    const off = s.match(/<Link prefetch=\{false\}/g) ?? [];
    assert.equal(off.length, links.length, f);
  }
});
