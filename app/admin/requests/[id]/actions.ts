"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { recordConfirmation, type RecordConfirmationResult } from "@/lib/confirmation-store";
import { SheetSetupError } from "@/lib/contractor-store";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { createRateLimiter, newId } from "@/lib/http";
import { todayInIndia } from "@/lib/registration";

const tooOften = createRateLimiter(60, 10 * 60 * 1000);

export type SaveConfirmationResult =
  | RecordConfirmationResult
  | { ok: false; error: "unavailable" | "setup" | "too_many_requests" };

// Records what the founder learned from a call or reply. The record type
// (TEST or REAL) and the date come from the server, never from the browser.
// Nothing here logs IDs, dates, notes or answers.
export async function saveConfirmationAction(input: unknown): Promise<SaveConfirmationResult> {
  await requireAdmin();
  if (tooOften("admin-confirmations")) return { ok: false, error: "too_many_requests" };
  if (typeof input !== "object" || input === null) return { ok: false, error: "invalid" };
  const raw = input as Record<string, unknown>;
  try {
    return await recordConfirmation(
      getContractorSheet(),
      {
        requestId: raw.requestId as string,
        contractorId: raw.contractorId as string,
        status: raw.status as string,
        confirmedStartDate: (raw.confirmedStartDate ?? "") as string,
        note: (raw.note ?? "") as string,
      },
      {
        recordType: getRecordType(),
        source: "admin",
        recordedBy: "founder (admin login)",
        today: todayInIndia(),
      },
      () => newId("K"),
    );
  } catch (error) {
    if (error instanceof SheetSetupError) {
      console.error("[admin/confirm] tab_not_set_up");
      return { ok: false, error: "setup" };
    }
    console.error("[admin/confirm] save_failed");
    return { ok: false, error: "unavailable" };
  }
}
