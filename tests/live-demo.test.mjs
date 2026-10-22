// The live builder-to-contractor demo, end to end, with a FAKE Telegram API.
// No test here can reach the real Telegram: every call goes to fakeTelegram().
// All records are made up (the fixture sheet plus synthetic registrations).
import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { alertBuilder, composeBidAlert } from "../lib/bid-alert.ts";
import { loadBids, openBidding, submitBid } from "../lib/bid-store.ts";
import { demoState, emptyDemoState, setDemoState } from "../lib/demo-store.ts";
import { buildFixtureSheet, fixtureSheet, loadSnapshot } from "../lib/fixtures.ts";
import { setContractorSheetForTests } from "../lib/google-sheets.ts";
import { selectContractor, shareContact } from "../lib/job-store.ts";
import { matchContractors } from "../lib/match.ts";
import { notifyOpportunities, resetNotifyGuardForTests } from "../lib/notify.ts";
import { loadContractors, loadRequests } from "../lib/records.ts";
import { todayInIndia } from "../lib/registration.ts";
import { newPairingCode, pairingUrl, syncPairings } from "../lib/telegram-pairing.ts";
import { botUsername } from "../lib/telegram.ts";
import { loadBidWorkspace } from "../app/admin/requests/[id]/bid-data.ts";
import { resetRequestState, setCookie, setRequestHeader } from "./stubs/next-headers.mjs";

const TOKEN = "123456789:AAEsyntheticSYNTHETICsynthetic_token-0";
const BUILDER_CHAT = "500000001";
const ASHA_CHAT = "600000001";
const BHIM_CHAT = "600000002";
const CFG = { configured: true, token: TOKEN, chatId: BUILDER_CHAT };
const REQ = "R-FIXTURE2";
const RAMESH = "C-PLMBRMSH";
const ASHA = "C-ASHAASHA", BHIM = "C-BHIMBHIM", CHITRA = "C-CHITRACH";
const ENV = { recordType: "TEST", today: todayInIndia() };

// A pretend Telegram. `updates` is what getUpdates returns next; sends are recorded.
function fakeTelegram({ sendStatus = 200, updates = [] } = {}) {
  const sent = [];
  let pending = updates;
  const fetchImpl = async (url, init) => {
    const method = url.split("/").pop().split("?")[0];
    if (method === "getMe") return { status: 200, json: async () => ({ ok: true, result: { username: "cd_demo_bot" } }) };
    if (method === "getUpdates") {
      const result = pending;
      pending = [];
      return { status: 200, json: async () => ({ ok: true, result }) };
    }
    const body = JSON.parse(init.body);
    sent.push(body);
    if (sendStatus !== 200) return { status: sendStatus, json: async () => ({ ok: false, description: sendStatus === 403 ? "Forbidden: bot was blocked by the user" : "Bad Request: chat not found" }) };
    return { status: 200, json: async () => ({ ok: true, result: { message_id: sent.length } }) };
  };
  return { sent, fetchImpl, queue: (u) => { pending = u; } };
}
const start = (updateId, chatId, text, type = "private") => ({ update_id: updateId, message: { text, chat: { id: Number(chatId), type, first_name: `Friend${chatId.slice(-1)}` } } });

let n = 0;
const nid = (p) => () => `${p}-${String(++n).split("").map((d) => "ABCDEFGHJK"[Number(d)]).join("").padStart(8, "A")}`;

beforeEach(() => {
  setDemoState(emptyDemoState());
  resetNotifyGuardForTests();
});

async function openSheet() {
  const sheet = buildFixtureSheet();
  assert.equal((await openBidding(sheet, { requestId: REQ }, ENV, nid("E"))).ok, true);
  return sheet;
}
async function pair(sheet, t, contractorId, chatId, updateId) {
  const { code } = newPairingCode(contractorId);
  t.queue([start(updateId, chatId, `/start ${code}`)]);
  return syncPairings(sheet, { token: TOKEN, recordType: "TEST", fetchImpl: t.fetchImpl });
}

// ============================ 1. the job ticket and matching ============================
test("a builder's ticket is matched by trade, locality and date; a different trade never matches; a 1-day-later start stays unconfirmed", async () => {
  const sheet = buildFixtureSheet();
  const [request] = await loadRequests(sheet);
  const result = matchContractors(request, await loadContractors(sheet), { envType: "TEST", max: 99 });
  const byId = Object.fromEntries(result.candidates.map((c) => [c.contractorId, c]));
  assert.deepEqual(Object.keys(byId).sort(), [ASHA, BHIM]);
  assert.equal(byId[ASHA].startFit.label, null);
  assert.equal(byId[BHIM].startFit.label, "Start date needs confirmation");
  assert.ok(byId[ASHA].reasons.some((r) => r.includes("Trade matches")) && byId[ASHA].reasons.some((r) => r.includes("Baner")));
});

// ============================ 2. pairing a contractor's own chat ============================
test("pairing: a one-time code links THAT contractor to the chat that pressed Start, and only they get a short confirmation", async () => {
  const sheet = buildFixtureSheet();
  const t = fakeTelegram();
  const { code, expiresAt } = newPairingCode(ASHA);
  assert.match(code, /^[A-Za-z0-9_-]{24}$/);
  assert.equal(Date.parse(expiresAt) - Date.now() <= 30 * 60_000, true);
  assert.equal(pairingUrl("cd_demo_bot", code), `https://t.me/cd_demo_bot?start=${code}`);
  assert.ok(!JSON.stringify(demoState()).includes(code), "only a digest of the code is kept");

  t.queue([start(10, ASHA_CHAT, `/start ${code}`)]);
  const r = await syncPairings(sheet, { token: TOKEN, recordType: "TEST", fetchImpl: t.fetchImpl });
  assert.deepEqual([r.ok, r.connected.map((c) => c.contractorId), r.confirmed], [true, [ASHA], 1]);
  assert.deepEqual(demoState().links[ASHA].chatId, ASHA_CHAT);
  assert.deepEqual(t.sent.map((m) => m.chat_id), [ASHA_CHAT]);
  assert.ok(t.sent[0].text.includes("Connected") && !t.sent[0].text.includes("/bid/"));
  assert.equal(demoState().lastUpdateId, 10);

  // the same code cannot be used again (for example by someone it was forwarded to)
  t.queue([start(11, BHIM_CHAT, `/start ${code}`)]);
  await syncPairings(sheet, { token: TOKEN, recordType: "TEST", fetchImpl: t.fetchImpl });
  assert.equal(demoState().links[ASHA].chatId, ASHA_CHAT);
  assert.equal(t.sent.length, 1, "nobody else was messaged");
});

test("pairing ignores unknown, expired and malformed codes, group chats, and plain messages; it never replies to them", async () => {
  const sheet = buildFixtureSheet();
  const t = fakeTelegram();
  const old = newPairingCode(ASHA, new Date(Date.now() - 31 * 60_000));
  const ok = newPairingCode(BHIM);
  t.queue([
    start(20, "700000001", `/start ${"x".repeat(24)}`),
    start(21, "700000002", `/start ${old.code}`),
    start(22, "700000003", "/start not-a-code"),
    start(23, "-1001234", `/start ${ok.code}`, "group"),
    start(24, "700000004", "hello"),
    start(25, BUILDER_CHAT, "/start"),
  ]);
  const r = await syncPairings(sheet, { token: TOKEN, recordType: "TEST", fetchImpl: t.fetchImpl });
  assert.deepEqual([r.ok, r.connected, t.sent.length], [true, [], 0]);
  assert.deepEqual(demoState().links, {});
  assert.deepEqual(demoState().recentChats.map((c) => c.chatId), [BUILDER_CHAT], "a plain Start is remembered only for the setup helper");
  assert.equal(demoState().lastUpdateId, 25, "processed messages are not read again");
});

test("one chat belongs to one contractor: pairing the same phone to another contractor moves it", async () => {
  const sheet = buildFixtureSheet();
  const t = fakeTelegram();
  await pair(sheet, t, ASHA, ASHA_CHAT, 30);
  await pair(sheet, t, BHIM, ASHA_CHAT, 31);
  assert.equal(demoState().links[ASHA], undefined);
  assert.equal(demoState().links[BHIM].chatId, ASHA_CHAT);
});

// ============================ 3. private notifications ============================
test("each connected, eligible contractor gets ONE private message with ONLY their own link; the unconnected and ineligible get nothing", async () => {
  const sheet = await openSheet();
  const t = fakeTelegram();
  await pair(sheet, t, ASHA, ASHA_CHAT, 40);
  t.sent.length = 0;
  const r = await notifyOpportunities(sheet, { requestId: REQ, contractorIds: [ASHA, BHIM, CHITRA] }, { ...ENV, baseUrl: "http://192.168.1.20:3100", token: TOKEN, fetchImpl: t.fetchImpl }, nid("I"));
  assert.deepEqual(r.items.map((i) => [i.contractorId, i.status, i.reason]), [[ASHA, "sent", undefined], [BHIM, "not_connected", undefined], [CHITRA, "skipped", "not_candidate"]]);
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent[0].chat_id, ASHA_CHAT, "only to Asha's own chat, never the builder's or a group");
  assert.ok(t.sent[0].text.includes(r.items[0].link) && r.items[0].link.startsWith("http://192.168.1.20:3100/bid/"));
  assert.ok(t.sent[0].text.includes("Masonry in Baner, Pune") && t.sent[0].text.includes("Hi Asha (fixture)"));
  assert.ok(!/\+91|9000000\d{3}|Fixture Developer|Bhim/.test(t.sent[0].text), "no phone numbers, builder details or other contractors");
  assert.equal(r.items[1].link, undefined, "no link is even created for someone who is not connected");
  assert.deepEqual(Object.keys(demoState().notices).sort(), [`${REQ}|${ASHA}`, `${REQ}|${BHIM}`, `${REQ}|${CHITRA}`]);
  assert.equal(demoState().notices[`${REQ}|${BHIM}`].status, "not_connected");

  // Bhim connects later and is notified with HIS link, and a near-date note
  await pair(sheet, t, BHIM, BHIM_CHAT, 41);
  t.sent.length = 0;
  const later = await notifyOpportunities(sheet, { requestId: REQ, contractorIds: [ASHA, BHIM] }, { ...ENV, baseUrl: "", token: TOKEN, fetchImpl: t.fetchImpl }, nid("I"));
  assert.deepEqual(later.items.map((i) => [i.contractorId, i.status, i.reason]), [[ASHA, "skipped", "recently_sent"], [BHIM, "sent", undefined]]);
  assert.deepEqual(t.sent.map((m) => m.chat_id), [BHIM_CHAT]);
  assert.ok(t.sent[0].text.includes("Your bid will count only once the start date is confirmed"));
  assert.ok(!t.sent[0].text.includes(r.items[0].link), "Asha's link never goes to Bhim");
});

test("a closing date, when bidding has one, is in the message", async () => {
  const sheet = buildFixtureSheet();
  const closing = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  await openBidding(sheet, { requestId: REQ, deadline: closing }, ENV, nid("E"));
  const t = fakeTelegram();
  await pair(sheet, t, ASHA, ASHA_CHAT, 45);
  t.sent.length = 0;
  await notifyOpportunities(sheet, { requestId: REQ, contractorIds: [ASHA] }, { ...ENV, baseUrl: "", token: TOKEN, fetchImpl: t.fetchImpl }, nid("I"));
  assert.match(t.sent[0].text, /Bids close: \d{2} [A-Z][a-z]{2} \d{4} \(end of day\)\./);
});

test("a contractor whose chat cannot be reached is reported as Failed with the reason; without a bot token it is a preview only", async () => {
  const sheet = await openSheet();
  const ok = fakeTelegram();
  await pair(sheet, ok, ASHA, ASHA_CHAT, 50);
  const blocked = fakeTelegram({ sendStatus: 403 });
  const r = await notifyOpportunities(sheet, { requestId: REQ, contractorIds: [ASHA] }, { ...ENV, baseUrl: "", token: TOKEN, fetchImpl: blocked.fetchImpl }, nid("I"));
  assert.deepEqual([r.items[0].status, r.items[0].error], ["failed", "start_required"]);
  const preview = await notifyOpportunities(sheet, { requestId: REQ, contractorIds: [ASHA] }, { ...ENV, baseUrl: "", token: null }, nid("I"));
  assert.deepEqual([preview.items[0].status, preview.items[0].error], ["preview", "not_configured"]);
  assert.ok(preview.items[0].preview.includes("/bid/"));
});

test("REAL data is never notified", async () => {
  const sheet = await openSheet();
  const t = fakeTelegram();
  assert.deepEqual(await notifyOpportunities(sheet, { requestId: REQ, contractorIds: [ASHA] }, { recordType: "REAL", today: ENV.today, baseUrl: "", token: TOKEN, fetchImpl: t.fetchImpl }, nid("I")), { ok: false, error: "real_blocked" });
  assert.equal(t.sent.length, 0);
});

// ============================ 4-7. bids and the builder's alert ============================
async function notifiedAsha(sheet) {
  const t = fakeTelegram();
  await pair(sheet, t, ASHA, ASHA_CHAT, 60);
  const r = await notifyOpportunities(sheet, { requestId: REQ, contractorIds: [ASHA] }, { ...ENV, baseUrl: "http://192.168.1.20:3100", token: TOKEN, fetchImpl: t.fetchImpl }, nid("I"));
  return r.items[0].link.split("/").pop();
}

test("a bid from the Telegram link goes through the normal checks, once; the builder gets ONE alert with the ticket, contractor, quote, status, time and link", async () => {
  const sheet = await openSheet();
  const token = await notifiedAsha(sheet);
  const saved = await submitBid(sheet, { token, input: { amount: "20", unit: "per_sqft" }, language: "en" }, { recordType: "TEST" }, nid("B"));
  assert.equal(saved.ok, true);
  const t = fakeTelegram();
  const env = { recordType: "TEST", telegram: CFG, baseUrl: "http://192.168.1.20:3100", fetchImpl: t.fetchImpl };
  const alert = await alertBuilder(sheet, { bidId: saved.bidId, provisional: saved.provisional }, env);
  assert.equal(alert.status, "sent");
  assert.equal(t.sent.length, 1);
  assert.equal(t.sent[0].chat_id, BUILDER_CHAT, "the builder's chat, not the contractor's");
  const text = t.sent[0].text;
  for (const s of ["New bid received", `Ticket: ${REQ} (Masonry in Baner)`, "Contractor: Asha (fixture)", "Quote: ₹20 per square foot", "Status: Received", "IST", "Bids so far on this ticket: 1", `http://192.168.1.20:3100/admin/builder/${REQ}`]) assert.ok(text.includes(s), s);
  assert.ok(!/\/bid\/|\+91|9000000\d{3}/.test(text), "no bid link and no phone number in the builder's alert");

  // the same bid is never alerted twice (a refresh, a retry, or a second server call)
  assert.equal(await alertBuilder(sheet, { bidId: saved.bidId, provisional: false }, env), null);
  assert.equal(t.sent.length, 1);
  // a duplicate submission is refused, so there is no new bid to alert about
  assert.deepEqual(await submitBid(sheet, { token, input: { amount: "1", unit: "per_day" }, language: "en" }, { recordType: "TEST" }, nid("B")), { ok: false, error: "already_bid" });
  assert.equal((await loadBids(sheet, "TEST")).length, 1);
});

test("a provisional bid is labelled as such in the builder's alert", () => {
  const text = composeBidAlert({ requestId: REQ, trade: "Masonry", area: "Baner", contractorName: "Bhim", price: "₹1,500 per day", provisional: true, receivedAt: new Date().toISOString(), bidCount: 2, link: "x" });
  assert.ok(text.includes("Status: Provisional — start date needs confirmation before this bid can be selected"));
});

test("if the builder's alert fails, the bid stays saved and the failure is recorded; with no builder chat set, it is 'not configured'", async () => {
  const sheet = await openSheet();
  const token = await notifiedAsha(sheet);
  const saved = await submitBid(sheet, { token, input: { amount: "20", unit: "per_sqft" }, language: "en" }, { recordType: "TEST" }, nid("B"));
  const failing = fakeTelegram({ sendStatus: 400 });
  const alert = await alertBuilder(sheet, { bidId: saved.bidId, provisional: false }, { recordType: "TEST", telegram: CFG, baseUrl: "", fetchImpl: failing.fetchImpl });
  assert.deepEqual([alert.status, alert.detail], ["failed", "chat_not_found"]);
  assert.equal((await loadBids(sheet, "TEST")).length, 1, "the bid is kept");
  assert.equal(demoState().bidAlerts[saved.bidId].status, "failed");

  setDemoState(emptyDemoState());
  const unset = await alertBuilder(sheet, { bidId: saved.bidId, provisional: false }, { recordType: "TEST", telegram: { configured: false, missing: ["TELEGRAM_DEMO_CHAT_ID"], invalid: [] }, baseUrl: "" });
  assert.equal(unset.status, "not_configured");
  assert.equal(await alertBuilder(sheet, { bidId: "B-NOPENOPE", provisional: false }, { recordType: "TEST", telegram: CFG, baseUrl: "" }), null, "no alert for a bid that does not exist");
});

// The real public bid action, in live-demo mode, with Telegram faked at the network level.
const SECRET = "synthetic-secret-synthetic-secret-0123456789";
test("through the real bid action: a valid new bid sends exactly one builder alert; an invalid or duplicate one sends none; a Telegram failure never loses the bid", async () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, F: process.env.CONTRACTOR_DESK_FIXTURES, T: process.env.TELEGRAM_BOT_TOKEN, C: process.env.TELEGRAM_DEMO_CHAT_ID, fetch: globalThis.fetch };
  const sent = [];
  let failNext = false;
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).startsWith(`https://api.telegram.org/bot${TOKEN}/`), "only the Telegram API is called");
    const body = init.body ? JSON.parse(init.body) : null;
    if (body) sent.push(body);
    if (failNext) return { status: 400, json: async () => ({ ok: false, description: "Bad Request: chat not found" }) };
    return { status: 200, json: async () => ({ ok: true, result: { message_id: sent.length } }) };
  };
  try {
    delete globalThis.__contractorDeskFixtureSheet;
    process.env.NODE_ENV = "test"; setContractorSheetForTests(null);
    process.env.NODE_ENV = "development";
    process.env.CONTRACTOR_DESK_FIXTURES = "1";
    process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    process.env.TELEGRAM_DEMO_CHAT_ID = BUILDER_CHAT;
    resetRequestState();
    setRequestHeader("x-forwarded-for", "198.51.100.200");
    setRequestHeader("host", "192.168.1.20:3100");
    const sheet = fixtureSheet();
    await openBidding(sheet, { requestId: REQ }, ENV, nid("E"));
    const t = fakeTelegram();
    await pair(sheet, t, ASHA, ASHA_CHAT, 70);
    await pair(sheet, t, BHIM, BHIM_CHAT, 71);
    const links = (await notifyOpportunities(sheet, { requestId: REQ, contractorIds: [ASHA, BHIM] }, { ...ENV, baseUrl: "", token: TOKEN, fetchImpl: t.fetchImpl }, nid("I"))).items.map((i) => i.link.split("/").pop());
    const { submitBidAction } = await import("../app/bid/[token]/actions.ts");

    assert.equal((await submitBidAction(links[0], { amount: "0", unit: "per_sqft" }, "en")).error, "validation");
    assert.equal(sent.length, 0, "an invalid bid: no alert");
    const ok = await submitBidAction(links[0], { amount: "20", unit: "per_sqft" }, "en");
    assert.equal(ok.ok, true);
    assert.equal(sent.length, 1, "one alert for one new bid");
    assert.equal(sent[0].chat_id, BUILDER_CHAT);
    assert.ok(sent[0].text.includes("http://192.168.1.20:3100/admin/builder/R-FIXTURE2"));
    assert.equal((await submitBidAction(links[0], { amount: "21", unit: "per_sqft" }, "en")).error, "already_bid");
    assert.equal(sent.length, 1, "a duplicate: no alert");

    failNext = true;
    const second = await submitBidAction(links[1], { amount: "1500", unit: "per_day" }, "en");
    assert.deepEqual([second.ok, second.provisional], [true, true], "the contractor still sees their bid saved");
    assert.equal((await loadBids(sheet, "TEST")).length, 2, "the bid was not rolled back");
    assert.equal(demoState().bidAlerts[second.bidId].status, "failed");
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [k, v] of [["NODE_ENV", saved.NODE_ENV], ["CONTRACTOR_DESK_FIXTURES", saved.F], ["TELEGRAM_BOT_TOKEN", saved.T], ["TELEGRAM_DEMO_CHAT_ID", saved.C]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    process.env.NODE_ENV = "test";
    delete globalThis.__contractorDeskFixtureSheet;
    setContractorSheetForTests(null);
    resetRequestState();
  }
});

// ============================ 8-9. the builder's view and contact privacy ============================
test("after bids arrive, the builder's comparison data shows them, keeps units apart, and holds back phone numbers until selection", async () => {
  const sheet = await openSheet();
  const t = fakeTelegram();
  await pair(sheet, t, ASHA, ASHA_CHAT, 80);
  await pair(sheet, t, BHIM, BHIM_CHAT, 81);
  const links = (await notifyOpportunities(sheet, { requestId: REQ, contractorIds: [ASHA, BHIM] }, { ...ENV, baseUrl: "", token: TOKEN, fetchImpl: t.fetchImpl }, nid("I"))).items.map((i) => i.link.split("/").pop());
  const [request] = await loadRequests(sheet);
  const before = await loadBidWorkspace(sheet, "TEST", request, await loadContractors(sheet), [], new Map());
  assert.equal(before.panel.groups.length, 0);
  await submitBid(sheet, { token: links[0], input: { amount: "20", unit: "per_sqft" }, language: "en" }, { recordType: "TEST" }, nid("B"));
  await submitBid(sheet, { token: links[1], input: { amount: "1500", unit: "per_day" }, language: "en" }, { recordType: "TEST" }, nid("B"));
  const after = await loadBidWorkspace(sheet, "TEST", request, await loadContractors(sheet), [], new Map());
  assert.deepEqual(after.panel.groups.map((g) => [g.unit, g.bids.map((b) => b.contractorId)]), [["per_sqft", [ASHA]], ["per_day", [BHIM]]]);
  assert.equal(after.panel.groups[1].bids[0].standing, "provisional", "the near-date bidder stays provisional");
  assert.ok(!/\+91|9000000\d{3}/.test(JSON.stringify(after)), "no phone numbers in the comparison");
  assert.equal((await shareContact(sheet, { requestId: REQ }, { ...ENV, realContactAllowed: false, syntheticContactAllowed: true })).error, "no_job", "nothing before selection");
  await selectContractor(sheet, { requestId: REQ, contractorId: ASHA }, ENV, nid("J"));
  assert.equal((await shareContact(sheet, { requestId: REQ }, { ...ENV, realContactAllowed: false, syntheticContactAllowed: true })).phone, "+919000000011");
});

test("the ticket view refreshes itself by READING only, and never sends anything on page load", () => {
  const refresh = fs.readFileSync(new URL("../app/admin/builder/[id]/LiveRefresh.tsx", import.meta.url), "utf8");
  assert.ok(refresh.includes("router.refresh()") && refresh.includes("document.hidden"));
  assert.ok(!/actions|fetch\(|sendTo|notify/.test(refresh.replace(/\/\/.*$/gm, "")), "the refresher calls no action");
  const page = fs.readFileSync(new URL("../app/admin/builder/[id]/page.tsx", import.meta.url), "utf8");
  assert.ok(page.includes("<LiveRefresh") && page.includes("<BidPanel") && page.includes("<JobPanel") && page.includes("<AdminShell>"));
  assert.ok(!/sendToChat|sendDemoMessage|notifyOpportunities|syncPairings|alertBuilder\(/.test(page), "loading the page sends nothing");
});

// ============================ builder actions are admin-only ============================
const adminCookie = () => { const e = String(Math.floor(Date.now() / 1000) + 3600); return `${e}.${createHmac("sha256", SECRET).update(`admin:${e}`).digest("base64url")}`; };
const redirectOf = async (fn) => { try { await fn(); } catch (error) { if (error?.redirectUrl) return error.redirectUrl; throw error; } return null; };

test("every Builder Demo action needs the admin login; a ticket uses the normal request rules and needs a start date", async () => {
  process.env.NODE_ENV = "test";
  process.env.ADMIN_PASSWORD = "synthetic-test-password";
  process.env.ADMIN_SESSION_SECRET = SECRET;
  resetRequestState();
  setRequestHeader("x-forwarded-for", "198.51.100.150");
  const sheet = buildFixtureSheet();
  setContractorSheetForTests(sheet);
  const a = await import("../app/admin/builder/actions.ts");
  const good = { trade: "Masonry", area: "Baner", description: "Block-work contractor left mid-way; need a masonry team.", startDate: todayInIndia(), durationDays: 10, notes: "", name: "Demo Builder", phone: "9876543210", consent: true };
  for (const call of [() => a.createTicketAction(good), () => a.syncConnectionsAction(), () => a.pairingLinkAction(ASHA), () => a.notifyMatchesAction(REQ, [ASHA])]) {
    assert.equal(await redirectOf(call), "/admin/login");
  }
  assert.equal((await loadRequests(sheet)).length, 1, "nothing was created");

  setCookie("cd_admin", adminCookie());
  const bad = await a.createTicketAction({ ...good, startDate: "", consent: false, phone: "123" });
  assert.equal(bad.error, "validation");
  assert.deepEqual(Object.keys(bad.errors).sort(), ["consent", "phone", "startDate"]);
  const made = await a.createTicketAction(good);
  assert.equal(made.ok, true);
  const saved = (await loadRequests(sheet)).find((r) => r.id === made.id);
  assert.deepEqual([saved.trade, saved.area, saved.durationDays, saved.recordType], ["Masonry", "Baner", 10, "TEST"]);
  assert.deepEqual(await a.syncConnectionsAction(), { ok: false, error: "demo_only" }, "Telegram actions run only in the live demo");
  assert.deepEqual(await a.notifyMatchesAction(made.id, [ASHA]), { ok: false, error: "demo_only" });
  setContractorSheetForTests(null);
  resetRequestState();
});

// ============================ the saved demo file ============================
test("the live demo saves its data to a local file and loads it again after a restart, Telegram links included", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-demo-"));
  const file = path.join(dir, "fixture-state.json");
  const saved = { NODE_ENV: process.env.NODE_ENV, FILE: process.env.CONTRACTOR_DESK_FIXTURE_FILE };
  try {
    delete globalThis.__contractorDeskFixtureSheet;
    process.env.CONTRACTOR_DESK_FIXTURE_FILE = file;
    const sheet = fixtureSheet();
    // A fresh start holds only the seed contractors with their past jobs and reviews.
    assert.ok(!sheet.tabs.Contractors.some((r) => r[0] === ASHA) && !sheet.tabs.Requests.some((r) => r[0] === REQ));
    assert.ok(sheet.tabs.Contractors.some((r) => r[0] === RAMESH) && sheet.tabs.Reviews.length > 1);
    const t = fakeTelegram();
    await pair(sheet, t, RAMESH, ASHA_CHAT, 90);
    const onDisk = loadSnapshot(file);
    assert.equal(onDisk.demo.links[RAMESH].chatId, ASHA_CHAT);
    assert.ok(onDisk.tabs.Reviews.length > 1);

    // "restart": forget memory, load from the file
    delete globalThis.__contractorDeskFixtureSheet;
    setDemoState(emptyDemoState());
    const again = fixtureSheet();
    assert.equal(demoState().links[RAMESH].chatId, ASHA_CHAT);
    assert.equal(again.tabs.Reviews.length, onDisk.tabs.Reviews.length);
    assert.equal(loadSnapshot(path.join(dir, "missing.json")), null);
    fs.writeFileSync(file, "{not json");
    assert.equal(loadSnapshot(file), null, "an unreadable file is ignored, not trusted");
  } finally {
    delete globalThis.__contractorDeskFixtureSheet;
    if (saved.FILE === undefined) delete process.env.CONTRACTOR_DESK_FIXTURE_FILE; else process.env.CONTRACTOR_DESK_FIXTURE_FILE = saved.FILE;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the bot's username comes from Telegram's getMe and is cached; a bad answer gives no link", async () => {
  const t = fakeTelegram();
  assert.equal(await botUsername(TOKEN, t.fetchImpl), "cd_demo_bot");
  assert.equal(await botUsername("nope", t.fetchImpl), null);
  const bad = async () => ({ status: 200, json: async () => ({ ok: true, result: { username: "bad name!" } }) });
  assert.equal(await botUsername("223456789:AAEsyntheticSYNTHETICsynthetic_token-0", bad), null);
});

afterEach(() => {
  setContractorSheetForTests(null);
});
