// The conversational live demo, end to end, with a FAKE Telegram API:
// builder registers -> raises a ticket -> available contractors get Yes/No
// buttons -> quotations by message and unit buttons -> the builder gets the
// bids and taps Choose -> both get each other's number. No test here can reach
// the real Telegram: every call goes to fakeTelegram(). All data is made up.
import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { loadBids } from "../lib/bid-store.ts";
import { builderForSession, raiseTicket, registerBuilder, validateBuilder } from "../lib/builders.ts";
import { DEMO_CONTRACTORS, ensureDemoSeed } from "../lib/demo-seed.ts";
import { botHealth, demoState, emptyDemoState, noteBotPoll, setBotListening, setDemoState } from "../lib/demo-store.ts";
import { buildFixtureSheet } from "../lib/fixtures.ts";
import { setContractorSheetForTests } from "../lib/google-sheets.ts";
import { loadJobs } from "../lib/job-store.ts";
import { loadSummaries } from "../lib/review-store.ts";
import { todayInIndia } from "../lib/registration.ts";
import { processUpdates } from "../lib/telegram-bot.ts";
import { askContractors, handleMessage, handleTap, sendDueSummaries, SUMMARY_AFTER_MS } from "../lib/telegram-flow.ts";
import { newPairingCode, syncPairings } from "../lib/telegram-pairing.ts";

const TOKEN = "123456789:AAEsyntheticSYNTHETICsynthetic_token-0";
const FOUNDER_CHAT = "500000009";
const BUILDER_CHAT = "500000001";
const RAMESH = "C-PLMBRMSH", SUNIL = "C-PLMBSNLM", IMRAN = "C-PLMBIMRN";
const CHAT = { [RAMESH]: "700000001", [SUNIL]: "700000002", [IMRAN]: "700000003" };

function fakeTelegram() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = url.split("/").pop().split("?")[0];
    calls.push({ method, body: init?.body ? JSON.parse(init.body) : null });
    if (method === "getUpdates") return { status: 200, json: async () => ({ ok: true, result: [] }) };
    return { status: 200, json: async () => ({ ok: true, result: { message_id: calls.length } }) };
  };
  const messages = () => calls.filter((c) => c.method === "sendMessage").map((c) => c.body);
  const to = (chatId) => messages().filter((m) => m.chat_id === chatId);
  const last = (chatId) => to(chatId).at(-1);
  return { calls, fetchImpl, messages, to, last, reset: () => (calls.length = 0) };
}

let n = 0;
const newId = (p) => `${p}-${String(++n).split("").map((d) => "ABCDEFGHJK"[Number(d)]).join("").padStart(8, "A")}`;
const dayFromToday = (k) => new Date(Date.parse(`${todayInIndia()}T00:00:00Z`) + k * 86400_000).toISOString().slice(0, 10);

let update = 1;
const msg = (chatId, text) => ({ updateId: update++, chatId, chatType: "private", firstName: "Friend", text });
const tap = (chatId, data, messageId = 1) => ({ updateId: update++, callbackId: `cb${update}`, chatId, chatType: "private", messageId, data, firstName: "Friend" });
const run = (env, { messages = [], taps = [] }) => processUpdates({ messages, taps, lastUpdateId: update }, env);

let sheet, t, env;
beforeEach(() => {
  setDemoState(emptyDemoState());
  sheet = buildFixtureSheet();
  ensureDemoSeed(sheet.tabs);
  setContractorSheetForTests(sheet);
  t = fakeTelegram();
  env = { recordType: "TEST", today: todayInIndia(), token: TOKEN, founderChatId: FOUNDER_CHAT, fetchImpl: t.fetchImpl, newId };
});
afterEach(() => {
  setContractorSheetForTests(null);
  setBotListening(false);
});

async function builderWithTicket({ connect = true } = {}) {
  const { builder, token } = registerBuilder({ name: "Test Builder", company: "Demo Developers", phone: "+919800000001" }, () => newId("D"));
  if (connect) {
    const { code } = newPairingCode(builder.id, new Date(), "builder");
    await run(env, { messages: [msg(BUILDER_CHAT, `/start ${code}`)] });
  }
  const ticket = await raiseTicket(
    sheet,
    builder,
    { trade: "Plumbing", area: "Baner", description: "Plumbing work for 7 days: concealed piping in 8 flats on floor 2.", startDate: dayFromToday(2), durationDays: 7, consent: true },
    { recordType: "TEST" },
    () => newId("R"),
  );
  assert.equal(ticket.ok, true);
  return { builder, token, requestId: ticket.id };
}
async function connectContractors(ids) {
  await run(env, { messages: ids.map((id) => msg(CHAT[id], `/start ${newPairingCode(id).code}`)) });
}
const convOf = (contractorId) => Object.values(demoState().conversations).find((c) => c.contractorId === contractorId);

// ============================ seed data ============================
test("seed data: 5 plumbers in Baner (3 available), no on-screen labels, a hidden seed-data note, and seeding twice adds nothing", async () => {
  const baner = DEMO_CONTRACTORS.filter((c) => c.trade === "Plumbing" && c.area === "Baner");
  assert.equal(baner.length, 5);
  assert.equal(baner.filter((c) => c.availability === "now").length, 3);
  assert.ok(DEMO_CONTRACTORS.every((c) => !/demo|sample/i.test(c.name) && c.phone.startsWith("+9190000100")));
  const notes = sheet.tabs.Contractors[0].indexOf("founder_notes");
  assert.ok(sheet.tabs.Contractors.filter((r) => r[0].startsWith("C-PLMB")).every((r) => r[notes] === "Seed data: made-up contractor"));
  const rows = JSON.stringify(sheet.tabs);
  assert.equal(ensureDemoSeed(sheet.tabs), false);
  assert.equal(JSON.stringify(sheet.tabs), rows);
  const ratings = await loadSummaries(sheet, "TEST");
  assert.equal(ratings.get(RAMESH).count, 3);
  assert.ok(!/demo|sample/i.test(JSON.stringify(sheet.tabs.Reviews)));
});

// ============================ builder registration ============================
test("builder registration: validated, session token kept only as a digest, and a ticket is saved under the builder's name and number", async () => {
  assert.equal(validateBuilder({ name: "A", phone: "123", consent: false }).ok, false);
  const ok = validateBuilder({ name: "Test Builder", company: "", phone: "98000 00001", consent: true });
  assert.equal(ok.ok, true);
  const { builder, token, requestId } = await builderWithTicket({ connect: false });
  assert.equal(builderForSession(token)?.id, builder.id);
  assert.equal(builderForSession("x".repeat(43)), null);
  assert.ok(!JSON.stringify(demoState()).includes(token), "the raw session token is never stored");
  assert.equal(demoState().ticketBuilder[requestId], builder.id);
  const row = sheet.tabs.Requests.find((r) => r[0] === requestId);
  assert.ok(row.includes("+919800000001") && row.some((c) => c.includes("Demo Developers")));
});

// ============================ asking the contractors ============================
test("raising a ticket asks ONLY the available, connected matching contractors, with Yes/No buttons and no contact details", async () => {
  await connectContractors([RAMESH, SUNIL]); // Imran has not connected
  const { requestId } = await builderWithTicket();
  t.reset();
  const r = await askContractors(sheet, requestId, env);
  assert.equal(r.ok, true);
  const status = Object.fromEntries(r.items.map((i) => [i.contractorId, i.status]));
  assert.deepEqual(status, { [RAMESH]: "asked", [SUNIL]: "asked", [IMRAN]: "not_connected" }); // Vikas (unavailable), Deepak (+30 days), Wakad and other trades are not asked
  assert.equal(t.messages().length, 2);
  for (const id of [RAMESH, SUNIL]) {
    const m = t.last(CHAT[id]);
    assert.match(m.text, /Is it possible for you to do this work\?/);
    assert.match(m.text, /Plumbing in Baner/);
    assert.ok(!m.text.includes("+91"), "no phone number in the job message");
    assert.deepEqual(m.reply_markup.inline_keyboard[0].map((b) => b.text), ["Yes, I can do it", "No"]);
  }
  // Asking again does not message anyone twice.
  t.reset();
  const again = await askContractors(sheet, requestId, env);
  assert.equal(again.items.filter((i) => i.status === "already_asked").length, 2);
  assert.equal(t.messages().length, 0);
});

test("REAL data and a missing token are refused before anything is sent", async () => {
  await connectContractors([RAMESH]);
  const { requestId } = await builderWithTicket();
  t.reset();
  assert.deepEqual(await askContractors(sheet, requestId, { ...env, recordType: "REAL" }), { ok: false, error: "real_blocked" });
  assert.deepEqual(await askContractors(sheet, requestId, { ...env, token: "" }), { ok: false, error: "no_token" });
  assert.equal(t.calls.length, 0);
});

// ============================ the whole conversation ============================
test("full flow: Yes -> amount -> unit -> Send bid saves ONE bid; No declines; the builder gets one summary and Choose shares both numbers", async () => {
  await connectContractors([RAMESH, SUNIL, IMRAN]);
  const { requestId } = await builderWithTicket();
  await askContractors(sheet, requestId, env);
  const [r, s, i] = [convOf(RAMESH), convOf(SUNIL), convOf(IMRAN)];

  // Ramesh: Yes, "Rs 1,500", per day.
  await run(env, { taps: [tap(CHAT[RAMESH], `y:${r.id}`)] });
  assert.match(t.last(CHAT[RAMESH]).text, /What is your quotation/);
  await run(env, { messages: [msg(CHAT[RAMESH], "Rs 1,500")] });
  assert.match(t.last(CHAT[RAMESH]).text, /How is this price charged\?/);
  assert.equal(convOf(RAMESH).stage, "awaiting_unit");
  const units = t.last(CHAT[RAMESH]).reply_markup.inline_keyboard[0].map((b) => b.text);
  assert.deepEqual(units, ["Per day", "Fixed price for the job"]); // the usual units first
  await run(env, { taps: [tap(CHAT[RAMESH], `u:${r.id}:2`)] });
  // Nothing is saved until the contractor confirms.
  assert.match(t.last(CHAT[RAMESH]).text, /Your bid: ₹1,500 per day\.\nSend this bid\?/);
  assert.equal((await loadBids(sheet, "TEST")).length, 0);
  await run(env, { taps: [tap(CHAT[RAMESH], `s:${r.id}`)] });
  assert.match(t.last(CHAT[RAMESH]).text, /Your bid of ₹1,500 per day is recorded/);

  // A second tap on an old button changes nothing.
  await run(env, { taps: [tap(CHAT[RAMESH], `y:${r.id}`)] });
  assert.equal(convOf(RAMESH).stage, "bid");

  // Someone else's chat cannot answer for Sunil.
  await run(env, { taps: [tap(CHAT[RAMESH], `y:${s.id}`)] });
  assert.equal(convOf(SUNIL).stage, "asked");

  // Sunil: Yes, a wrong amount first, then 1200 per day.
  await run(env, { taps: [tap(CHAT[SUNIL], `y:${s.id}`)] });
  await run(env, { messages: [msg(CHAT[SUNIL], "twelve hundred")] });
  assert.match(t.last(CHAT[SUNIL]).text, /type the amount in rupees again/);
  await run(env, { messages: [msg(CHAT[SUNIL], "1200")] });
  await run(env, { taps: [tap(CHAT[SUNIL], `u:${s.id}:2`)] });
  await run(env, { taps: [tap(CHAT[SUNIL], `s:${s.id}`)] });

  // Not everyone has answered and 10 minutes have not passed: no summary yet.
  assert.deepEqual(await sendDueSummaries(sheet, env), []);

  // Imran: No.
  await run(env, { taps: [tap(CHAT[IMRAN], `n:${i.id}`)] });
  assert.equal(convOf(IMRAN).stage, "declined");

  const bids = (await loadBids(sheet, "TEST")).filter((b) => b.requestId === requestId);
  assert.deepEqual(bids.map((b) => [b.contractorId, b.amount, b.unit]).sort(), [[RAMESH, "1500.00", "per_day"], [SUNIL, "1200.00", "per_day"]]);

  // Everyone answered: ONE summary to the builder's own chat.
  t.reset();
  assert.deepEqual(await sendDueSummaries(sheet, env), [requestId]);
  assert.deepEqual(await sendDueSummaries(sheet, env), []);
  assert.equal(t.messages().length, 1);
  const summary = t.last(BUILDER_CHAT);
  assert.match(summary.text, /Per day:/);
  assert.match(summary.text, /1\. Sunil More: ₹1,200 per day/); // cheapest first
  assert.match(summary.text, /4\.7 out of 5 from 3 reviews/);
  assert.ok(!/demo|sample|made-up/i.test(summary.text));
  assert.match(summary.text, /Asked: 3 · Quoted: 2 · Declined: 1/);
  assert.ok(!summary.text.includes("+91"), "no phone numbers before the choice");
  const buttons = summary.reply_markup.inline_keyboard.flat();
  assert.equal(buttons.length, 2);

  // A contractor cannot press the builder's Choose button.
  const pickSunil = buttons.find((b) => b.text.includes("Sunil")).callback_data;
  await run(env, { taps: [tap(CHAT[RAMESH], pickSunil)] });
  assert.equal(demoState().matches[requestId], undefined);

  // The builder chooses Sunil.
  t.reset();
  await run(env, { taps: [tap(BUILDER_CHAT, pickSunil)] });
  assert.equal(demoState().matches[requestId].contractorId, SUNIL);
  assert.match(t.last(BUILDER_CHAT).text, /Contractor: Sunil More\n[\s\S]*Phone: \+919000010002\n/);
  assert.match(t.last(CHAT[SUNIL]).text, /you were chosen[\s\S]*Builder: Test Builder \(Demo Developers\)[\s\S]*Phone: \+919800000001/);
  assert.match(t.last(CHAT[RAMESH]).text, /chose another contractor/);
  assert.equal(t.to(CHAT[IMRAN]).length, 0, "the contractor who said No is not messaged again");
  assert.ok(t.to(CHAT[RAMESH]).every((m) => !m.text.includes("+91")), "the other bidder gets no numbers");
  const jobs = await loadJobs(sheet, "TEST");
  assert.ok(jobs.some((j) => j.requestId === requestId && j.contractorId === SUNIL));

  // Choosing again is refused.
  t.reset();
  await run(env, { taps: [tap(BUILDER_CHAT, buttons.find((b) => b.text.includes("Ramesh")).callback_data)] });
  assert.equal(demoState().matches[requestId].contractorId, SUNIL);
  assert.equal(t.messages().length, 0);
});

test("one bid only: after the bid is saved, the contractor cannot start a second one", async () => {
  await connectContractors([RAMESH]);
  const { requestId } = await builderWithTicket();
  await askContractors(sheet, requestId, env);
  const r = convOf(RAMESH);
  await run(env, { taps: [tap(CHAT[RAMESH], `y:${r.id}`)] });
  await run(env, { messages: [msg(CHAT[RAMESH], "900")] });
  await run(env, { taps: [tap(CHAT[RAMESH], `u:${r.id}:4`)] });
  await run(env, { taps: [tap(CHAT[RAMESH], `s:${r.id}`)] });
  await run(env, { taps: [tap(CHAT[RAMESH], `y:${r.id}`)], messages: [msg(CHAT[RAMESH], "800")] });
  await run(env, { taps: [tap(CHAT[RAMESH], `u:${r.id}:4`), tap(CHAT[RAMESH], `x:${r.id}`), tap(CHAT[RAMESH], `s:${r.id}`)] });
  assert.equal((await loadBids(sheet, "TEST")).filter((b) => b.requestId === requestId).length, 1);
});

test("Change before sending: the contractor types a new amount and picks the unit again; a price too big for the unit is caught before confirming", async () => {
  await connectContractors([RAMESH]);
  const { requestId } = await builderWithTicket();
  await askContractors(sheet, requestId, env);
  const r = convOf(RAMESH);
  await run(env, { taps: [tap(CHAT[RAMESH], `y:${r.id}`)] });
  await run(env, { messages: [msg(CHAT[RAMESH], "1300")] });
  await run(env, { taps: [tap(CHAT[RAMESH], `u:${r.id}:0`)] }); // per square foot: a wrong tap
  assert.equal(convOf(RAMESH).stage, "awaiting_confirm");
  await run(env, { taps: [tap(CHAT[RAMESH], `x:${r.id}`)] });
  assert.equal(convOf(RAMESH).stage, "awaiting_amount");
  assert.match(t.last(CHAT[RAMESH]).text, /type your quotation amount again/);
  await run(env, { messages: [msg(CHAT[RAMESH], "200000")] });
  await run(env, { taps: [tap(CHAT[RAMESH], `u:${r.id}:0`)] }); // ₹2,00,000 per sq ft is above the limit
  assert.match(t.last(CHAT[RAMESH]).text, /too large for this rate unit/);
  assert.equal(convOf(RAMESH).stage, "awaiting_amount");
  await run(env, { messages: [msg(CHAT[RAMESH], "1300")] });
  await run(env, { taps: [tap(CHAT[RAMESH], `u:${r.id}:2`)] });
  await run(env, { taps: [tap(CHAT[RAMESH], `s:${r.id}`)] });
  const bids = (await loadBids(sheet, "TEST")).filter((b) => b.requestId === requestId);
  assert.deepEqual(bids.map((b) => [b.amount, b.unit]), [["1300.00", "per_day"]]);
});

test("the summary goes out after 10 minutes even if someone has not answered, and to the founder chat (labelled) when the builder has no Telegram", async () => {
  await connectContractors([RAMESH, SUNIL]);
  const { requestId } = await builderWithTicket({ connect: false });
  await askContractors(sheet, requestId, env);
  const r = convOf(RAMESH);
  await run(env, { taps: [tap(CHAT[RAMESH], `y:${r.id}`)] });
  await run(env, { messages: [msg(CHAT[RAMESH], "1500")] });
  await run(env, { taps: [tap(CHAT[RAMESH], `u:${r.id}:2`)] });
  await run(env, { taps: [tap(CHAT[RAMESH], `s:${r.id}`)] });
  assert.deepEqual(await sendDueSummaries(sheet, env), []);
  t.reset();
  const later = new Date(Date.now() + SUMMARY_AFTER_MS + 1000);
  assert.deepEqual(await sendDueSummaries(sheet, { ...env, now: later }), [requestId]);
  const m = t.last(FOUNDER_CHAT);
  assert.match(m.text, /Sent to the Contractor Desk team: the builder has not connected Telegram/);
  assert.match(m.text, /No answer yet: 1/);
  assert.equal(t.messages().length, 1);
});

test("a message that is not an awaited amount is ignored, and an unknown button is answered without changing anything", async () => {
  await connectContractors([RAMESH]);
  const { requestId } = await builderWithTicket();
  await askContractors(sheet, requestId, env);
  t.reset();
  await run(env, { messages: [msg(CHAT[RAMESH], "hello")], taps: [tap(CHAT[RAMESH], "y:doesnotexist")] });
  assert.equal(t.messages().length, 0);
  assert.equal(t.calls.filter((c) => c.method === "answerCallbackQuery").length, 1);
  assert.equal(convOf(RAMESH).stage, "asked");
});

test("while the bot listener runs, the admin 'Check for new connections' does not read Telegram (one reader only)", async () => {
  setBotListening(true);
  t.reset();
  const r = await syncPairings(sheet, { token: TOKEN, recordType: "TEST", fetchImpl: t.fetchImpl });
  assert.deepEqual(r, { ok: true, connected: [], confirmed: 0 });
  assert.equal(t.calls.length, 0);
});

test("log labels say what each tap and message did, with ticket IDs only (no names, numbers or amounts)", async () => {
  await connectContractors([RAMESH]);
  const { requestId } = await builderWithTicket();
  await askContractors(sheet, requestId, env);
  const r = convOf(RAMESH);
  const labels = [
    await handleTap(sheet, tap(CHAT[RAMESH], `y:${r.id}`), env),
    await handleMessage(sheet, msg(CHAT[RAMESH], "1500"), env),
    await handleTap(sheet, tap(CHAT[RAMESH], `u:${r.id}:2`), env),
    await handleTap(sheet, tap(CHAT[RAMESH], `s:${r.id}`), env),
    await handleTap(sheet, tap(CHAT[RAMESH], `s:${r.id}`), env),
    await handleMessage(sheet, msg(CHAT[RAMESH], "hello"), env),
  ];
  assert.deepEqual(labels, ["yes:asked_amount", "amount:ok", "unit:asked_confirm", "send:bid_saved", "send:already_answered", null]);
  await sendDueSummaries(sheet, env);
  const choose = t.last(BUILDER_CHAT).reply_markup.inline_keyboard[0][0].callback_data;
  assert.equal(await handleTap(sheet, tap(CHAT[RAMESH], choose), env), `choose:not_builder_chat ${requestId}`);
  assert.equal(await handleTap(sheet, tap(BUILDER_CHAT, choose), env), `choose:matched ${requestId}`);
  assert.equal(await handleTap(sheet, tap(BUILDER_CHAT, choose), env), `choose:already_matched ${requestId}`);
  assert.equal(await handleTap(sheet, tap(BUILDER_CHAT, "p:nosuchsumm:0"), env), "choose:unknown_summary");
});

test("bot health: successes reset the failure count; failures are counted with their reason", () => {
  noteBotPoll(true, "", new Date("2026-10-22T10:00:00Z"));
  noteBotPoll(false, "network", new Date("2026-10-22T10:00:30Z"));
  noteBotPoll(false, "network", new Date("2026-10-22T10:01:00Z"));
  assert.deepEqual(botHealth(), { lastOkAt: "2026-10-22T10:00:00.000Z", lastErrorAt: "2026-10-22T10:01:00.000Z", lastError: "network", failuresInARow: 2 });
  noteBotPoll(true, "", new Date("2026-10-22T10:01:30Z"));
  assert.equal(botHealth().failuresInARow, 0);
});

test("older saved data loses its on-screen labels when loaded", () => {
  const tabs = structuredClone(sheet.tabs);
  const name = tabs.Contractors[0].indexOf("name");
  const ramesh = tabs.Contractors.find((r) => r[0] === RAMESH);
  ramesh[name] = "Ramesh Patil (demo)";
  const asha = tabs.Contractors.find((r) => r[0] === "C-ASHAASHA");
  asha[name] = "Asha (fixture)";
  const comment = tabs.Reviews[0].indexOf("comment");
  tabs.Reviews[1][comment] = "Sample review (demo data): neat work.";
  const desc = tabs.Requests[0].indexOf("description");
  tabs.Requests.find((r) => r[0] === "R-FIXTURE2")[desc] = "FIXTURE: a made-up masonry job in Baner. No real person is involved.";
  assert.equal(ensureDemoSeed(tabs), true);
  assert.equal(ramesh[name], "Ramesh Patil");
  assert.equal(asha[name], "Asha");
  assert.equal(tabs.Reviews[1][comment], "Neat work.");
  const shown = JSON.stringify([tabs.Contractors.map((r) => r[name]), tabs.Reviews.map((r) => r[comment]), tabs.Requests.map((r) => r[desc])]);
  assert.ok(!/demo|fixture|sample|made-up/i.test(shown));
});
