"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { loadBidRows, openBidding } from "@/lib/bid-store";
import { foldRound } from "@/lib/bid";
import { SheetSetupError } from "@/lib/contractor-store";
import { fixturesEnabled } from "@/lib/fixtures";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { createRateLimiter, newId } from "@/lib/http";
import { loadContractors } from "@/lib/records";
import { todayInIndia } from "@/lib/registration";
import { parseRequestSubmission, validateRequest, type RequestErrors } from "@/lib/request";
import { saveRequest } from "@/lib/request-store";
import { botUsername, telegramToken, type SendError } from "@/lib/telegram";
import { newPairingCode, pairingUrl, syncPairings } from "@/lib/telegram-pairing";
import { notifyViaTelegramAction } from "../requests/[id]/bid-actions";

// The Builder Demo: the founder raises a job ticket ON THE BUILDER'S BEHALF
// (there are no builder accounts yet) and runs the live notification demo.
// Every action starts with requireAdmin(). Ticket creation uses the same
// validation and saving as the public request form. Telegram actions work only
// in the live demo (fixture mode). Logs hold short labels only.

const tooOften = createRateLimiter(60, 10 * 60 * 1000);
type Failure = { ok: false; error: "too_many_requests" | "service_error" | "setup" | "demo_only" };

async function guarded<T>(label: string, work: () => Promise<T>): Promise<T | Failure> {
  await requireAdmin();
  if (tooOften("admin-builder")) return { ok: false, error: "too_many_requests" };
  try {
    return await work();
  } catch (error) {
    console.error(`[admin/builder] ${label} ${error instanceof SheetSetupError ? "tab_not_set_up" : "failed"}`);
    return { ok: false, error: error instanceof SheetSetupError ? "setup" : "service_error" };
  }
}

export type TicketResult = { ok: true; id: string } | { ok: false; error: "validation"; errors: RequestErrors } | { ok: false; error: "invalid" } | Failure;

export async function createTicketAction(input: unknown): Promise<TicketResult> {
  return guarded("ticket", async () => {
    const parsed = parseRequestSubmission(input);
    if (!parsed) return { ok: false as const, error: "invalid" as const };
    const errors = validateRequest(parsed.values, todayInIndia());
    // Matching needs a date, so the demo ticket always has one.
    if (!parsed.values.startDate && !errors.startDate) errors.startDate = "Please choose the date the work must start.";
    if (Object.keys(errors).length > 0) return { ok: false as const, error: "validation" as const, errors };
    const id = newId("R");
    await saveRequest(getContractorSheet(), parsed.values, { id, recordType: getRecordType(), nowIso: new Date().toISOString() });
    return { ok: true as const, id };
  });
}

export type SyncResult = { ok: true; connected: { contractorId: string; name: string }[] } | { ok: false; error: SendError | "no_token" } | Failure;

// Reads new Start presses and links them to contractors. Explicit click only.
export async function syncConnectionsAction(): Promise<SyncResult> {
  return guarded("sync", async () => {
    if (!fixturesEnabled()) return { ok: false as const, error: "demo_only" as const };
    const token = telegramToken();
    if (!token) return { ok: false as const, error: "no_token" as const };
    const r = await syncPairings(getContractorSheet(), { token, recordType: getRecordType() });
    return r.ok ? { ok: true as const, connected: r.connected } : r;
  });
}

export type PairingResult = { ok: true; url: string; expiresAt: string; name: string } | { ok: false; error: "no_token" | "bot_unreachable" | "not_found" } | Failure;

// A one-time, 30-minute link for ONE existing contractor to connect their own
// Telegram (for contractors registered before Telegram was set up).
export async function pairingLinkAction(contractorId: unknown): Promise<PairingResult> {
  return guarded("pairing", async () => {
    if (!fixturesEnabled()) return { ok: false as const, error: "demo_only" as const };
    if (typeof contractorId !== "string" || !/^C-[A-Z2-9]{8}$/.test(contractorId)) return { ok: false as const, error: "not_found" as const };
    const contractor = (await loadContractors(getContractorSheet())).find((c) => c.id === contractorId && c.recordType === getRecordType());
    if (!contractor) return { ok: false as const, error: "not_found" as const };
    const token = telegramToken();
    if (!token) return { ok: false as const, error: "no_token" as const };
    const username = await botUsername(token);
    if (!username) return { ok: false as const, error: "bot_unreachable" as const };
    const made = newPairingCode(contractor.id);
    return { ok: true as const, url: pairingUrl(username, made.code), expiresAt: made.expiresAt, name: contractor.name };
  });
}

// Opens bidding if it has not been opened yet (recorded like any opening), then
// notifies the given matched contractors in their own connected chats.
export async function notifyMatchesAction(requestId: unknown, contractorIds: unknown) {
  const opened = await guarded("open", async () => {
    if (!fixturesEnabled()) return { ok: false as const, error: "demo_only" as const };
    if (typeof requestId !== "string") return { ok: false as const, error: "service_error" as const };
    const round = foldRound(await loadBidRows(getContractorSheet()), getRecordType(), requestId);
    if (round.state === "not_opened") {
      const r = await openBidding(getContractorSheet(), { requestId }, { recordType: getRecordType(), today: todayInIndia() }, () => newId("E"));
      if (!r.ok) return { ok: false as const, error: "service_error" as const };
    }
    return { ok: true as const };
  });
  if (!opened.ok) return opened;
  return notifyViaTelegramAction(requestId, contractorIds);
}
