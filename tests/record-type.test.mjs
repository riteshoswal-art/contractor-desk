import test from "node:test";
import assert from "node:assert/strict";
import * as M from "../lib/match.ts";
import { isRealMode, getRecordType } from "../lib/google-sheets.ts";

test("splitAreas: ';' separates areas; a comma stays inside one locality", () => {
  assert.deepEqual(M.splitAreas("Baner; Wakad"), ["Baner", "Wakad"]);
  assert.deepEqual(M.splitAreas("Hinjawadi, Phase 1"), ["Hinjawadi, Phase 1"]);
  assert.deepEqual(M.splitAreas("Baner;Wakad ; Kothrud"), ["Baner", "Wakad", "Kothrud"]);
  assert.deepEqual(M.splitAreas(""), []);
});
test("a locality containing a comma now matches a request for that locality", () => {
  const V = M.ACCEPTED_CONSENT_VERSIONS[0], now = new Date("2026-10-21T10:00:00Z"), iso = now.toISOString();
  const c = { id:"C-AAAAAAAA", recordType:"TEST", name:"R", trade:"Plumbing", serviceAreas:M.splitAreas("Hinjawadi, Phase 1"), availability:"now", earliestStart:"", consentVersion:V, consentTimestamp:iso, availabilityReportedAt:iso, lastConfirmedAt:"", deletionRequestedAt:"" };
  const req = { id:"R-BBBBBBBB", recordType:"TEST", createdAt:iso, developerName:"", description:"", trade:"Plumbing", area:"Hinjawadi, Phase 1", startDate:"", durationDays:null, notes:"", status:"" };
  assert.equal(M.matchContractors(req, [c], { envType:"TEST", now }).candidates.length, 1);
});
function withEnv(env, fn) {
  const keys = ["REGISTRATION_RECORD_TYPE", "NODE_ENV", "VERCEL_ENV"], saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { return fn(); } finally { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}
test("REAL mode only for: REAL setting + production build + (not on Vercel, or Vercel production)", () => {
  const R = "REAL", P = "production";
  assert.equal(withEnv({ REGISTRATION_RECORD_TYPE:R, NODE_ENV:P }, isRealMode), true);                          // self-hosted production
  assert.equal(withEnv({ REGISTRATION_RECORD_TYPE:R, NODE_ENV:P, VERCEL_ENV:"production" }, isRealMode), true);  // Vercel production
  assert.equal(withEnv({ REGISTRATION_RECORD_TYPE:R, NODE_ENV:P, VERCEL_ENV:"preview" }, isRealMode), false);    // Vercel preview: never REAL
  assert.equal(withEnv({ REGISTRATION_RECORD_TYPE:R, NODE_ENV:P, VERCEL_ENV:"development" }, isRealMode), false);
  assert.equal(withEnv({ REGISTRATION_RECORD_TYPE:R, NODE_ENV:"development" }, isRealMode), false);              // npm run dev
  assert.equal(withEnv({ REGISTRATION_RECORD_TYPE:R }, isRealMode), false);
  for (const v of [undefined, "", "TEST", "real", "true"]) assert.equal(withEnv({ REGISTRATION_RECORD_TYPE:v, NODE_ENV:P }, isRealMode), false, String(v));
  assert.equal(withEnv({ REGISTRATION_RECORD_TYPE:R, NODE_ENV:P, VERCEL_ENV:"preview" }, getRecordType), "TEST");
  assert.equal(withEnv({ REGISTRATION_RECORD_TYPE:R, NODE_ENV:P }, getRecordType), "REAL");
  assert.equal(withEnv({}, getRecordType), "TEST");
});
