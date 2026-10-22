// The Telegram DEMO channel and job notifications. Every Telegram call here goes
// to an in-memory fake: the tests can never reach the real Telegram API. All
// records are made up (the fixture sheet).
import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { buildFixtureSheet } from "../lib/fixtures.ts";
import { linkBase } from "../lib/links.ts";
import { resetNotifyGuardForTests } from "../lib/notify.ts";
import { describeConfig, maskChatId, recentChats, sendDemoMessage, telegramConfig, SEND_ERROR_TEXT } from "../lib/telegram.ts";
import { openBidding, loadBidInvites } from "../lib/bid-store.ts";
import { todayInIndia } from "../lib/registration.ts";
import { setContractorSheetForTests } from "../lib/google-sheets.ts";
import { resetRequestState, setCookie, setRequestHeader } from "./stubs/next-headers.mjs";

const TOKEN = "123456789:AAEsyntheticSYNTHETICsynthetic_token-0";
const CHAT = "987654321";
const CFG = { configured: true, token: TOKEN, chatId: CHAT };
const REQ = "R-FIXTURE2";
const ASHA = "C-ASHAASHA";

// A pretend Telegram. Records every call; answers as configured.
function fakeTelegram(answer = () => ({ status: 200, body: { ok: true, result: { message_id: 42 } } })) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const a = answer(calls.length);
    if (a === "throw") throw new Error(`connect failed for ${url}`);
    return { status: a.status, json: async () => { if (a.body === "notjson") throw new Error("bad json"); return a.body; } };
  };
  return { calls, fetchImpl };
}

let n = 0;
const LETTERS = "ABCDEFGHJK";
const nid = (p) => () => `${p}-${String(++n).split("").map((d) => LETTERS[Number(d)]).join("").padStart(8, "A")}`;
async function openWorld() {
  const sheet = buildFixtureSheet();
  assert.equal((await openBidding(sheet, { requestId: REQ }, { recordType: "TEST", today: todayInIndia() }, nid("E"))).ok, true);
  return sheet;
}

beforeEach(() => resetNotifyGuardForTests());

// ============================ configuration ============================
test("settings come only from the server environment; missing and malformed values are named, the token never is", () => {
  assert.deepEqual(telegramConfig({}), { configured: false, missing: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_FOUNDER_CHAT_ID"], invalid: [] });
  assert.deepEqual(telegramConfig({ TELEGRAM_BOT_TOKEN: "nope", TELEGRAM_DEMO_CHAT_ID: "@someone" }), { configured: false, missing: [], invalid: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_FOUNDER_CHAT_ID"] });
  assert.deepEqual(telegramConfig({ TELEGRAM_BOT_TOKEN: ` ${TOKEN} `, TELEGRAM_DEMO_CHAT_ID: ` ${CHAT}` }), CFG);
  const shown = describeConfig(telegramConfig({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_DEMO_CHAT_ID: CHAT }));
  assert.deepEqual(shown, { configured: true, chatIdMasked: "••••••321", missing: [], invalid: [] });
  assert.ok(!JSON.stringify(shown).includes(TOKEN) && !JSON.stringify(shown).includes(CHAT));
  assert.equal(maskChatId("-1001234"), "-••••234");
  assert.equal(maskChatId("12"), "••");
});

test("no source file or example settings file contains a bot token, and the token is never read in browser code", () => {
  const files = ["lib/telegram.ts", "lib/notify.ts", "app/admin/telegram/actions.ts", "app/admin/telegram/page.tsx", "app/admin/telegram/TelegramTools.tsx", "app/admin/requests/[id]/BidPanel.tsx", ".env.example", "lib/telegram-pairing.ts", "lib/bid-alert.ts", "lib/demo-store.ts", "app/admin/builder/actions.ts", "app/admin/builder/[id]/MatchesPanel.tsx", "app/admin/builder/[id]/page.tsx", "app/register/RegistrationForm.tsx", "app/bid/[token]/actions.ts", "scripts/demo.mjs"];
  for (const f of files) {
    const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.ok(!/\d{6,}:[A-Za-z0-9_-]{30,}/.test(src), `${f} contains something that looks like a bot token`);
  }
  for (const f of ["app/admin/telegram/TelegramTools.tsx", "app/admin/requests/[id]/BidPanel.tsx", "app/admin/builder/[id]/MatchesPanel.tsx", "app/admin/builder/[id]/LiveRefresh.tsx", "app/admin/builder/TicketForm.tsx", "app/register/RegistrationForm.tsx"]) {
    assert.ok(!/process\.env/.test(fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8")), `${f} reads the environment in the browser`);
  }
  assert.ok(/^TELEGRAM_BOT_TOKEN=$/m.test(fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8")), ".env.example lists the setting with no value");
});

// ============================ sending ============================
test("nothing is sent when Telegram is not set up, or when a message is too long", async () => {
  const t = fakeTelegram();
  assert.deepEqual(await sendDemoMessage({ configured: false, missing: ["TELEGRAM_BOT_TOKEN"], invalid: [] }, "hi", t.fetchImpl), { ok: false, error: "not_configured" });
  assert.deepEqual(await sendDemoMessage(CFG, "x".repeat(4097), t.fetchImpl), { ok: false, error: "too_long" });
  assert.equal(t.calls.length, 0);
});

test("a message goes only to the configured demo chat, as plain text, and the delivery ID is reported", async () => {
  const t = fakeTelegram();
  assert.deepEqual(await sendDemoMessage(CFG, "Hello <b>demo</b>", t.fetchImpl), { ok: true, messageId: 42 });
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].url, `https://api.telegram.org/bot${TOKEN}/sendMessage`);
  assert.deepEqual(t.calls[0].body, { chat_id: CHAT, text: "Hello <b>demo</b>", disable_web_page_preview: true });
  assert.equal("parse_mode" in t.calls[0].body, false, "plain text: nothing is read as markup");
});

test("every Telegram failure becomes a clear 'not sent' answer, and none of them leaks the token", async () => {
  const cases = [
    [{ status: 401, body: { ok: false, description: "Unauthorized" } }, "bad_token"],
    [{ status: 404, body: { ok: false, description: "Not Found" } }, "bad_token"],
    [{ status: 403, body: { ok: false, description: "Forbidden: bot can't initiate conversation with a user" } }, "start_required"],
    [{ status: 403, body: { ok: false, description: "Forbidden: bot was blocked by the user" } }, "start_required"],
    [{ status: 400, body: { ok: false, description: "Bad Request: chat not found" } }, "chat_not_found"],
    [{ status: 400, body: { ok: false, description: "Bad Request: message is too long" } }, "too_long"],
    [{ status: 400, body: { ok: false, description: "Bad Request: something else" } }, "telegram_error"],
    [{ status: 500, body: "notjson" }, "telegram_error"],
    [{ status: 200, body: { ok: true, result: {} } }, "telegram_error"],
    ["throw", "network"],
  ];
  for (const [answer, expected] of cases) {
    const t = fakeTelegram(() => answer);
    const r = await sendDemoMessage(CFG, "hi", t.fetchImpl);
    assert.equal(r.ok, false);
    assert.equal(r.error, expected, JSON.stringify(answer));
    assert.ok(!JSON.stringify(r).includes(TOKEN));
    assert.ok(SEND_ERROR_TEXT[r.error].includes("Nothing was sent"), r.error);
  }
  const limited = fakeTelegram(() => ({ status: 429, body: { ok: false, description: "Too Many Requests", parameters: { retry_after: 7 } } }));
  assert.deepEqual(await sendDemoMessage(CFG, "hi", limited.fetchImpl), { ok: false, error: "rate_limited", retryAfter: 7 });
});

test("while the automated tests run, the real Telegram can never be called", async () => {
  const saved = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("must not be called"); };
  try {
    assert.deepEqual(await sendDemoMessage(CFG, "hi"), { ok: false, error: "disabled_in_tests" });
    assert.deepEqual(await recentChats(TOKEN), { ok: false, error: "disabled_in_tests" });
  } finally {
    globalThis.fetch = saved;
  }
  assert.equal(called, false);
});

test("finding the demo chat ID lists only private chats, once each, with a first name and nothing else", async () => {
  const t = fakeTelegram(() => ({ status: 200, body: { ok: true, result: [
    { message: { chat: { id: 111, type: "private", first_name: "Founder", username: "secret_handle" }, text: "/start" } },
    { message: { chat: { id: 111, type: "private", first_name: "Founder" }, text: "hi" } },
    { message: { chat: { id: -100555, type: "group", title: "Some group" } } },
    { edited_message: { chat: { id: 222 } } },
    { message: { chat: { id: "x", type: "private" } } },
  ] } }));
  assert.deepEqual(await recentChats(TOKEN, t.fetchImpl), { ok: true, chats: [{ chatId: "111", name: "Founder" }] });
  assert.ok(t.calls[0].url.endsWith("/getUpdates?limit=50&timeout=0"));
  assert.deepEqual(await recentChats("not-a-token", t.fetchImpl), { ok: false, error: "not_configured" });
  const bad = fakeTelegram(() => ({ status: 401, body: { ok: false } }));
  assert.deepEqual(await recentChats(TOKEN, bad.fetchImpl), { ok: false, error: "bad_token" });
});

// ============================ links from another device ============================
test("links use http on this computer and on a private network (so a phone on the same Wi-Fi can open them), https elsewhere", () => {
  for (const h of ["localhost:3100", "127.0.0.1:3000", "192.168.1.20:3100", "10.182.58.53:3100", "172.20.1.4:3100", "laptop.local:3100"]) assert.equal(linkBase(h), `http://${h}`, h);
  for (const h of ["contractor-desk.example.com", "172.32.0.1", "11.0.0.1:80"]) assert.equal(linkBase(h), `https://${h}`, h);
  for (const h of ["evil.com/<script>", "", null, undefined, "a b"]) assert.equal(linkBase(h), "", String(h));
});

// ============================ admin-only ============================
const SECRET = "synthetic-secret-synthetic-secret-0123456789";
const adminCookie = () => { const e = String(Math.floor(Date.now() / 1000) + 3600); return `${e}.${createHmac("sha256", SECRET).update(`admin:${e}`).digest("base64url")}`; };
const redirectOf = async (fn) => { try { await fn(); } catch (error) { if (error?.redirectUrl) return error.redirectUrl; throw error; } return null; };

afterEach(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_DEMO_CHAT_ID;
  setContractorSheetForTests(null);
});

test("every Telegram action sends a visitor who is not logged in to the login page; nothing is created or sent", async () => {
  process.env.NODE_ENV = "test";
  process.env.ADMIN_PASSWORD = "synthetic-test-password";
  process.env.ADMIN_SESSION_SECRET = SECRET;
  resetRequestState();
  setRequestHeader("x-forwarded-for", "198.51.100.77");
  const sheet = await openWorld();
  setContractorSheetForTests(sheet);
  const bidActions = await import("../app/admin/requests/[id]/bid-actions.ts");
  const tgActions = await import("../app/admin/telegram/actions.ts");
  for (const call of [() => bidActions.notifyViaTelegramAction(REQ, [ASHA]), () => tgActions.sendTelegramTestAction(), () => tgActions.findTelegramChatsAction()]) {
    assert.equal(await redirectOf(call), "/admin/login");
  }
  assert.equal((await loadBidInvites(sheet, "TEST")).length, 0);

  setCookie("cd_admin", adminCookie());
  setRequestHeader("host", "192.168.1.20:3100");
  assert.deepEqual(await bidActions.notifyViaTelegramAction(REQ, [ASHA]), { ok: false, error: "demo_only" }, "outside the live demo nothing is created or sent");
  assert.equal((await loadBidInvites(sheet, "TEST")).length, 0);
  assert.deepEqual(await tgActions.sendTelegramTestAction(), { ok: false, error: "not_configured" });
  assert.deepEqual(await tgActions.findTelegramChatsAction(), { ok: false, error: "no_token" });
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  process.env.TELEGRAM_DEMO_CHAT_ID = CHAT;
  assert.deepEqual(await tgActions.sendTelegramTestAction(), { ok: false, error: "disabled_in_tests" }, "even when set up, the tests cannot send");
  resetRequestState();
});

test("the Telegram admin page is inside the admin guard and never prints the token", () => {
  const page = fs.readFileSync(new URL("../app/admin/telegram/page.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("<AdminShell>"));
  assert.ok(!/\{[^}]*TELEGRAM_BOT_TOKEN[^}]*\}/.test(page.replace(/Boolean\(\(process\.env\.TELEGRAM_BOT_TOKEN \?\? ""\)\.trim\(\)\)/, "")), "the token value is never rendered");
});

test("in the live demo, a link built from localhost uses the laptop's Wi-Fi address so a phone can open it; never elsewhere", () => {
  const demo = { CONTRACTOR_DESK_FIXTURES: "1", NODE_ENV: "development", CONTRACTOR_DESK_DEV_ORIGINS: "10.182.58.53,192.168.1.9" };
  assert.equal(linkBase("localhost:3100", demo), "http://10.182.58.53:3100");
  assert.equal(linkBase("127.0.0.1:3100", demo), "http://10.182.58.53:3100");
  assert.equal(linkBase("192.168.1.9:3100", demo), "http://192.168.1.9:3100", "an address already usable is kept");
  assert.equal(linkBase("localhost:3100", { ...demo, CONTRACTOR_DESK_DEV_ORIGINS: "8.8.8.8,not-an-ip" }), "http://localhost:3100", "only private addresses are ever substituted");
  for (const off of [{ ...demo, CONTRACTOR_DESK_FIXTURES: undefined }, { ...demo, NODE_ENV: "production" }, { ...demo, VERCEL: "1" }, {}]) {
    assert.equal(linkBase("localhost:3100", off), "http://localhost:3100", JSON.stringify(off));
  }
});
