// Flexible start dates in contractor matching. All records are made up.
//
// The data model gives each contractor ONE start date ("available now", or
// "available from <date>"). So:
//   - a date on or before the requested date covers it (the contractor is
//     available from then on), including 1 or 2 days before;
//   - a date 1 or 2 days AFTER the requested date is kept, labelled
//     "Start date needs confirmation", and ranked below exact-date candidates;
//   - a date more than 2 days after is left out;
//   - trade, locality, consent and freshness are never relaxed.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as M from "../lib/match.ts";
import MatchResults from "../app/admin/requests/MatchResults.tsx";

const NOW = new Date("2026-10-21T10:00:00.000Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const V = M.ACCEPTED_CONSENT_VERSIONS[0];
const LABEL = "Start date needs confirmation";
let n = 0;
const C = (o = {}) => ({
  id: `C-${String(++n).padStart(8, "0")}`, recordType: "TEST", name: "Test Person", trade: "Masonry", serviceAreas: ["Baner"],
  availability: "from_date", earliestStart: "2026-10-26", consentVersion: V, consentTimestamp: daysAgo(2),
  availabilityReportedAt: daysAgo(2), lastConfirmedAt: "", deletionRequestedAt: "", ...o,
});
const REQ = {
  id: "R-FLEXTEST", recordType: "TEST", createdAt: daysAgo(0), developerName: "Dev", description: "Mason left the Baner site",
  trade: "Masonry", area: "Baner", startDate: "2026-10-26", durationDays: 7, notes: "", status: "New requirement",
};
const run = (cs, req = REQ, extra = {}) => M.matchContractors(req, cs, { envType: "TEST", now: NOW, ...extra });
const from = (earliestStart, o = {}) => C({ earliestStart, ...o });
const only = (r) => { assert.equal(r.candidates.length, 1, JSON.stringify(r.excluded)); return r.candidates[0]; };

// ----- 1. exact date -----
test("1. available on the exact requested date: top group, no label", () => {
  const c = only(run([from("2026-10-26")]));
  assert.deepEqual(c.startFit, { kind: "on_date", offsetDays: null, label: null });
  assert.ok(c.reasons.some((x) => x.includes("on or before the requested start of 26 Oct 2026")));
  assert.ok(!c.missing.some((x) => x.includes(LABEL)));
});

// ----- 2 & 4. earlier than requested -----
test("2. available one day before: covers the requested date, no label, noted in the reason", () => {
  const c = only(run([from("2026-10-25")]));
  assert.equal(c.startFit.kind, "on_date"); assert.equal(c.startFit.label, null);
  assert.ok(c.reasons.some((x) => x.includes("(1 day before)")), c.reasons.join(" | "));
});
test("4. available two days before: covers the requested date, no label, noted in the reason", () => {
  const c = only(run([from("2026-10-24")]));
  assert.equal(c.startFit.kind, "on_date"); assert.equal(c.startFit.label, null);
  assert.ok(c.reasons.some((x) => x.includes("(2 days before)")), c.reasons.join(" | "));
});
test("a long-available contractor ('from' a date well before the request) still matches, as before", () => {
  const c = only(run([from("2026-10-01")]));
  assert.equal(c.startFit.kind, "on_date");
});

// ----- 3 & 5. later than requested, inside the window -----
test("3. available one day after: kept, labelled 'Start date needs confirmation', never confirmed", () => {
  const r = run([from("2026-10-27")]);
  const c = only(r);
  assert.deepEqual(c.startFit, { kind: "near_date", offsetDays: 1, label: LABEL });
  assert.ok(c.reasons.some((x) => x.includes("1 day after the requested start of 26 Oct 2026")), c.reasons.join(" | "));
  assert.ok(c.missing.some((x) => x.startsWith(LABEL) && x.includes("until you confirm")), c.missing.join(" | "));
  assert.equal(r.needsStartConfirmationCount, 1);
});
test("5. available two days after: kept, labelled, two days late", () => {
  const c = only(run([from("2026-10-28")]));
  assert.deepEqual(c.startFit, { kind: "near_date", offsetDays: 2, label: LABEL });
  assert.ok(c.reasons.some((x) => x.includes("2 days after")), c.reasons.join(" | "));
});

// ----- 6. outside the window -----
test("6. more than two days after the requested date is left out and counted", () => {
  for (const d of ["2026-10-29", "2026-10-30", "2026-11-15", "2027-01-01"]) {
    const r = run([from(d)]);
    assert.equal(r.candidates.length, 0, d); assert.equal(r.excluded.starts_too_late, 1, d); assert.equal(r.eligibleCount, 0, d);
  }
  assert.ok(M.EXCLUSION_LABELS.starts_too_late.includes("2 days"));
});
test("the window is counted in calendar days across month ends and leap years", () => {
  const req = (startDate) => ({ ...REQ, startDate });
  assert.equal(only(run([from("2026-11-02")], req("2026-10-31"))).startFit.offsetDays, 2);
  assert.equal(run([from("2026-11-03")], req("2026-10-31")).excluded.starts_too_late, 1);
  assert.equal(only(run([from("2028-03-01")], req("2028-02-28"))).startFit.offsetDays, 2); // 2028 is a leap year
  assert.equal(only(run([from("2027-03-02")], req("2027-02-28"))).startFit.offsetDays, 2);
  assert.equal(run([from("2027-03-03")], req("2027-02-28")).excluded.starts_too_late, 1);
});

// ----- 7 & 8. trade and location are never relaxed -----
test("7. a trade mismatch is never rescued by date flexibility", () => {
  for (const d of ["2026-10-26", "2026-10-27", "2026-10-28"]) {
    const r = run([from(d, { trade: "Electrical" })]);
    assert.equal(r.candidates.length, 0, d); assert.equal(r.excluded.trade_mismatch, 1, d);
  }
});
test("8. a location mismatch is never rescued by date flexibility", () => {
  for (const d of ["2026-10-26", "2026-10-27", "2026-10-28"]) {
    const r = run([from(d, { serviceAreas: ["Wakad", "Kothrud"] })]);
    assert.equal(r.candidates.length, 0, d); assert.equal(r.excluded.area_mismatch, 1, d);
  }
});
test("freshness, consent and deletion rules still apply to near-date contractors", () => {
  assert.equal(run([from("2026-10-27", { availabilityReportedAt: daysAgo(15) })]).excluded.stale_availability, 1);
  assert.equal(run([from("2026-10-27", { consentTimestamp: "" })]).excluded.no_consent, 1);
  assert.equal(run([from("2026-10-27", { deletionRequestedAt: daysAgo(1) })]).excluded.deletion_requested, 1);
  assert.equal(run([from("2026-10-27", { availability: "unavailable" })]).excluded.unavailable, 1);
});

// ----- 9. missing or unconfirmed availability -----
test("9. 'from a date' with no usable date is kept only as 'Start date needs confirmation', never assumed", () => {
  for (const bad of ["", "tomorrow", "26/10/2026", "2026-02-31", "2026-13-01", "  "]) {
    const r = run([from(bad)]);
    const c = only(r);
    assert.deepEqual(c.startFit, { kind: "date_unknown", offsetDays: null, label: LABEL }, JSON.stringify(bad));
    assert.ok(c.missing.some((x) => x.startsWith(LABEL)), JSON.stringify(bad));
    assert.ok(!c.reasons.some((x) => x.includes("on or before the requested start")), JSON.stringify(bad));
    assert.ok(!c.reasons.some((x) => x.includes("2026-02-31") || x.includes("tomorrow")), "bad date echoed: " + bad);
    assert.equal(r.needsStartConfirmationCount, 1);
  }
});
test("9. 'available now' covers the date; unrecognised or missing availability is excluded", () => {
  assert.equal(only(run([C({ availability: "now", earliestStart: "" })])).startFit.kind, "on_date");
  const r = run([C({ availability: "" }), C({ availability: "maybe" }), C({ availability: "from_date ", earliestStart: "2026-10-26" })]);
  assert.equal(r.candidates.length, 0); assert.equal(r.excluded.unavailable, 3);
});
test("9. a request with no start date does not check timing, so nobody is labelled or dropped for it", () => {
  const noDate = { ...REQ, startDate: "" };
  const r = run([from("2026-10-26"), from("2027-06-01"), C({ availability: "now", earliestStart: "" })], noDate);
  assert.equal(r.candidates.length, 3); assert.equal(r.excluded.starts_too_late, 0);
  assert.ok(r.candidates.every((c) => c.startFit.kind === "not_checked" || c.startFit.kind === "on_date"));
  assert.ok(r.candidates.every((c) => c.startFit.label === null));
  assert.ok(r.candidates[0].missing.some((x) => x.includes("no start date")));
});

// ----- 10. priority and labelling -----
test("10. exact-date candidates come first, then 1 day late, then 2 days late, then unknown dates", () => {
  const cs = {
    near2: from("2026-10-28"), near1: from("2026-10-27"), unknown: from(""), exact: from("2026-10-26"),
    now: C({ availability: "now", earliestStart: "" }), before: from("2026-10-25"),
  };
  // make the late/unknown ones look BETTER on every other measure, to prove the date group wins
  cs.near2.lastConfirmedAt = daysAgo(0); cs.near1.lastConfirmedAt = daysAgo(0); cs.unknown.lastConfirmedAt = daysAgo(0);
  const r = run(Object.values(cs), REQ, { max: 10 }); // show all six: the normal limit is five
  const order = r.candidates.map((c) => c.contractorId);
  const rank = (c) => order.indexOf(c.id);
  const group0 = [cs.exact, cs.now, cs.before].map(rank);
  assert.ok(Math.max(...group0) < rank(cs.near1), "exact-date group must precede 1-day-late");
  assert.ok(rank(cs.near1) < rank(cs.near2), "1 day late must precede 2 days late");
  assert.ok(rank(cs.near2) < rank(cs.unknown), "2 days late must precede unknown dates");
  assert.equal(r.eligibleCount, 6); assert.equal(r.needsStartConfirmationCount, 3);
  const labelled = r.candidates.filter((c) => c.startFit.label).map((c) => c.contractorId).sort();
  assert.deepEqual(labelled, [cs.near1.id, cs.near2.id, cs.unknown.id].sort());
});
test("10. inside one date group the existing order still applies (founder-confirmed first)", () => {
  const a = from("2026-10-26"), b = from("2026-10-26", { lastConfirmedAt: daysAgo(1) }), x = from("2026-10-27"), y = from("2026-10-27", { lastConfirmedAt: daysAgo(1) });
  const ids = run([x, a, y, b]).candidates.map((c) => c.contractorId);
  assert.deepEqual(ids, [b.id, a.id, y.id, x.id]);
});
test("10. near-date candidates cannot crowd exact-date candidates out of the top five", () => {
  const nears = Array.from({ length: 6 }, () => from("2026-10-27", { lastConfirmedAt: daysAgo(0) }));
  const exact = from("2026-10-26");
  const r = run([...nears, exact]);
  assert.equal(r.candidates.length, 5); assert.equal(r.eligibleCount, 7);
  assert.equal(r.candidates[0].contractorId, exact.id);
  assert.equal(r.needsStartConfirmationCount, 6, "counts every eligible near-date candidate, not just the shown five");
});

// ----- never presented as confirmed (page) -----
const render = (result, req = REQ) => renderToStaticMarkup(createElement(MatchResults, { result, request: req }));
test("page: near-date candidates carry the label and are never shown as confirmed, even with a founder confirmation", () => {
  const html = render(run([from("2026-10-27", { lastConfirmedAt: daysAgo(1) })]));
  assert.ok(html.includes(LABEL));
  assert.ok(html.includes("not confirmed for the requested date"));
  assert.ok(!html.includes("Potential match — availability recorded as confirmed"), "near-date shown as confirmed");
  assert.ok(html.includes("Confirm it with them before relying on it"));
  assert.ok(html.includes("Ordered by start-date fit first"));
  assert.ok(!/\+91|\d{10}/.test(html), "phone-like data in page");
});
test("page: an exact-date candidate has no label and no flexible-date banner", () => {
  const html = render(run([from("2026-10-26"), C({ availability: "now", earliestStart: "" })]));
  assert.ok(!html.includes(LABEL)); assert.ok(!html.includes("Confirm it with them before relying on it"));
  assert.ok(html.includes("Potential match — availability not confirmed"));
});
test("page: left-out contractors are explained with the 2-day wording", () => {
  const html = render(run([from("2026-10-29")]));
  assert.ok(html.includes("cannot start within 2 days of the requested date"));
});

test("matching with flexible dates never changes the input records or exposes phone data", () => {
  const cs = [from("2026-10-27"), from("2026-10-26"), from("")];
  const before = JSON.stringify(cs);
  const r = run(cs);
  assert.equal(JSON.stringify(cs), before);
  assert.ok(!/phone|\+91|\d{10}/i.test(JSON.stringify(r)));
  assert.ok(!/verified|guarantee/i.test(JSON.stringify(r)));
});

// ----- the old contractor-level "last confirmed" date is general evidence only -----
test("a contractor-level 'last confirmed' date does not confirm a start date for any request", () => {
  const confirmedNear = from("2026-10-27", { lastConfirmedAt: daysAgo(0) });
  const plainExact = from("2026-10-26");
  const r = run([confirmedNear, plainExact]);
  const byId = Object.fromEntries(r.candidates.map((c) => [c.contractorId, c]));
  // still labelled, still counted as needing confirmation, still ranked below the exact-date contractor
  assert.equal(byId[confirmedNear.id].startFit.label, LABEL);
  assert.equal(r.needsStartConfirmationCount, 1);
  assert.deepEqual(r.candidates.map((c) => c.contractorId), [plainExact.id, confirmedNear.id]);
  // the same contractor is judged separately for a different request date
  const other = run([confirmedNear], { ...REQ, startDate: "2026-10-27" });
  assert.equal(other.candidates[0].startFit.kind, "on_date");
  const farther = run([confirmedNear], { ...REQ, startDate: "2026-10-24" });
  assert.equal(farther.candidates.length, 0, "a global confirmation never rescues a date that is too late");
});
