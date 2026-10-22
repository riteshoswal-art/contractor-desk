"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { newId } from "@/lib/http";
import { recordOutcome, type RecordResult } from "@/lib/outcome-store";

export type SaveResult = RecordResult | { ok: false; error: "unavailable" };

// Saves what the founder reports. The record type (TEST or REAL) is decided by
// the server, never by the browser. Nothing here logs IDs, times or answers.
export async function saveOutcomeAction(input: unknown): Promise<SaveResult> {
  await requireAdmin();
  try {
    return await recordOutcome(
      getContractorSheet(),
      input,
      { recordType: getRecordType() },
      () => newId("O"),
    );
  } catch {
    console.error("[admin/outcome] save_failed");
    return { ok: false, error: "unavailable" };
  }
}
