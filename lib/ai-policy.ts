// When the app may use Gemini at all. Decided on the SERVER only.
//
// Our Gemini key is on Google's unpaid tier, where Google may use prompts to
// improve its products and human reviewers may read them. So until a proper
// arrangement exists, Gemini is used ONLY for the founder's own tests with
// made-up text, and never for anything real:
//
//   - It is OFF unless GEMINI_MODE=synthetic-tests is set on the server.
//   - Never when the server is handling REAL data (getRecordType() === "REAL").
//     That is decided by the server's environment, never by the browser.
//   - Reading a request description: only when the logged-in admin (the
//     founder) asks. Public visitors' descriptions are never sent, because the
//     server cannot tell whether a stranger typed made-up or real details.
//   - Drafting a message: only for TEST records, and only from the trade,
//     locality, start date and duration (never names, phones or notes).
// Everything else keeps working without Gemini: manual entry for requests, and
// the fixed template for messages.

import type { RecordType } from "./registration";

export const SYNTHETIC_TESTS = "synthetic-tests";

export type AiDecision =
  | { allowed: true }
  | { allowed: false; reason: "gemini_off" | "real_data" | "not_admin" };

export function geminiModeEnabled(mode: string | undefined): boolean {
  return (mode ?? "").trim().toLowerCase() === SYNTHETIC_TESTS;
}

export function decideRequestReading(input: {
  mode: string | undefined;
  recordType: RecordType;
  isAdmin: boolean;
}): AiDecision {
  if (!geminiModeEnabled(input.mode)) return { allowed: false, reason: "gemini_off" };
  if (input.recordType !== "TEST") return { allowed: false, reason: "real_data" };
  if (!input.isAdmin) return { allowed: false, reason: "not_admin" };
  return { allowed: true };
}

export function decideMessageDrafting(input: {
  mode: string | undefined;
  recordType: RecordType;
}): AiDecision {
  if (!geminiModeEnabled(input.mode)) return { allowed: false, reason: "gemini_off" };
  if (input.recordType !== "TEST") return { allowed: false, reason: "real_data" };
  return { allowed: true };
}
