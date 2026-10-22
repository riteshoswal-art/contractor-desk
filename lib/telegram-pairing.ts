// Server-only: connecting a contractor's or a builder's OWN Telegram chat (live
// demo, fixture mode). Telegram lets a bot message someone only after they
// press Start, so:
//
//   1. the server makes a one-time pairing code for ONE contractor ID or ONE
//      builder ID (random, 30 minutes, kept only as a SHA-256 digest);
//   2. the person opens t.me/<bot>?start=<code> on their phone and presses
//      Start, which sends "/start <code>" to the bot;
//   3. the bot listener (lib/telegram-bot.ts), or the founder's "Check for new
//      connections" button, reads that message, checks the code, and links that
//      private chat to that ID. The code is then used up.
//
// Only private chats are linked. A code that is unknown, expired or already
// used is ignored, and nobody who sent it is messaged. A chat can belong to one
// contractor at a time; a contractor has one chat (the latest pairing wins). The
// same applies separately to builders.
import { createHash, randomBytes } from "node:crypto";
import type { ContractorSheet } from "./contractor-store";
import { botListening, demoState, updateDemo, type DemoState } from "./demo-store";
import type { ContractorRecord } from "./match";
import { loadContractors } from "./records";
import type { RecordType } from "./registration";
import { fetchMessages, sendToChat, type IncomingMessage, type SendError } from "./telegram";

export const PAIRING_MINUTES = 30;
const CODE = /^[A-Za-z0-9_-]{24}$/;
const digest = (code: string) => createHash("sha256").update(code, "utf8").digest("hex");

export function newPairingCode(id: string, now = new Date(), kind: "contractor" | "builder" = "contractor"): { code: string; expiresAt: string } {
  const code = randomBytes(18).toString("base64url"); // 24 characters, 144 bits
  const expiresAt = new Date(now.getTime() + PAIRING_MINUTES * 60_000).toISOString();
  updateDemo((s) => {
    // Drop expired codes so the store does not grow during a long session.
    for (const [k, p] of Object.entries(s.pairings)) if (Date.parse(p.expiresAt) < now.getTime() || p.used) delete s.pairings[k];
    s.pairings[digest(code)] = { contractorId: id, expiresAt, used: false, kind };
  });
  return { code, expiresAt };
}

export const pairingUrl = (username: string, code: string) => `https://t.me/${username}?start=${code}`;

export function linkedChat(contractorId: string) {
  return demoState().links[contractorId] ?? null;
}

export type Connected = { kind: "contractor" | "builder"; id: string; name: string };

// Applies one incoming message if it is a Start press. Must be called inside
// updateDemo(). Returns who was connected (and the reply to send), or null.
export function applyStart(
  s: DemoState,
  m: IncomingMessage,
  contractors: ContractorRecord[],
  recordType: RecordType,
  nowMs: number,
): { connected: Connected; reply: { chatId: string; text: string } } | null {
  if (m.chatType !== "private") return null;
  const match = /^\/start(?:\s+(\S+))?$/.exec(m.text.trim());
  if (!match) return null;
  const code = match[1] ?? "";
  if (!code) {
    // Plain Start (for example the founder setting up their own chat): remembered for setup only.
    s.recentChats = [{ chatId: m.chatId, name: m.firstName }, ...s.recentChats.filter((c) => c.chatId !== m.chatId)].slice(0, 10);
    return null;
  }
  if (!CODE.test(code)) return null;
  const pairing = s.pairings[digest(code)];
  if (!pairing || pairing.used || Date.parse(pairing.expiresAt) <= nowMs) return null;
  const linkedAt = new Date(nowMs).toISOString();

  if (pairing.kind === "builder") {
    const builder = s.builders[pairing.contractorId];
    if (!builder) return null;
    pairing.used = true;
    for (const [id, link] of Object.entries(s.builderLinks)) if (link.chatId === m.chatId && id !== builder.id) delete s.builderLinks[id];
    s.builderLinks[builder.id] = { chatId: m.chatId, telegramName: m.firstName, linkedAt };
    return {
      connected: { kind: "builder", id: builder.id, name: builder.name },
      reply: {
        chatId: m.chatId,
        text: `Contractor Desk\nConnected, ${builder.name}. When contractors send quotations for your tickets, the bids will arrive here and you can choose one with a tap.`,
      },
    };
  }

  const contractor = contractors.find((c) => c.id === pairing.contractorId && c.recordType === recordType);
  if (!contractor) return null;
  pairing.used = true;
  // One chat, one contractor: remove this chat from anyone else first.
  for (const [id, link] of Object.entries(s.links)) if (link.chatId === m.chatId && id !== contractor.id) delete s.links[id];
  s.links[contractor.id] = { chatId: m.chatId, telegramName: m.firstName, linkedAt };
  return {
    connected: { kind: "contractor", id: contractor.id, name: contractor.name },
    reply: {
      chatId: m.chatId,
      text: `Contractor Desk\nConnected. Job opportunities that match your registration as ${contractor.name || contractor.id} will arrive here. You can answer them with the buttons.`,
    },
  };
}

export type SyncResult =
  | { ok: true; connected: { contractorId: string; name: string }[]; confirmed: number }
  | { ok: false; error: SendError };

// Reads the bot's new messages once and applies valid pairings (the founder's
// "Check for new connections" button). A short "connected" reply goes only to a
// person who has just pressed Start with a valid code.
export async function syncPairings(
  sheet: ContractorSheet,
  env: { token: string; recordType: RecordType; now?: Date; fetchImpl?: Parameters<typeof fetchMessages>[2] },
): Promise<SyncResult> {
  // The bot listener already handles Start presses as they arrive.
  if (botListening()) return { ok: true, connected: [], confirmed: 0 };
  const got = await fetchMessages(env.token, demoState().lastUpdateId + 1, env.fetchImpl);
  if (!got.ok) return got;
  const nowMs = (env.now ?? new Date()).getTime();
  const contractors = await loadContractors(sheet);
  const connected: { contractorId: string; name: string }[] = [];
  const replies: { chatId: string; text: string }[] = [];

  updateDemo((s) => {
    s.lastUpdateId = Math.max(s.lastUpdateId, got.lastUpdateId);
    for (const m of got.messages) {
      const r = applyStart(s, m, contractors, env.recordType, nowMs);
      if (!r) continue;
      if (r.connected.kind === "contractor") connected.push({ contractorId: r.connected.id, name: r.connected.name });
      replies.push(r.reply);
    }
  });

  let confirmed = 0;
  for (const r of replies) if ((await sendToChat(env.token, r.chatId, r.text, env.fetchImpl)).ok) confirmed += 1;
  return { ok: true, connected, confirmed };
}
