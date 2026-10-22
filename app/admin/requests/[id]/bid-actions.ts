"use server";

import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin-auth";
import {
  cancelBidding,
  closeBidding,
  correctBid,
  createBidInvite,
  openBidding,
  reopenBidding,
  selectBidder,
  voidBid,
  type CorrectBidResult,
  type CreateBidInviteResult,
  type RoundResult,
  type SelectBidderResult,
} from "@/lib/bid-store";
import { SheetSetupError } from "@/lib/contractor-store";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { createRateLimiter, newId } from "@/lib/http";
import { linkBase } from "@/lib/links";
import { notifyOpportunities, type NotifyResult } from "@/lib/notify";
import { todayInIndia } from "@/lib/registration";
import { fixturesEnabled } from "@/lib/fixtures";
import { syncPairings } from "@/lib/telegram-pairing";
import { telegramToken } from "@/lib/telegram";

// Every action here starts with requireAdmin(): a visitor who is not logged in
// is sent to the login page and nothing is read or written. The record type
// (TEST or REAL), today's date and the time all come from the server, never
// from the browser. Logs hold a short label only: never IDs, prices, notes or
// links.

const tooOften = createRateLimiter(60, 10 * 60 * 1000);

export type BidFailure = { ok: false; error: "service_error" | "setup" | "too_many_requests" };
export type BidRoundActionResult = RoundResult | BidFailure;
export type BidCorrectionActionResult = CorrectBidResult | BidFailure;
export type SelectBidderActionResult = SelectBidderResult | BidFailure;
export type BidInviteActionResult =
  | { ok: true; link: string; expiresAt: string }
  | Extract<CreateBidInviteResult, { ok: false }>
  | BidFailure;

const env = () => ({ recordType: getRecordType(), today: todayInIndia() });

async function guarded<T>(label: string, work: () => Promise<T>): Promise<T | BidFailure> {
  await requireAdmin();
  if (tooOften("admin-bids")) return { ok: false, error: "too_many_requests" };
  try {
    return await work();
  } catch (error) {
    if (error instanceof SheetSetupError) {
      console.error(`[admin/bid] ${label} tab_not_set_up`);
      return { ok: false, error: "setup" };
    }
    console.error(`[admin/bid] ${label} failed`);
    return { ok: false, error: "service_error" };
  }
}

export async function openBiddingAction(requestId: unknown, deadline: unknown): Promise<BidRoundActionResult> {
  return guarded("open", () => openBidding(getContractorSheet(), { requestId, deadline }, env(), () => newId("E")));
}

export async function closeBiddingAction(requestId: unknown): Promise<BidRoundActionResult> {
  return guarded("close", () => closeBidding(getContractorSheet(), { requestId }, env(), () => newId("E")));
}

export async function reopenBiddingAction(requestId: unknown, reason: unknown, deadline: unknown): Promise<BidRoundActionResult> {
  return guarded("reopen", () => reopenBidding(getContractorSheet(), { requestId, reason, deadline }, env(), () => newId("E")));
}

export async function cancelBiddingAction(requestId: unknown, reason: unknown): Promise<BidRoundActionResult> {
  return guarded("cancel", () => cancelBidding(getContractorSheet(), { requestId, reason }, env(), () => newId("E")));
}

// Creates a bid invitation and returns the link ONCE. Only a digest is kept in
// the Sheet, so the link cannot be shown again. Nothing is sent to the
// contractor: the administrator passes the link on.
export async function createBidInviteAction(requestId: unknown, contractorId: unknown): Promise<BidInviteActionResult> {
  return guarded("invite", async () => {
    const made = await createBidInvite(getContractorSheet(), { requestId, contractorId }, env(), () => newId("I"));
    if (!made.ok) return made;
    // The address comes from this admin's own request. If it looks odd, give the
    // path alone rather than build a link from it.
    const link = `${linkBase((await headers()).get("host"))}/bid/${made.token}`;
    return { ok: true as const, link, expiresAt: made.expiresAt };
  });
}

// LIVE DEMO (fixture mode only): tells the chosen matched contractors about the
// job, each in the Telegram chat THEY connected, with their own ordinary private
// bid link (the same as "Create bid link"). Contractors who have not connected
// are reported as "Not connected" and get nothing. New Start presses are read
// first, so someone who just connected is included. Without a bot token the
// message comes back as a preview, marked as not sent.
export async function notifyViaTelegramAction(requestId: unknown, contractorIds: unknown): Promise<NotifyResult | BidFailure | { ok: false; error: "demo_only" }> {
  return guarded("notify", async () => {
    if (!fixturesEnabled()) return { ok: false as const, error: "demo_only" as const };
    const token = telegramToken();
    if (token) await syncPairings(getContractorSheet(), { token, recordType: getRecordType() });
    return notifyOpportunities(
      getContractorSheet(),
      { requestId, contractorIds },
      { ...env(), baseUrl: linkBase((await headers()).get("host")), token },
      () => newId("I"),
    );
  });
}

export async function selectBidderAction(requestId: unknown, bidId: unknown): Promise<SelectBidderActionResult> {
  return guarded("select", () => selectBidder(getContractorSheet(), { requestId, bidId }, env(), () => newId("J")));
}

export async function correctBidAction(
  requestId: unknown,
  bidId: unknown,
  input: unknown,
  reason: unknown,
): Promise<BidCorrectionActionResult> {
  return guarded("correct", () => correctBid(getContractorSheet(), { requestId, bidId, input, reason }, env()));
}

export async function voidBidAction(requestId: unknown, bidId: unknown, reason: unknown): Promise<BidCorrectionActionResult> {
  return guarded("void", () => voidBid(getContractorSheet(), { requestId, bidId, reason }, env()));
}
