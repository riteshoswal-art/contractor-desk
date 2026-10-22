// Server-only: the Telegram DEMONSTRATION channel. Telegram is used only to show
// the notification step in a local live demo. It is not the production
// messaging provider, and it never messages real contractors:
//
//   - every message goes to ONE chat the founder configures for the demo
//     (TELEGRAM_FOUNDER_CHAT_ID), never to a contractor's own account;
//   - it works only with TEST records (see lib/notify.ts);
//   - nothing is sent because a page loads: only an explicit admin click sends;
//   - the bot token is read from the server's environment, never sent to the
//     browser, never written to the Sheet, and never logged (the request URL
//     contains it, so errors are reduced to short labels before anything else
//     sees them);
//   - Telegram only lets a bot message someone who has pressed Start in the
//     bot first, so a "chat not found" or "can't initiate" answer is explained.

export type TelegramConfig =
  | { configured: true; token: string; chatId: string }
  | { configured: false; missing: ("TELEGRAM_BOT_TOKEN" | "TELEGRAM_FOUNDER_CHAT_ID")[]; invalid: ("TELEGRAM_BOT_TOKEN" | "TELEGRAM_FOUNDER_CHAT_ID")[] };

const TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,64}$/;
const CHAT_ID = /^\d{1,20}$/; // a private chat: digits only (no @usernames, no groups), so nothing is guessed

// The founder's own chat (bid summaries go there when a builder has not
// connected Telegram). TELEGRAM_DEMO_CHAT_ID is the older name, still accepted.
export function founderChatId(env: Record<string, string | undefined> = process.env): string {
  return (env.TELEGRAM_FOUNDER_CHAT_ID ?? env.TELEGRAM_DEMO_CHAT_ID ?? "").trim();
}

export function telegramConfig(env: Record<string, string | undefined> = process.env): TelegramConfig {
  const token = (env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const chatId = founderChatId(env);
  const missing: ("TELEGRAM_BOT_TOKEN" | "TELEGRAM_FOUNDER_CHAT_ID")[] = [];
  const invalid: ("TELEGRAM_BOT_TOKEN" | "TELEGRAM_FOUNDER_CHAT_ID")[] = [];
  if (!token) missing.push("TELEGRAM_BOT_TOKEN");
  else if (!TOKEN.test(token)) invalid.push("TELEGRAM_BOT_TOKEN");
  if (!chatId) missing.push("TELEGRAM_FOUNDER_CHAT_ID");
  else if (!CHAT_ID.test(chatId)) invalid.push("TELEGRAM_FOUNDER_CHAT_ID");
  if (missing.length || invalid.length) return { configured: false, missing, invalid };
  return { configured: true, token, chatId };
}

// What the admin page may know about the setup: never the token itself.
export function describeConfig(cfg: TelegramConfig): { configured: boolean; chatIdMasked: string; missing: string[]; invalid: string[] } {
  if (cfg.configured) return { configured: true, chatIdMasked: maskChatId(cfg.chatId), missing: [], invalid: [] };
  return { configured: false, chatIdMasked: "", missing: [...cfg.missing], invalid: [...cfg.invalid] };
}

export function maskChatId(id: string): string {
  const digits = id.replace(/^-/, "");
  return (id.startsWith("-") ? "-" : "") + (digits.length <= 4 ? "••" : `${"•".repeat(digits.length - 3)}${digits.slice(-3)}`);
}

export type SendError =
  | "not_configured" // token or chat id missing or malformed
  | "bad_token" // Telegram says the token is wrong
  | "start_required" // the demo account has not pressed Start in the bot, or blocked it
  | "chat_not_found" // the chat id does not exist for this bot
  | "rate_limited" // too many messages: try again shortly
  | "too_long" // the message is longer than Telegram allows
  | "network" // no answer from Telegram (offline, timeout)
  | "telegram_error" // any other refusal
  | "disabled_in_tests"; // the automated tests may never reach Telegram

export type SendResult = { ok: true; messageId: number } | { ok: false; error: SendError; retryAfter?: number };

export const SEND_ERROR_TEXT: Record<SendError, string> = {
  not_configured: "Telegram is not set up on this server yet, so nothing was sent.",
  bad_token: "Telegram rejected the bot token. Check TELEGRAM_BOT_TOKEN. Nothing was sent.",
  start_required: "The founder Telegram account has not started the bot (or has blocked it). Open the bot in Telegram, press Start, then try again. Nothing was sent.",
  chat_not_found: "Telegram does not know that chat for this bot. Check TELEGRAM_FOUNDER_CHAT_ID and that the account pressed Start. Nothing was sent.",
  rate_limited: "Telegram asked us to slow down. Wait a few seconds and try again. Nothing was sent.",
  too_long: "The message was too long for Telegram. Nothing was sent.",
  network: "Telegram could not be reached (no internet, or it took too long). Nothing was sent.",
  telegram_error: "Telegram refused the message. Nothing was sent.",
  disabled_in_tests: "Sending is disabled while the automated tests run.",
};

export const MAX_TEXT = 4096;
const TIMEOUT_MS = 10_000;

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  status: number;
  json(): Promise<unknown>;
}>;

function mapFailure(status: number, body: { description?: unknown; parameters?: { retry_after?: unknown } }): SendResult {
  const text = typeof body.description === "string" ? body.description.toLowerCase() : "";
  if (status === 401 || status === 404) return { ok: false, error: "bad_token" };
  if (status === 403) return { ok: false, error: "start_required" };
  if (status === 429) {
    const retry = Number(body.parameters?.retry_after);
    return { ok: false, error: "rate_limited", retryAfter: Number.isFinite(retry) ? retry : undefined };
  }
  if (text.includes("chat not found")) return { ok: false, error: "chat_not_found" };
  if (text.includes("message is too long")) return { ok: false, error: "too_long" };
  return { ok: false, error: "telegram_error" };
}

// Calls one Bot API method. The URL (which contains the token) never leaves
// this function, and no error object from fetch is passed on or logged.
async function call(cfg: { token: string }, method: string, payload: Record<string, unknown> | null, fetchImpl?: FetchLike, timeoutMs = TIMEOUT_MS): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const doFetch = fetchImpl ?? (process.env.NODE_ENV === "test" ? null : (globalThis.fetch as unknown as FetchLike));
  if (!doFetch) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(`https://api.telegram.org/bot${cfg.token}/${method}`, {
      method: payload ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });
    let body: Record<string, unknown> = {};
    try {
      const parsed = await res.json();
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch {
      // not JSON: treated as a refusal below
    }
    return { status: res.status, body };
  } catch {
    return { status: 0, body: {} };
  } finally {
    clearTimeout(timer);
  }
}

// The bot token on its own (contractor messages need only the token; the
// builder's alerts also need TELEGRAM_FOUNDER_CHAT_ID). null when missing or malformed.
export function telegramToken(env: Record<string, string | undefined> = process.env): string | null {
  const token = (env.TELEGRAM_BOT_TOKEN ?? "").trim();
  return TOKEN.test(token) ? token : null;
}

// Sends plain text (no formatting, so nothing in it can be misread as markup)
// to ONE chat. Callers decide which chat: the builder's demo chat, or the chat
// a contractor connected themselves (lib/telegram-pairing.ts). Never a group.
export async function sendToChat(token: string, chatId: string, text: string, fetchImpl?: FetchLike): Promise<SendResult> {
  if (!TOKEN.test(token) || !CHAT_ID.test(chatId)) return { ok: false, error: "not_configured" };
  if (text.length > MAX_TEXT) return { ok: false, error: "too_long" };
  const res = await call({ token }, "sendMessage", { chat_id: chatId, text, disable_web_page_preview: true }, fetchImpl);
  if (!res) return { ok: false, error: "disabled_in_tests" };
  if (res.status === 0) return { ok: false, error: "network" };
  const result = res.body.result as { message_id?: unknown } | undefined;
  if (res.status === 200 && res.body.ok === true && typeof result?.message_id === "number") return { ok: true, messageId: result.message_id };
  return mapFailure(res.status, res.body as { description?: unknown; parameters?: { retry_after?: unknown } });
}

// Sends to the builder's configured founder chat (TELEGRAM_FOUNDER_CHAT_ID) only.
export async function sendDemoMessage(cfg: TelegramConfig, text: string, fetchImpl?: FetchLike): Promise<SendResult> {
  if (!cfg.configured) return { ok: false, error: "not_configured" };
  return sendToChat(cfg.token, cfg.chatId, text, fetchImpl);
}

// The bot's public @username, needed for "t.me/<bot>?start=<code>" links.
// Cached per token for this server's life.
const usernames = new Map<string, string>();
export async function botUsername(token: string, fetchImpl?: FetchLike): Promise<string | null> {
  if (!TOKEN.test(token)) return null;
  const cached = usernames.get(token);
  if (cached) return cached;
  const res = await call({ token }, "getMe", null, fetchImpl);
  const result = res?.body.result as { username?: unknown } | undefined;
  if (!res || res.status !== 200 || res.body.ok !== true || typeof result?.username !== "string" || !/^[A-Za-z0-9_]{5,32}$/.test(result.username)) return null;
  usernames.set(token, result.username);
  return result.username;
}

// ---------------------------------------------------------------------------
// Buttons (inline keyboards) for the conversational demo
// ---------------------------------------------------------------------------

export type Button = { text: string; data: string }; // data: at most 64 bytes, our own short codes

// Sends plain text with tap-buttons under it to ONE private chat.
export async function sendWithButtons(token: string, chatId: string, text: string, rows: Button[][], fetchImpl?: FetchLike): Promise<SendResult> {
  if (!TOKEN.test(token) || !CHAT_ID.test(chatId)) return { ok: false, error: "not_configured" };
  if (text.length > MAX_TEXT) return { ok: false, error: "too_long" };
  if (rows.some((r) => r.some((b) => Buffer.byteLength(b.data, "utf8") > 64 || !b.text))) return { ok: false, error: "telegram_error" };
  const reply_markup = { inline_keyboard: rows.map((r) => r.map((b) => ({ text: b.text, callback_data: b.data }))) };
  const res = await call({ token }, "sendMessage", { chat_id: chatId, text, disable_web_page_preview: true, reply_markup }, fetchImpl);
  if (!res) return { ok: false, error: "disabled_in_tests" };
  if (res.status === 0) return { ok: false, error: "network" };
  const result = res.body.result as { message_id?: unknown } | undefined;
  if (res.status === 200 && res.body.ok === true && typeof result?.message_id === "number") return { ok: true, messageId: result.message_id };
  return mapFailure(res.status, res.body as { description?: unknown; parameters?: { retry_after?: unknown } });
}

// Stops the little spinner on a tapped button, optionally with a short notice.
export async function answerButton(token: string, callbackId: string, text: string, fetchImpl?: FetchLike): Promise<boolean> {
  if (!TOKEN.test(token) || !callbackId) return false;
  const res = await call({ token }, "answerCallbackQuery", { callback_query_id: callbackId, text: text.slice(0, 190) }, fetchImpl);
  return Boolean(res && res.status === 200 && res.body.ok === true);
}

// Removes the buttons from a message once it has been answered, so it cannot be tapped twice.
export async function removeButtons(token: string, chatId: string, messageId: number, fetchImpl?: FetchLike): Promise<boolean> {
  if (!TOKEN.test(token) || !CHAT_ID.test(chatId) || !Number.isInteger(messageId)) return false;
  const res = await call({ token }, "editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }, fetchImpl);
  return Boolean(res && res.status === 200 && res.body.ok === true);
}

export type IncomingTap = { updateId: number; callbackId: string; chatId: string; chatType: string; messageId: number; data: string; firstName: string };
export type IncomingUpdates = { messages: IncomingMessage[]; taps: IncomingTap[]; lastUpdateId: number };

// New messages AND button taps since `offset`. `waitSeconds` > 0 is Telegram's
// long polling: the call returns as soon as something arrives.
export async function fetchUpdates(
  token: string,
  offset: number,
  waitSeconds: number,
  fetchImpl?: FetchLike,
): Promise<({ ok: true } & IncomingUpdates) | { ok: false; error: SendError }> {
  if (!TOKEN.test(token)) return { ok: false, error: "not_configured" };
  const wait = Math.max(0, Math.min(50, Math.floor(waitSeconds)));
  const res = await call(
    { token },
    `getUpdates?offset=${Math.max(0, Math.floor(offset))}&limit=100&timeout=${wait}&allowed_updates=${encodeURIComponent('["message","callback_query"]')}`,
    null,
    fetchImpl,
    (wait + 10) * 1000,
  );
  if (!res) return { ok: false, error: "disabled_in_tests" };
  if (res.status === 0) return { ok: false, error: "network" };
  if (res.status !== 200 || res.body.ok !== true || !Array.isArray(res.body.result)) {
    const failed = mapFailure(res.status, res.body as { description?: unknown });
    return { ok: false, error: failed.ok ? "telegram_error" : failed.error };
  }
  let lastUpdateId = offset - 1;
  const messages: IncomingMessage[] = [];
  const taps: IncomingTap[] = [];
  type Chat = { id?: unknown; type?: unknown; first_name?: unknown };
  for (const u of res.body.result as {
    update_id?: unknown;
    message?: { text?: unknown; chat?: Chat };
    callback_query?: { id?: unknown; data?: unknown; from?: { first_name?: unknown }; message?: { message_id?: unknown; chat?: Chat } };
  }[]) {
    if (typeof u?.update_id !== "number") continue;
    lastUpdateId = Math.max(lastUpdateId, u.update_id);
    const chat = u.message?.chat;
    if (chat && typeof chat.id === "number") {
      messages.push({
        updateId: u.update_id,
        chatId: String(chat.id),
        chatType: typeof chat.type === "string" ? chat.type : "",
        firstName: typeof chat.first_name === "string" ? chat.first_name.slice(0, 40) : "",
        text: typeof u.message?.text === "string" ? u.message.text.slice(0, 200) : "",
      });
    }
    const cb = u.callback_query;
    const cbChat = cb?.message?.chat;
    if (cb && typeof cb.id === "string" && typeof cb.data === "string" && cbChat && typeof cbChat.id === "number" && typeof cb.message?.message_id === "number") {
      taps.push({
        updateId: u.update_id,
        callbackId: cb.id,
        chatId: String(cbChat.id),
        chatType: typeof cbChat.type === "string" ? cbChat.type : "",
        messageId: cb.message.message_id,
        data: cb.data.slice(0, 64),
        firstName: typeof cb.from?.first_name === "string" ? cb.from.first_name.slice(0, 40) : "",
      });
    }
  }
  return { ok: true, messages, taps, lastUpdateId };
}

export type IncomingMessage = { updateId: number; chatId: string; chatType: string; firstName: string; text: string };

// New messages people sent to the bot since `offset` (Telegram forgets the ones
// before it once we ask with a higher offset). Only what the pairing step needs.
export async function fetchMessages(
  token: string,
  offset: number,
  fetchImpl?: FetchLike,
): Promise<{ ok: true; messages: IncomingMessage[]; lastUpdateId: number } | { ok: false; error: SendError }> {
  if (!TOKEN.test(token)) return { ok: false, error: "not_configured" };
  const res = await call({ token }, `getUpdates?offset=${Math.max(0, Math.floor(offset))}&limit=100&timeout=0`, null, fetchImpl);
  if (!res) return { ok: false, error: "disabled_in_tests" };
  if (res.status === 0) return { ok: false, error: "network" };
  if (res.status !== 200 || res.body.ok !== true || !Array.isArray(res.body.result)) {
    const failed = mapFailure(res.status, res.body as { description?: unknown });
    return { ok: false, error: failed.ok ? "telegram_error" : failed.error };
  }
  let lastUpdateId = offset - 1;
  const messages: IncomingMessage[] = [];
  for (const u of res.body.result as { update_id?: unknown; message?: { text?: unknown; chat?: { id?: unknown; type?: unknown; first_name?: unknown } } }[]) {
    if (typeof u?.update_id === "number") lastUpdateId = Math.max(lastUpdateId, u.update_id);
    const chat = u?.message?.chat;
    if (typeof u?.update_id !== "number" || !chat || typeof chat.id !== "number") continue;
    messages.push({
      updateId: u.update_id,
      chatId: String(chat.id),
      chatType: typeof chat.type === "string" ? chat.type : "",
      firstName: typeof chat.first_name === "string" ? chat.first_name.slice(0, 40) : "",
      text: typeof u.message?.text === "string" ? u.message.text.slice(0, 200) : "",
    });
  }
  return { ok: true, messages, lastUpdateId };
}

// Setup helper: who has recently written to the bot (for example pressed
// Start), so the founder can copy their own chat ID into .env.local. Only the
// chat ID and first name are returned; nothing is stored.
export async function recentChats(
  token: string,
  fetchImpl?: FetchLike,
): Promise<{ ok: true; chats: { chatId: string; name: string }[] } | { ok: false; error: SendError }> {
  if (!TOKEN.test(token)) return { ok: false, error: "not_configured" };
  const res = await call({ token }, "getUpdates?limit=50&timeout=0", null, fetchImpl);
  if (!res) return { ok: false, error: "disabled_in_tests" };
  if (res.status === 0) return { ok: false, error: "network" };
  if (res.status !== 200 || res.body.ok !== true || !Array.isArray(res.body.result)) {
    const failed = mapFailure(res.status, res.body as { description?: unknown });
    return { ok: false, error: failed.ok ? "telegram_error" : failed.error };
  }
  const seen = new Map<string, string>();
  for (const update of res.body.result as { message?: { chat?: { id?: unknown; type?: unknown; first_name?: unknown } } }[]) {
    const chat = update?.message?.chat;
    if (!chat || chat.type !== "private" || typeof chat.id !== "number") continue;
    seen.set(String(chat.id), typeof chat.first_name === "string" ? chat.first_name.slice(0, 40) : "");
  }
  return { ok: true, chats: [...seen].map(([chatId, name]) => ({ chatId, name })) };
}
