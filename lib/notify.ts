// Server-only: telling matched contractors about a job, for the LIVE DEMO.
//
// It reuses the normal bidding code: each notification carries an ordinary
// private bid link from createBidInvite (one contractor, one request, expiring,
// stored only as a digest), so a bid goes through exactly the same checks as any
// other. Nothing here is a second bidding system.
//
// Who receives what:
//   - each contractor gets ONE private message, in the Telegram chat THEY
//     connected (lib/telegram-pairing.ts), containing only THEIR link;
//   - a contractor who has not connected Telegram is "Not connected": no link is
//     created and nothing is sent;
//   - nothing is ever sent to a group or to the builder's chat (the builder only
//     gets new-bid alerts, lib/bid-alert.ts);
//   - TEST records only. With REAL data nothing is created or sent.
//   - Without a bot token, a connected contractor's link is created and the exact
//     message is returned as a PREVIEW, clearly marked as not sent.
//   - A contractor notified in the last minute is skipped, so a double click does
//     not create a second link that would silently replace the first.
import { foldRound } from "./bid";
import { createBidInvite, loadBidRows } from "./bid-store";
import { findRequestAndCandidate } from "./confirmation-store";
import type { ContractorSheet } from "./contractor-store";
import { demoState, updateDemo } from "./demo-store";
import { formatDate } from "./match";
import type { RecordType } from "./registration";
import { sendToChat, type SendError } from "./telegram";

export const RESEND_GUARD_MS = 60_000;
export const MAX_PER_CLICK = 20;

export type NotifyItem = {
  contractorId: string;
  name: string;
  status: "sent" | "preview" | "failed" | "skipped" | "not_connected";
  reason?: "recently_sent" | "already_bid" | "not_candidate" | "unavailable" | "bidding_not_open" | "invalid" | "not_found";
  error?: SendError;
  link?: string; // shown once to the admin, like any new bid link
  expiresAt?: string;
  preview?: string; // the exact text, when it was not sent
  messageId?: number;
};

export type NotifyResult = { ok: true; items: NotifyItem[] } | { ok: false; error: "real_blocked" | "invalid" };

// Last successful send per request|contractor, in this server's memory only.
const lastSent = new Map<string, number>();
export function resetNotifyGuardForTests() {
  lastSent.clear();
}

export function composeOpportunity(args: {
  name: string;
  trade: string;
  area: string;
  startDate: string;
  durationDays: number | null;
  startNote: string;
  closesAt: string; // "" when bidding has no closing date
  link: string;
  expiresAt: string;
}): string {
  const lines = [
    "Contractor Desk · New job opportunity",
    `Hi ${args.name || "there"}, a job matches your registration.`,
    "",
    `${args.trade} in ${args.area}, Pune`,
    `Needed from ${args.startDate ? formatDate(args.startDate) : "a date to be agreed"}${args.durationDays ? ` · about ${args.durationDays} days` : ""}`,
  ];
  if (args.startNote) lines.push(args.startNote);
  if (args.closesAt) lines.push(`Bids close: ${formatDate(args.closesAt)} (end of day).`);
  lines.push(
    "",
    "Send your price with your private link (one bid only, it cannot be changed afterwards):",
    args.link,
    `This link is only for you and works until ${formatDate(args.expiresAt)}. Please do not forward it.`,
  );
  return lines.join("\n");
}

// Remembers the latest outcome per contractor, so the builder view can show it.
const note = (requestId: string, contractorId: string, status: NotifyItem["status"], detail: string | undefined, at: Date) =>
  updateDemo((s) => {
    s.notices[`${requestId}|${contractorId}`] = { status, detail, at: at.toISOString() };
  });

export async function notifyOpportunities(
  sheet: ContractorSheet,
  args: { requestId: unknown; contractorIds: unknown },
  env: {
    recordType: RecordType;
    today: string;
    now?: Date;
    baseUrl: string; // "" gives a path-only link
    token: string | null; // the bot token, or null when Telegram is not set up
    fetchImpl?: Parameters<typeof sendToChat>[3];
  },
  newInviteId: () => string,
): Promise<NotifyResult> {
  if (env.recordType !== "TEST") return { ok: false, error: "real_blocked" };
  if (typeof args.requestId !== "string" || !Array.isArray(args.contractorIds)) return { ok: false, error: "invalid" };
  const ids = [...new Set(args.contractorIds)];
  if (ids.length === 0 || ids.length > MAX_PER_CLICK || !ids.every((id) => typeof id === "string" && /^C-[A-Z2-9]{8}$/.test(id))) {
    return { ok: false, error: "invalid" };
  }
  const requestId = args.requestId;
  const now = env.now ?? new Date();
  const nowMs = now.getTime();
  const round = foldRound(await loadBidRows(sheet), env.recordType, requestId);
  const items: NotifyItem[] = [];
  const push = (item: NotifyItem) => {
    items.push(item);
    note(requestId, item.contractorId, item.status, item.reason ?? item.error, now);
  };

  for (const contractorId of ids as string[]) {
    const key = `${requestId}|${contractorId}`;
    const found = await findRequestAndCandidate(sheet, requestId, contractorId, env.recordType, env.now);
    const name = found?.candidate.name ?? "";
    if (!found) {
      push({ contractorId, name, status: "skipped", reason: "not_candidate" });
      continue;
    }
    if ((lastSent.get(key) ?? -Infinity) > nowMs - RESEND_GUARD_MS) {
      items.push({ contractorId, name, status: "skipped", reason: "recently_sent" }); // the earlier "sent" stays in the log
      continue;
    }
    const chat = demoState().links[contractorId];
    if (!chat) {
      push({ contractorId, name, status: "not_connected" });
      continue;
    }

    const made = await createBidInvite(sheet, { requestId, contractorId }, env, newInviteId);
    if (!made.ok) {
      push({ contractorId, name, status: "skipped", reason: made.error });
      continue;
    }
    const link = `${env.baseUrl}/bid/${made.token}`;
    const text = composeOpportunity({
      name,
      trade: found.request.trade,
      area: found.request.area,
      startDate: found.request.startDate,
      durationDays: found.request.durationDays,
      startNote:
        found.candidate.startFit.label !== null
          ? "Your stated start is after the requested date. Your bid will count only once the start date is confirmed with you."
          : "",
      closesAt: round.state === "open" ? round.closesAt : "",
      link,
      expiresAt: made.expiresAt,
    });

    if (!env.token) {
      push({ contractorId, name, status: "preview", error: "not_configured", link, expiresAt: made.expiresAt, preview: text });
      continue;
    }
    const sent = await sendToChat(env.token, chat.chatId, text, env.fetchImpl);
    if (sent.ok) {
      lastSent.set(key, nowMs);
      push({ contractorId, name, status: "sent", link, expiresAt: made.expiresAt, messageId: sent.messageId });
    } else {
      push({ contractorId, name, status: "failed", error: sent.error, link, expiresAt: made.expiresAt, preview: text });
    }
  }
  return { ok: true, items };
}
