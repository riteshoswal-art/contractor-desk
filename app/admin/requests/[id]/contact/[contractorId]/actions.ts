"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { decideMessageDrafting } from "@/lib/ai-policy";
import {
  createDraft,
  createLink,
  type ContactEnv,
  type DraftResult,
  type LinkResult,
} from "@/lib/contact";
import { draftContractorMessage } from "@/lib/gemini";
import { getContractorSheet, getRecordType, isRealMode } from "@/lib/google-sheets";
import { createRateLimiter } from "@/lib/http";

// Each draft costs a Gemini request, so drafting is rate limited.
const draftingTooOften = createRateLimiter(10, 10 * 60 * 1000);

export type ActionFailure = { ok: false; error: "unavailable" | "too_many_requests" };

function contactEnv(): ContactEnv {
  return {
    recordType: getRecordType(),
    testContactPhone: process.env.TEST_CONTACT_PHONE ?? "",
    // Real contractors can only be contacted from a production server that is
    // explicitly set to REAL data (same rule that decides the record type).
    realContactAllowed: isRealMode(),
    // Gemini drafts only in the founder's synthetic test mode, never for REAL
    // data (decided here on the server; see lib/ai-policy.ts).
    aiDrafting: decideMessageDrafting({
      mode: process.env.GEMINI_MODE,
      recordType: getRecordType(),
    }).allowed,
  };
}

// Never log messages, phone numbers or names. A short label only.
function failure(label: string): ActionFailure {
  console.error(`[admin/contact] ${label}`);
  return { ok: false, error: "unavailable" };
}

export async function draftAction(
  requestId: string,
  contractorId: string,
): Promise<DraftResult | ActionFailure> {
  await requireAdmin();
  if (draftingTooOften("admin-drafts")) {
    return { ok: false, error: "too_many_requests" };
  }
  try {
    return await createDraft(
      getContractorSheet(),
      String(requestId),
      String(contractorId),
      contactEnv(),
      draftContractorMessage,
    );
  } catch {
    return failure("draft_failed");
  }
}

export async function linkAction(
  requestId: string,
  contractorId: string,
  message: string,
  reviewed: boolean,
): Promise<LinkResult | ActionFailure> {
  await requireAdmin();
  try {
    return await createLink(
      getContractorSheet(),
      String(requestId),
      String(contractorId),
      message,
      reviewed,
      contactEnv(),
    );
  } catch {
    return failure("link_failed");
  }
}
