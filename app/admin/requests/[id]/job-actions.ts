"use server";

import { headers } from "next/headers";
import { requireAdmin } from "@/lib/admin-auth";
import { recordChosenBid } from "@/lib/bid-store";
import { SheetSetupError } from "@/lib/contractor-store";
import { getContractorSheet, getRecordType, isRealMode } from "@/lib/google-sheets";
import { createRateLimiter, newId } from "@/lib/http";
import { fixturesEnabled } from "@/lib/fixtures";
import { linkBase } from "@/lib/links";
import {
  cancelJob,
  changeContractor,
  completeJob,
  correctJob,
  selectContractor,
  shareContact,
  type JobResult,
  type ShareContactResult,
} from "@/lib/job-store";
import { todayInIndia } from "@/lib/registration";
import { createInvite, type CreateInviteResult } from "@/lib/review-store";

// Every action here starts with requireAdmin(): a visitor who is not logged in
// is sent to the login page and nothing is read or written. The record type
// (TEST or REAL) and today's date come from the server, never from the browser.
// Logs hold a short label only: never IDs, reasons, dates or links.

const tooOften = createRateLimiter(60, 10 * 60 * 1000);

// "service_error" = the Sheet or server failed. (It is not the same thing as a
// contractor being "unavailable", which is a normal answer from the job rules.)
export type Failure = { ok: false; error: "service_error" | "setup" | "too_many_requests" };
export type JobActionResult = JobResult | Failure;
export type InviteActionResult =
  | { ok: true; link: string; expiresAt: string }
  | Extract<CreateInviteResult, { ok: false }>
  | Failure;

const env = () => ({ recordType: getRecordType(), today: todayInIndia() });

async function guarded<T>(label: string, work: () => Promise<T>): Promise<T | Failure> {
  await requireAdmin();
  if (tooOften("admin-jobs")) return { ok: false, error: "too_many_requests" };
  try {
    return await work();
  } catch (error) {
    if (error instanceof SheetSetupError) {
      console.error(`[admin/job] ${label} tab_not_set_up`);
      return { ok: false, error: "setup" };
    }
    console.error(`[admin/job] ${label} failed`);
    return { ok: false, error: "service_error" };
  }
}

// After the contractor on a job is chosen or changed, the Bids tab is told which
// bid that was (when the contractor has one), so the audit trail matches the
// Jobs tab. The job is already saved either way; a failure here is only logged.
async function withBidMarker(work: () => Promise<JobResult>): Promise<JobResult> {
  const result = await work();
  if (result.ok) {
    const marker = await recordChosenBid(getContractorSheet(), { requestId: result.job.requestId }, env());
    if (marker === "failed") console.error("[admin/job] bid_marker failed");
  }
  return result;
}

export async function selectContractorAction(requestId: unknown, contractorId: unknown): Promise<JobActionResult> {
  return guarded("select", () => withBidMarker(() => selectContractor(getContractorSheet(), { requestId, contractorId }, env(), () => newId("J"))));
}

export async function changeContractorAction(requestId: unknown, contractorId: unknown, reason: unknown): Promise<JobActionResult> {
  return guarded("change", () => withBidMarker(() => changeContractor(getContractorSheet(), { requestId, contractorId, reason }, env())));
}

export async function completeJobAction(requestId: unknown, completionDate: unknown): Promise<JobActionResult> {
  return guarded("complete", () => completeJob(getContractorSheet(), { requestId, completionDate }, env()));
}

export async function cancelJobAction(requestId: unknown, reason: unknown): Promise<JobActionResult> {
  return guarded("cancel", () => cancelJob(getContractorSheet(), { requestId, reason }, env()));
}

export async function correctJobAction(
  requestId: unknown,
  status: unknown,
  completionDate: unknown,
  reason: unknown,
): Promise<JobActionResult> {
  return guarded("correct", () => correctJob(getContractorSheet(), { requestId, status, completionDate, reason }, env()));
}

// Creates a review invitation and returns the link ONCE. Only a digest is kept in
// the Sheet, so the link cannot be shown again. Nothing is sent to the
// developer: the founder passes the link on.
export async function createInviteAction(requestId: unknown): Promise<InviteActionResult> {
  return guarded("invite", async () => {
    const made = await createInvite(getContractorSheet(), { requestId }, { recordType: getRecordType() }, () => newId("V"));
    if (!made.ok) return made;
    // The address comes from this admin's own request. If it looks odd, give the
    // path alone rather than build a link from it.
    const link = `${linkBase((await headers()).get("host"))}/review/${made.token}`;
    return { ok: true as const, link, expiresAt: made.expiresAt };
  });
}

// Shows the chosen contractor's contact details to the signed-in admin so they
// can be passed to the developer by hand. Only for the contractor on this
// request's job, and each viewing is recorded. The number is returned to the
// admin's screen only: it is never logged, and nothing is sent.
export async function shareContactAction(requestId: unknown): Promise<ShareContactResult | Failure> {
  return guarded("share_contact", () => shareContact(getContractorSheet(), { requestId }, { ...env(), realContactAllowed: isRealMode(), syntheticContactAllowed: fixturesEnabled() }));
}
