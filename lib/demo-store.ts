// Server-only state for the LIVE DEMO (fixture mode only): which contractor is
// connected to which Telegram chat, one-time pairing codes, and what happened to
// each notification. It is not in Google Sheets: it lives in this server's
// memory and, when `npm run demo` sets CONTRACTOR_DESK_FIXTURE_FILE, is saved
// with the made-up fixture data in a local, git-ignored file (see
// lib/fixtures.ts). Pairing codes are kept only as SHA-256 digests.

export type ChatLink = { chatId: string; telegramName: string; linkedAt: string };
// A pairing code for a contractor (contractorId) or, with kind "builder", a builder (the id is in contractorId).
export type Pairing = { contractorId: string; expiresAt: string; used: boolean; kind?: "contractor" | "builder" };
export type NoticeLog = {
  status: "sent" | "failed" | "preview" | "not_connected" | "skipped";
  detail?: string; // an error or skip reason code, never message text
  at: string;
};
export type BidAlertLog = { status: "sent" | "failed" | "not_configured"; detail?: string; at: string };

// A builder (developer) who registered on the demo site. There are no full
// builder accounts: a random session cookie (kept here only as a digest) links
// the browser to this record.
export type Builder = { id: string; name: string; company: string; phone: string; createdAt: string };

// One contractor's Telegram conversation about one ticket.
//   asked            the job was sent with Yes / No buttons
//   declined         they tapped No
//   awaiting_amount  they tapped Yes; their next message is the amount
//   awaiting_unit    amount received; waiting for the unit button
//   awaiting_confirm amount and unit chosen; waiting for "Send bid" or "Change"
//   bid              the bid was saved through the normal bid rules
//   closed           the ticket was matched, or the conversation ended
export type Conversation = {
  id: string; // short code used in button data
  requestId: string;
  contractorId: string;
  chatId: string;
  bidToken: string; // the private bid link's token, held only on this server
  stage: "asked" | "declined" | "awaiting_amount" | "awaiting_unit" | "awaiting_confirm" | "bid" | "closed";
  amount: string;
  unit?: string; // the chosen rate unit, while waiting for confirmation
  bidId: string;
  askedAt: string;
  updatedAt: string;
};

// The bids sent to the builder for one ticket, with one "Choose" button each.
export type BidSummary = {
  id: string;
  requestId: string;
  sentAt: string;
  to: "builder" | "founder" | "nobody";
  options: { bidId: string; contractorId: string }[];
  chatId?: string; // where it was delivered, so an updated summary can retire its buttons
  messageId?: number;
};
export type Match = { requestId: string; bidId: string; contractorId: string; matchedAt: string };

export type DemoState = {
  links: Record<string, ChatLink>; // contractor id -> their own chat
  pairings: Record<string, Pairing>; // sha256(code) -> pairing
  lastUpdateId: number; // Telegram update already processed
  recentChats: { chatId: string; name: string }[]; // who pressed Start without a code (for setup only)
  notices: Record<string, NoticeLog>; // `${requestId}|${contractorId}` -> last notification
  bidAlerts: Record<string, BidAlertLog>; // bid id -> builder alert result
  builders: Record<string, Builder>;
  builderSessions: Record<string, string>; // sha256(session token) -> builder id
  builderLinks: Record<string, ChatLink>; // builder id -> their own chat
  ticketBuilder: Record<string, string>; // request id -> builder id
  conversations: Record<string, Conversation>; // conversation id -> conversation
  summaries: Record<string, BidSummary>; // request id -> what was sent to the builder
  matches: Record<string, Match>; // request id -> the match made from Telegram
};

const KEY = "__contractorDeskDemoState";
const SAVE_KEY = "__contractorDeskDemoSave";

export function emptyDemoState(): DemoState {
  return {
    links: {}, pairings: {}, lastUpdateId: 0, recentChats: [], notices: {}, bidAlerts: {},
    builders: {}, builderSessions: {}, builderLinks: {}, ticketBuilder: {}, conversations: {}, summaries: {}, matches: {},
  };
}

type Holder = Record<string, unknown>;
const holder = globalThis as unknown as Holder;

export function demoState(): DemoState {
  return (holder[KEY] ??= emptyDemoState()) as DemoState;
}

// Replaces the whole state (used when the fixture file is loaded, and by tests).
export function setDemoState(state: DemoState) {
  holder[KEY] = { ...emptyDemoState(), ...state };
}

// The fixture module registers how to save; until then changes stay in memory.
export function onDemoChange(save: (() => void) | null) {
  holder[SAVE_KEY] = save;
}

// Every change goes through here so it is saved straight away.
export function updateDemo(change: (s: DemoState) => void) {
  change(demoState());
  const save = holder[SAVE_KEY] as (() => void) | null | undefined;
  save?.();
}

// Whether the bot listener (lib/telegram-bot.ts) is running in this server.
// While it is, it is the ONLY reader of the bot's updates: Telegram allows one
// reader at a time, so the founder's "Check for new connections" steps aside.
const LISTENING_KEY = "__contractorDeskBotListening";
export const botListening = () => holder[LISTENING_KEY] === true;
export function setBotListening(on: boolean) {
  holder[LISTENING_KEY] = on;
}

// The listener's most recent contact with Telegram, for the admin page
// (in memory only: it describes this running server).
export type BotHealth = { lastOkAt: string; lastErrorAt: string; lastError: string; failuresInARow: number };
const HEALTH_KEY = "__contractorDeskBotHealth";
export const botHealth = (): BotHealth =>
  (holder[HEALTH_KEY] as BotHealth | undefined) ?? { lastOkAt: "", lastErrorAt: "", lastError: "", failuresInARow: 0 };
export function noteBotPoll(ok: boolean, error = "", now = new Date()) {
  const h = botHealth();
  holder[HEALTH_KEY] = ok
    ? { ...h, lastOkAt: now.toISOString(), failuresInARow: 0 }
    : { ...h, lastErrorAt: now.toISOString(), lastError: error, failuresInARow: h.failuresInARow + 1 };
}
