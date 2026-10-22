"use server";

import { requireAdmin } from "@/lib/admin-auth";
import { botListening, demoState } from "@/lib/demo-store";
import { getRecordType } from "@/lib/google-sheets";
import { createRateLimiter } from "@/lib/http";
import { recentChats, sendDemoMessage, telegramConfig, type SendResult, type SendError } from "@/lib/telegram";

// Admin-only setup helpers for the Telegram DEMO channel. Each one runs only
// when the founder clicks its button. Logs hold a short label only: never the
// token, chat IDs or message text.

const tooOften = createRateLimiter(20, 10 * 60 * 1000);

export type TestSendResult = SendResult | { ok: false; error: "too_many_requests" };
export type ChatsResult =
  | { ok: true; chats: { chatId: string; name: string }[] }
  | { ok: false; error: SendError | "too_many_requests" | "no_token" };

export async function sendTelegramTestAction(): Promise<TestSendResult> {
  await requireAdmin();
  if (tooOften("telegram-admin")) return { ok: false, error: "too_many_requests" };
  const result = await sendDemoMessage(
    telegramConfig(),
    [
      "Contractor Desk · Test message",
      "Test message from the operator page. If you can read this, the Telegram connection works.",
      `Data mode on the server: ${getRecordType()}.`,
      "No contractor was contacted.",
    ].join("\n"),
  );
  if (!result.ok) console.error(`[admin/telegram] test_send ${result.error}`);
  return result;
}

// Lists the private chats that recently wrote to the bot (for example pressed
// Start), so the founder can copy their own chat ID into .env.local.
export async function findTelegramChatsAction(): Promise<ChatsResult> {
  await requireAdmin();
  if (tooOften("telegram-admin")) return { ok: false, error: "too_many_requests" };
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!token) return { ok: false, error: "no_token" };
  // While the bot listener runs it is the only reader of Telegram updates.
  if (botListening()) return { ok: true, chats: demoState().recentChats };
  const result = await recentChats(token);
  if (!result.ok) console.error(`[admin/telegram] find_chats ${result.error}`);
  // Start presses the demo has already read (they are no longer in Telegram's
  // queue) are remembered for this setup step too.
  const seen = demoState().recentChats;
  if (!result.ok) return seen.length ? { ok: true, chats: seen } : result;
  const merged = new Map([...seen, ...result.chats].map((c) => [c.chatId, c]));
  return { ok: true, chats: [...merged.values()] };
}
