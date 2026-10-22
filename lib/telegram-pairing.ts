// Server-only: connecting a contractor's OWN Telegram chat (live demo, fixture
// mode). Telegram lets a bot message someone only after they press Start, so:
//
//   1. the server makes a one-time pairing code for ONE contractor ID
//      (random, 30 minutes, kept only as a SHA-256 digest);
//   2. the contractor opens t.me/<bot>?start=<code> on their phone and presses
//      Start, which sends "/start <code>" to the bot;
//   3. when the founder clicks "Check for new connections" (or sends a job), the
//      server reads the bot's new messages, checks each code, and links that
//      private chat to that contractor ID. The code is then used up.
//
// Only private chats are linked. A code that is unknown, expired or already
// used is ignored, and nobody who sent it is messaged. A chat can belong to one
// contractor at a time; a contractor has one chat (the latest pairing wins).
import { createHash, randomBytes } from "node:crypto";
import type { ContractorSheet } from "./contractor-store";
import { demoState, updateDemo } from "./demo-store";
import { loadContractors } from "./records";
import type { RecordType } from "./registration";
import { fetchMessages, sendToChat, type SendError } from "./telegram";

export const PAIRING_MINUTES = 30;
const CODE = /^[A-Za-z0-9_-]{24}$/;
const digest = (code: string) => createHash("sha256").update(code, "utf8").digest("hex");

export function newPairingCode(contractorId: string, now = new Date()): { code: string; expiresAt: string } {
  const code = randomBytes(18).toString("base64url"); // 24 characters, 144 bits
  const expiresAt = new Date(now.getTime() + PAIRING_MINUTES * 60_000).toISOString();
  updateDemo((s) => {
    // Drop expired codes so the store does not grow during a long session.
    for (const [k, p] of Object.entries(s.pairings)) if (Date.parse(p.expiresAt) < now.getTime() || p.used) delete s.pairings[k];
    s.pairings[digest(code)] = { contractorId, expiresAt, used: false };
  });
  return { code, expiresAt };
}

export const pairingUrl = (username: string, code: string) => `https://t.me/${username}?start=${code}`;

export function linkedChat(contractorId: string) {
  return demoState().links[contractorId] ?? null;
}

export type SyncResult =
  | { ok: true; connected: { contractorId: string; name: string }[]; confirmed: number }
  | { ok: false; error: SendError };

// Reads the bot's new messages once and applies valid pairings. A short
// "connected" reply goes only to a person who has just pressed Start with a
// valid code (they started the conversation).
export async function syncPairings(
  sheet: ContractorSheet,
  env: { token: string; recordType: RecordType; now?: Date; fetchImpl?: Parameters<typeof fetchMessages>[2] },
): Promise<SyncResult> {
  const got = await fetchMessages(env.token, demoState().lastUpdateId + 1, env.fetchImpl);
  if (!got.ok) return got;
  const nowMs = (env.now ?? new Date()).getTime();
  const contractors = await loadContractors(sheet);
  const connected: { contractorId: string; name: string }[] = [];
  const replies: { chatId: string; text: string }[] = [];

  updateDemo((s) => {
    s.lastUpdateId = Math.max(s.lastUpdateId, got.lastUpdateId);
    for (const m of got.messages) {
      if (m.chatType !== "private") continue;
      const match = /^\/start(?:\s+(\S+))?$/.exec(m.text.trim());
      if (!match) continue;
      const code = match[1] ?? "";
      if (!code) {
        // Plain Start (for example the builder setting up their own chat): remembered for setup only.
        s.recentChats = [{ chatId: m.chatId, name: m.firstName }, ...s.recentChats.filter((c) => c.chatId !== m.chatId)].slice(0, 10);
        continue;
      }
      if (!CODE.test(code)) continue;
      const key = digest(code);
      const pairing = s.pairings[key];
      if (!pairing || pairing.used || Date.parse(pairing.expiresAt) <= nowMs) continue;
      const contractor = contractors.find((c) => c.id === pairing.contractorId && c.recordType === env.recordType);
      if (!contractor) continue;
      pairing.used = true;
      // One chat, one contractor: remove this chat from anyone else first.
      for (const [id, link] of Object.entries(s.links)) if (link.chatId === m.chatId && id !== contractor.id) delete s.links[id];
      s.links[contractor.id] = { chatId: m.chatId, telegramName: m.firstName, linkedAt: new Date(nowMs).toISOString() };
      connected.push({ contractorId: contractor.id, name: contractor.name });
      replies.push({
        chatId: m.chatId,
        text: `Contractor Desk (demo)\nConnected. Job opportunities that match your registration as ${contractor.name || contractor.id} will arrive here, each with your own private bid link.`,
      });
    }
  });

  let confirmed = 0;
  for (const r of replies) if ((await sendToChat(env.token, r.chatId, r.text, env.fetchImpl)).ok) confirmed += 1;
  return { ok: true, connected, confirmed };
}
