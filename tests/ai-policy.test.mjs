// The server-side rules for when Gemini may be used at all (lib/ai-policy.ts).
import test from "node:test";
import assert from "node:assert/strict";
import {
  decideMessageDrafting,
  decideRequestReading,
  geminiModeEnabled,
} from "../lib/ai-policy.ts";

const ON = "synthetic-tests";

test("Gemini mode is on only for the exact value synthetic-tests", () => {
  for (const mode of [ON, " synthetic-tests ", "SYNTHETIC-TESTS"]) assert.equal(geminiModeEnabled(mode), true, mode);
  for (const mode of [undefined, "", "on", "true", "1", "real", "synthetic", "synthetic-tests-please"]) {
    assert.equal(geminiModeEnabled(mode), false, String(mode));
  }
});

test("request reading: allowed only for the admin, in synthetic mode, on TEST data", () => {
  assert.deepEqual(decideRequestReading({ mode: ON, recordType: "TEST", isAdmin: true }), { allowed: true });
  assert.deepEqual(decideRequestReading({ mode: ON, recordType: "TEST", isAdmin: false }), { allowed: false, reason: "not_admin" });
  assert.deepEqual(decideRequestReading({ mode: ON, recordType: "REAL", isAdmin: true }), { allowed: false, reason: "real_data" });
  assert.deepEqual(decideRequestReading({ mode: undefined, recordType: "TEST", isAdmin: true }), { allowed: false, reason: "gemini_off" });
});

test("message drafting: allowed only in synthetic mode on TEST data", () => {
  assert.deepEqual(decideMessageDrafting({ mode: ON, recordType: "TEST" }), { allowed: true });
  assert.deepEqual(decideMessageDrafting({ mode: ON, recordType: "REAL" }), { allowed: false, reason: "real_data" });
  assert.deepEqual(decideMessageDrafting({ mode: "", recordType: "TEST" }), { allowed: false, reason: "gemini_off" });
});
