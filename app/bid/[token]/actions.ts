"use server";

import { headers } from "next/headers";
import { submitBid, type SubmitBidResult } from "@/lib/bid-store";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { createRateLimiter, newId } from "@/lib/http";
import { alertBuilder } from "@/lib/bid-alert";
import { fixturesEnabled } from "@/lib/fixtures";
import { linkBase } from "@/lib/links";
import { telegramConfig } from "@/lib/telegram";

// A speed bump against guessing links and against hammering the Sheet. (The
// tokens themselves are 256-bit random values, so guessing is not realistic;
// this limit is only about cost and noise.) Addresses are never logged.
const tooOften = createRateLimiter(20, 10 * 60 * 1000);

export type BidActionResult = SubmitBidResult | { ok: false; error: "too_many_requests" | "unavailable_service" };

// The ONLY public way to save a bid. Nothing the browser sends decides which
// job or contractor the bid is for: the token does, and lib/bid-store.ts checks
// it again on every call. Failures are logged as short labels only: never the
// token, the price or the notes.
export async function submitBidAction(token: unknown, input: unknown, language: unknown): Promise<BidActionResult> {
  const forwarded = (await headers()).get("x-forwarded-for");
  const caller = forwarded?.split(",")[0]?.trim() || "unknown";
  if (tooOften(caller)) return { ok: false, error: "too_many_requests" };

  let result: SubmitBidResult;
  try {
    result = await submitBid(getContractorSheet(), { token, input, language }, { recordType: getRecordType() }, () => newId("B"));
  } catch {
    console.error("[bid] save_failed");
    return { ok: false, error: "unavailable_service" };
  }

  // Live demo only: tell the builder's Telegram chat about this NEW, saved bid.
  // It runs after the bid is safely stored, and whatever happens here, the
  // contractor's answer (and the bid) stays exactly as it is.
  if (result.ok && fixturesEnabled()) {
    try {
      const alert = await alertBuilder(
        getContractorSheet(),
        { bidId: result.bidId, provisional: result.provisional },
        { recordType: getRecordType(), telegram: telegramConfig(), baseUrl: linkBase((await headers()).get("host")) },
      );
      if (alert?.status === "failed") console.error(`[bid] builder_alert ${alert.detail ?? "failed"}`);
    } catch {
      console.error("[bid] builder_alert failed");
    }
  }
  return result;
}
