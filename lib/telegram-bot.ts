// Server-only: the bot listener for the LIVE DEMO (fixture mode only).
//
// Started once by instrumentation.ts when the demo server starts. It asks
// Telegram for new updates in a loop (long polling: each request waits up to 25
// seconds and returns as soon as someone writes or taps a button), and:
//   - links a chat when someone presses Start with a pairing code;
//   - passes typed amounts and button taps to lib/telegram-flow.ts;
//   - sends the bid summary to the builder when it is due.
// It only ever replies to chats that wrote to the bot. Nothing runs in tests or
// in production: it needs fixture mode and a bot token.
import { botListening, demoState, noteBotPoll, setBotListening, updateDemo } from "./demo-store";
import { fixturesEnabled } from "./fixtures";
import { getContractorSheet, getRecordType } from "./google-sheets";
import { newId } from "./http";
import { loadContractors } from "./records";
import { todayInIndia } from "./registration";
import { applyStart } from "./telegram-pairing";
import { fetchUpdates, founderChatId, sendToChat, telegramToken, type IncomingUpdates } from "./telegram";
import { handleMessage, handleTap, sendDueSummaries, type FlowEnv } from "./telegram-flow";

const WAIT_SECONDS = 25;

// One log line per update: what kind it was and what happened, e.g.
// "tap choose:already_matched R-4Y2B9Q8G". Never names, numbers, amounts or text.
const note = (label: string) => {
  if (process.env.NODE_ENV !== "test") console.log(`[telegram-bot] ${label}`);
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function flowEnv(token: string): FlowEnv {
  return { recordType: getRecordType(), today: todayInIndia(), token, founderChatId: founderChatId() || undefined, newId };
}

// Handles one batch of updates, in order. Exported for tests.
export async function processUpdates(updates: IncomingUpdates, env: FlowEnv): Promise<void> {
  const sheet = getContractorSheet();
  const contractors = await loadContractors(sheet);
  const nowMs = (env.now ?? new Date()).getTime();
  updateDemo((s) => {
    s.lastUpdateId = Math.max(s.lastUpdateId, updates.lastUpdateId);
  });
  for (const m of updates.messages) {
    try {
      const replies: { chatId: string; text: string }[] = [];
      updateDemo((s) => {
        const started = applyStart(s, m, contractors, env.recordType, nowMs);
        if (started) replies.push(started.reply);
      });
      if (replies[0]) {
        await sendToChat(env.token, replies[0].chatId, replies[0].text, env.fetchImpl);
        note("start:connected");
      } else note((await handleMessage(sheet, m, env)) ?? (m.text.startsWith("/start") ? "start:ignored" : "message:ignored"));
    } catch {
      console.error("[telegram-bot] message_failed");
    }
  }
  for (const t of updates.taps) {
    try {
      note(await handleTap(sheet, t, env));
    } catch {
      console.error("[telegram-bot] tap_failed");
    }
  }
}

export function startBotListener(): boolean {
  if (botListening() || !fixturesEnabled()) return false;
  const token = telegramToken();
  if (!token) return false;
  setBotListening(true);
  void (async () => {
    getContractorSheet(); // loads the saved demo data before anything reads it
    console.log("[telegram-bot] listening");
    let failures = 0;
    while (botListening()) {
      const got = await fetchUpdates(token, demoState().lastUpdateId + 1, WAIT_SECONDS);
      noteBotPoll(got.ok, got.ok ? "" : got.error);
      if (!got.ok) {
        failures += 1;
        if (failures === 1 || failures % 20 === 0) console.error(`[telegram-bot] poll_failed ${got.error}`);
        await pause(Math.min(30_000, 2_000 * failures));
      } else {
        failures = 0;
        await processUpdates(got, flowEnv(token));
      }
      try {
        await sendDueSummaries(getContractorSheet(), flowEnv(token));
      } catch {
        console.error("[telegram-bot] summary_failed");
      }
    }
  })();
  return true;
}
