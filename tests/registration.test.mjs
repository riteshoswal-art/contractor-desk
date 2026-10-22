import test from "node:test";
import assert from "node:assert/strict";
import { validate, emptyValues, isValidIndianMobile, CONSENT_TEXT } from "../lib/registration.ts";
const ok = { ...emptyValues, trade:"Masonry", area:"Baner", availability:"now", phone:"98765 43210", consent:true };
const T = "2026-10-21";
test("valid minimal", () => assert.deepEqual(validate(ok, T), {}));
test("empty form flags required fields", () => {
  const e = validate(emptyValues, T);
  for (const k of ["trade","area","availability","phone","consent"]) assert.ok(e[k], k);
  assert.equal(e.name, undefined);
});
test("phones", () => {
  for (const p of ["9876543210","+91 98765 43210","+919876543210","91-98765-43210"]) assert.ok(isValidIndianMobile(p), p);
  for (const p of ["5876543210","987654321","98765432101","+1 9876543210","abcdefghij","+9198765"]) assert.ok(!isValidIndianMobile(p), p);
});
test("date required only for from_date", () => {
  assert.equal(validate({ ...ok, availability:"unavailable", availabilityDate:"" }, T).availabilityDate, undefined);
  assert.ok(validate({ ...ok, availability:"from_date" }, T).availabilityDate);
});
test("date rules", () => {
  const f = (d) => validate({ ...ok, availability:"from_date", availabilityDate:d }, T).availabilityDate;
  assert.ok(f("2026-10-20")); assert.ok(f("2026-02-30")); assert.ok(f("garbage"));
  assert.equal(f("2026-10-21"), undefined); assert.equal(f("2027-01-05"), undefined);
});
test("other area", () => {
  assert.ok(validate({ ...ok, area:"Other", otherArea:"" }, T).otherArea);
  assert.ok(validate({ ...ok, area:"Other", otherArea:"<script>" }, T).otherArea);
  assert.equal(validate({ ...ok, area:"Other", otherArea:"Wagholi" }, T).otherArea, undefined);
});
test("bad trade/area values rejected", () => {
  assert.ok(validate({ ...ok, trade:"Welding" }, T).trade);
  assert.ok(validate({ ...ok, area:"Mumbai" }, T).area);
});
test("consent wording is exact", () => assert.equal(CONSENT_TEXT, "I agree that my contact details will be stored privately and may be shared with relevant developers for contractor work opportunities. I understand that I can request deletion of my details."));
