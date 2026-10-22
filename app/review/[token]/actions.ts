"use server";

import { headers } from "next/headers";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { createRateLimiter, newId } from "@/lib/http";
import { submitReview, type SubmitReviewResult } from "@/lib/review-store";

// A speed bump against guessing links and against hammering the Sheet. (The
// tokens themselves are 256-bit random values, so guessing is not realistic;
// this limit is only about cost and noise.) Addresses are never logged.
const tooOften = createRateLimiter(20, 10 * 60 * 1000);

export type ReviewActionResult =
  | SubmitReviewResult
  | { ok: false; error: "too_many_requests" | "unavailable_service" };

// The ONLY public way to save a review. Nothing the browser sends decides which
// job or contractor is reviewed: the token does, and lib/review-store.ts checks
// it again on every call. Failures are logged as short labels only: never the
// token, the scores or the comment.
export async function submitReviewAction(
  token: unknown,
  input: unknown,
  language: unknown,
): Promise<ReviewActionResult> {
  const forwarded = (await headers()).get("x-forwarded-for");
  const caller = forwarded?.split(",")[0]?.trim() || "unknown";
  if (tooOften(caller)) return { ok: false, error: "too_many_requests" };

  try {
    return await submitReview(
      getContractorSheet(),
      { token, input, language },
      { recordType: getRecordType() },
      () => newId("W"),
    );
  } catch {
    console.error("[review] save_failed");
    return { ok: false, error: "unavailable_service" };
  }
}
