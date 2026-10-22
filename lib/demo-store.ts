// Server-only state for the LIVE DEMO (fixture mode only): which contractor is
// connected to which Telegram chat, one-time pairing codes, and what happened to
// each notification. It is not in Google Sheets: it lives in this server's
// memory and, when `npm run demo` sets CONTRACTOR_DESK_FIXTURE_FILE, is saved
// with the made-up fixture data in a local, git-ignored file (see
// lib/fixtures.ts). Pairing codes are kept only as SHA-256 digests.

export type ChatLink = { chatId: string; telegramName: string; linkedAt: string };
export type Pairing = { contractorId: string; expiresAt: string; used: boolean };
export type NoticeLog = {
  status: "sent" | "failed" | "preview" | "not_connected" | "skipped";
  detail?: string; // an error or skip reason code, never message text
  at: string;
};
export type BidAlertLog = { status: "sent" | "failed" | "not_configured"; detail?: string; at: string };

export type DemoState = {
  links: Record<string, ChatLink>; // contractor id -> their own chat
  pairings: Record<string, Pairing>; // sha256(code) -> pairing
  lastUpdateId: number; // Telegram update already processed
  recentChats: { chatId: string; name: string }[]; // who pressed Start without a code (for setup only)
  notices: Record<string, NoticeLog>; // `${requestId}|${contractorId}` -> last notification
  bidAlerts: Record<string, BidAlertLog>; // bid id -> builder alert result
};

const KEY = "__contractorDeskDemoState";
const SAVE_KEY = "__contractorDeskDemoSave";

export function emptyDemoState(): DemoState {
  return { links: {}, pairings: {}, lastUpdateId: 0, recentChats: [], notices: {}, bidAlerts: {} };
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
