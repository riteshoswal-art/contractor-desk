// "Raise a request" must never lead to a missing page: outside the local data
// mode (on Vercel and in any production build) it is the request form, with the
// home page search's trade, locality and start date carried over safely.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { raiseRequestHref } from "../lib/fixtures.ts";
import { requestPrefill } from "../lib/request.ts";

test("outside the local data mode, Raise a request is the request form", () => {
  assert.equal(raiseRequestHref({}, false), "/request");
  assert.equal(raiseRequestHref({ trade: "Plumbing", area: "Baner", start: "2026-10-23" }, false), "/request?trade=Plumbing&area=Baner&start=2026-10-23");
  assert.equal(raiseRequestHref({ trade: "Plumbing" }, true), "/builder?trade=Plumbing");
});

test("only the trade, area and start are carried over", () => {
  assert.equal(raiseRequestHref({ trade: ["Masonry", "x"], evil: "1", start: "" }, false), "/request?trade=Masonry");
});

test("the request form prefill keeps only known choices and real dates", () => {
  assert.deepEqual(requestPrefill({ trade: "Plumbing", area: "Baner", start: "2026-10-23" }), { trade: "Plumbing", area: "Baner", startDate: "2026-10-23" });
  assert.deepEqual(requestPrefill({ trade: "<script>", area: "Nowhere", start: "2026-02-30" }), { trade: "", area: "", startDate: "" });
  assert.deepEqual(requestPrefill({}), { trade: "", area: "", startDate: "" });
  assert.deepEqual(requestPrefill({ trade: ["Electrical", "Masonry"] }), { trade: "Electrical", area: "", startDate: "" });
});

test("no page links straight to /builder; the builder page never shows a 404", () => {
  for (const file of ["app/SiteHeader.tsx", "app/page.tsx", "app/HomeSearch.tsx"]) {
    assert.ok(!/["'`]\/builder/.test(fs.readFileSync(file, "utf8")), `${file} links to /builder directly`);
  }
  const page = fs.readFileSync("app/builder/page.tsx", "utf8");
  assert.ok(!page.includes("notFound("), "the builder page must redirect, not 404");
  assert.ok(/redirect\(raiseRequestHref/.test(page));
  const config = fs.readFileSync("next.config.ts", "utf8");
  assert.ok(/source: "\/builder", destination: "\/request"/.test(config), "next.config.ts redirects /builder outside the local data mode");
});
