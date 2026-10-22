// Saving the chosen language and the translation status: the Languages tab and
// the two API routes. Pretend Sheet and pretend Gemini only; synthetic data.
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as contractorsRoute from "../app/api/contractors/route.ts";
import * as requestsRoute from "../app/api/requests/route.ts";
import { SheetSetupError } from "../lib/contractor-store.ts";
import { setContractorSheetForTests } from "../lib/google-sheets.ts";
import * as LS from "../lib/language-store.ts";
import { CONTRACTOR_HEADERS } from "../lib/registration.ts";
import { REQUEST_CONSENT_TEXT, REQUEST_CONSENT_VERSION, REQUEST_HEADERS } from "../lib/request.ts";
import { readTable } from "../lib/tables.ts";
import { normalizeToEnglish } from "../lib/translation.ts";
import { captureErrors, jsonRequest, makeSheet, startFakeGemini } from "./helpers/fakes.mjs";
import { createMockProvider } from "./helpers/mock-translation.mjs";

const cell = (row, headers, name) => row[headers.indexOf(name)];
let nextIp = 0;
const ip = () => `198.51.100.${++nextIp}`;
const worldSheet = () => makeSheet({ tables: [LS.LANGUAGE_TABLE] });
const HINDI = "बाणेर साइट पर हमारा प्लंबिंग ठेकेदार काम छोड़कर चला गया। हमें नया प्लंबर चाहिए।";
const MARATHI = "बाणेर साइटवरील आमचा प्लंबिंग कंत्राटदार काम सोडून गेला. आम्हाला नवीन प्लंबर हवा आहे.";

let fake;
before(async () => { fake = await startFakeGemini(); });
after(async () => { setContractorSheetForTests(null); await fake.close(); });
beforeEach(() => {
  for (const k of ["GEMINI_API_KEY", "GEMINI_MODE", "GOOGLE_GEMINI_BASE_URL", "REGISTRATION_RECORD_TYPE", "VERCEL_ENV"]) delete process.env[k];
  process.env.NODE_ENV = "test";
  setContractorSheetForTests(null);
  fake.captured.length = 0;
});

const contractorBody = (o = {}) => ({ name: "Test Person", trade: "Plumbing", area: "Baner", availability: "now", phone: "9000000001", consent: true, ...o });
const requestBody = (o = {}) => ({
  description: "Our plumber left the Baner site halfway through the work.", name: "TEST Developer", phone: "9000000002",
  trade: "Plumbing", area: "Baner", consent: true, source: "manual", ...o,
});
const register = (body) => contractorsRoute.POST(jsonRequest(body, { ip: ip() }));
const submit = (body) => requestsRoute.POST(jsonRequest(body, { ip: ip() }));

// ============================ the Languages tab ============================
test("a contractor's language choice is saved as its own row, with no phone number or other text", async () => {
  const sheet = worldSheet();
  let n = 0;
  await LS.saveContractorLanguage(sheet, { contractorId: "C-AAAAAAAA", preferredLanguage: "mr" }, { recordType: "TEST", now: new Date("2026-10-21T10:00:00Z") }, () => `L-${++n}`);
  const [r] = await LS.loadLanguageRecords(sheet, "TEST");
  assert.deepEqual([r.entityType, r.entityId, r.preferredLanguage, r.originalText, r.englishText, r.translationStatus], ["contractor", "C-AAAAAAAA", "mr", "", "", "not_needed"]);
  assert.ok(!JSON.stringify(sheet.tabs.Languages).includes("+91"));
});

test("the latest language choice for a person is the current one, and the history stays", async () => {
  const sheet = worldSheet();
  const save = (language) => LS.saveContractorLanguage(sheet, { contractorId: "C-AAAAAAAA", preferredLanguage: language }, { recordType: "TEST" }, () => `L-${language}`);
  await save("hi"); await save("mr");
  const all = await LS.loadLanguageRecords(sheet, "TEST");
  assert.equal(all.length, 2);
  assert.equal(LS.latestLanguageByEntity(all).get("contractor|C-AAAAAAAA").preferredLanguage, "mr");
  assert.deepEqual(sheet.updated, [], "nothing is edited");
});

test("TEST and REAL records are kept apart", async () => {
  const sheet = worldSheet();
  await LS.saveContractorLanguage(sheet, { contractorId: "C-AAAAAAAA", preferredLanguage: "hi" }, { recordType: "REAL" }, () => "L-1");
  assert.equal((await LS.loadLanguageRecords(sheet, "TEST")).length, 0);
  assert.equal((await LS.loadLanguageRecords(sheet, "REAL")).length, 1);
});

test("a missing Languages tab is a setup problem and writes nothing", async () => {
  const sheet = makeSheet({});
  await assert.rejects(() => LS.saveContractorLanguage(sheet, { contractorId: "C-AAAAAAAA", preferredLanguage: "hi" }, { recordType: "TEST" }, () => "L-1"), SheetSetupError);
  assert.equal(sheet.appended.length, 0);
});

test("a request's original text is kept exactly, next to its English version only if one really exists", async () => {
  const sheet = worldSheet();
  const description = await normalizeToEnglish(HINDI, "hi");
  const notes = await normalizeToEnglish("", "hi");
  const status = await LS.saveRequestLanguage(sheet, { requestId: "R-BBBBBBBB", preferredLanguage: "hi", description: HINDI, notes: "", descriptionNormalized: description, notesNormalized: notes }, { recordType: "TEST" }, () => "L-1");
  assert.equal(status, "pending");
  const [r] = await LS.loadLanguageRecords(sheet, "TEST");
  assert.deepEqual([r.originalText, r.englishText, r.translationStatus, r.translationMethod, r.sourceLanguage, r.preferredLanguage], [HINDI, "", "pending", "none", "hi", "hi"]);
});

test("with a (mock) translation the status is 'translated' and the method is recorded; the original is still there", async () => {
  const sheet = worldSheet();
  const provider = createMockProvider({ translations: { [HINDI]: "Our plumber left the Baner site.", [MARATHI]: "Our plumber left." } });
  const description = await normalizeToEnglish(HINDI, "hi", provider);
  const notes = await normalizeToEnglish(MARATHI, "hi", provider);
  const status = await LS.saveRequestLanguage(sheet, { requestId: "R-BBBBBBBB", preferredLanguage: "hi", description: HINDI, notes: MARATHI, descriptionNormalized: description, notesNormalized: notes }, { recordType: "TEST" }, () => "L-1");
  assert.equal(status, "translated");
  const [r] = await LS.loadLanguageRecords(sheet, "TEST");
  assert.deepEqual([r.originalText, r.englishText, r.originalNotes, r.englishNotes, r.translationMethod], [HINDI, "Our plumber left the Baner site.", MARATHI, "Our plumber left.", "mock"]);
});

test("the overall status is only as good as its weakest part", () => {
  const part = (status) => ({ sourceLanguage: "hi", englishText: "", status, method: "none" });
  assert.equal(LS.combineStatus([part("not_needed"), part("not_needed")]), "not_needed");
  assert.equal(LS.combineStatus([part("translated"), part("not_needed")]), "translated");
  assert.equal(LS.combineStatus([part("translated"), part("pending")]), "pending");
  assert.equal(LS.combineStatus([part("pending"), part("failed")]), "failed");
});

test("hand-edited or unreadable language rows are ignored, never guessed", () => {
  const good = { record_id: "L-1", record_type: "TEST", entity_type: "request", entity_id: "R-BBBBBBBB", preferred_language: "hi", source_language: "hi", original_text: "x", english_text: "", original_notes: "", english_notes: "", translation_status: "pending", translation_method: "none", recorded_at: "t" };
  assert.ok(LS.parseLanguageRow(good));
  for (const patch of [{ preferred_language: "fr" }, { preferred_language: "" }, { record_type: "X" }, { entity_type: "robot" }, { entity_id: "" }]) {
    assert.equal(LS.parseLanguageRow({ ...good, ...patch }), null, JSON.stringify(patch));
  }
  assert.equal(LS.parseLanguageRow({ ...good, translation_status: "great" }).translationStatus, "");
  assert.equal(LS.parseLanguageRow({ ...good, source_language: "klingon" }).sourceLanguage, "");
});

// ============================ contractor registration route ============================
test("registration in Hindi: the registration is saved as before and the Hindi choice is recorded", async () => {
  const sheet = worldSheet();
  setContractorSheetForTests(sheet);
  const res = await register(contractorBody({ preferredLanguage: "hi" }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, recordType: "TEST" }, "the reply does not reveal anything stored");
  const contractor = sheet.appended.find(([range]) => range.startsWith("Contractors"))[1];
  const id = cell(contractor, CONTRACTOR_HEADERS, "contractor_id");
  const [lang] = await LS.loadLanguageRecords(sheet, "TEST");
  assert.deepEqual([lang.entityType, lang.entityId, lang.preferredLanguage, lang.recordType], ["contractor", id, "hi", "TEST"]);
});

test("registration without a language means English; each supported language is accepted", async () => {
  for (const [body, expected] of [[contractorBody(), "en"], [contractorBody({ preferredLanguage: "en" }), "en"], [contractorBody({ preferredLanguage: "mr" }), "mr"]]) {
    const sheet = worldSheet(); setContractorSheetForTests(sheet);
    assert.equal((await register(body)).status, 200);
    assert.equal((await LS.loadLanguageRecords(sheet, "TEST"))[0].preferredLanguage, expected);
  }
});

test("an unsupported language is refused and nothing at all is written", async () => {
  for (const bad of ["fr", "", "HI", 5, null, ["hi"], {}, "hi "]) {
    const sheet = worldSheet(); setContractorSheetForTests(sheet);
    const res = await register(contractorBody({ preferredLanguage: bad }));
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.deepEqual(await res.json(), { ok: false, error: "invalid" });
    assert.equal(sheet.appended.length, 0, JSON.stringify(bad));
  }
});

test("the same phone registering twice looks identical to the caller and adds no second language row", async () => {
  const sheet = worldSheet(); setContractorSheetForTests(sheet);
  const first = await register(contractorBody({ preferredLanguage: "hi" }));
  const second = await register(contractorBody({ preferredLanguage: "mr" }));
  assert.deepEqual(await second.json(), await first.json());
  assert.equal((await LS.loadLanguageRecords(sheet, "TEST")).length, 1);
  assert.equal(sheet.appended.filter(([range]) => range.startsWith("Contractors")).length, 1);
});

test("if the Languages tab is missing the registration still succeeds, and only a short label is logged", async () => {
  const sheet = makeSheet({}); setContractorSheetForTests(sheet);
  const log = captureErrors();
  try {
    const res = await register(contractorBody({ preferredLanguage: "hi", name: "Ramesh Patil" }));
    assert.equal(res.status, 200);
    assert.equal(sheet.appended.filter(([range]) => range.startsWith("Contractors")).length, 1);
    const logged = log.lines.join("\n");
    assert.match(logged, /\[contractors\] language_not_saved/);
    assert.ok(!/Ramesh|9000000001|hi\b/.test(logged.replace("language_not_saved", "")), logged);
  } finally { log.restore(); }
});

test("Marathi locality: a known place gets its English spelling, an unknown one is kept as typed, and both are accepted", async () => {
  for (const [typed, stored] of [["कोथरूड", "Kothrud"], ["बाणेर", "Baner"], ["वाघोली", "वाघोली"]]) {
    const sheet = worldSheet(); setContractorSheetForTests(sheet);
    const res = await register(contractorBody({ area: "Other", otherArea: typed, preferredLanguage: "mr" }));
    assert.equal(res.status, 200, typed);
    const row = sheet.appended.find(([range]) => range.startsWith("Contractors"))[1];
    assert.equal(cell(row, CONTRACTOR_HEADERS, "service_areas"), stored, typed);
  }
});

// ============================ developer request route ============================
test("a request in Hindi: the original text is stored exactly, the English version is pending, and consent is unchanged", async () => {
  const sheet = worldSheet(); setContractorSheetForTests(sheet);
  const res = await submit(requestBody({ description: HINDI, area: "बाणेर", preferredLanguage: "hi" }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, recordType: "TEST", language: { saved: true, translation: "pending" } });
  const row = sheet.appended.find(([range]) => range.startsWith("Requests"))[1];
  assert.equal(cell(row, REQUEST_HEADERS, "description"), HINDI, "the original-language text is not replaced");
  assert.equal(cell(row, REQUEST_HEADERS, "service_area"), "Baner", "a known locality is stored with its English spelling");
  assert.equal(cell(row, REQUEST_HEADERS, "consent_version"), REQUEST_CONSENT_VERSION);
  assert.equal(cell(row, REQUEST_HEADERS, "consent_text"), REQUEST_CONSENT_TEXT, "the recorded consent is the English wording");
  const [lang] = await LS.loadLanguageRecords(sheet, "TEST");
  assert.deepEqual(
    [lang.entityId, lang.preferredLanguage, lang.sourceLanguage, lang.originalText, lang.englishText, lang.translationStatus, lang.translationMethod],
    [cell(row, REQUEST_HEADERS, "request_id"), "hi", "hi", HINDI, "", "pending", "none"],
  );
});

test("a request in Marathi: same honest 'pending', with its own notes kept as written", async () => {
  const sheet = worldSheet(); setContractorSheetForTests(sheet);
  const res = await submit(requestBody({ description: MARATHI, notes: "तातडीने हवे", preferredLanguage: "mr" }));
  assert.equal((await res.json()).language.translation, "pending");
  const [lang] = await LS.loadLanguageRecords(sheet, "TEST");
  assert.deepEqual([lang.originalText, lang.originalNotes, lang.englishText, lang.englishNotes], [MARATHI, "तातडीने हवे", "", ""]);
});

test("a request in English needs no translation: the English field holds the same words, marked as written in English", async () => {
  const sheet = worldSheet(); setContractorSheetForTests(sheet);
  const description = "Our plumber left the Baner site halfway through the work.";
  const res = await submit(requestBody({ description, notes: "Urgent", preferredLanguage: "en" }));
  assert.deepEqual((await res.json()).language, { saved: true, translation: "not_needed" });
  const [lang] = await LS.loadLanguageRecords(sheet, "TEST");
  assert.deepEqual([lang.englishText, lang.englishNotes, lang.translationMethod, lang.sourceLanguage], [description, "Urgent", "written_in_english", "en"]);
});

test("Hindi text sent on the English form is not labelled English", async () => {
  const sheet = worldSheet(); setContractorSheetForTests(sheet);
  const res = await submit(requestBody({ description: HINDI, preferredLanguage: "en" }));
  assert.equal((await res.json()).language.translation, "pending");
  const [lang] = await LS.loadLanguageRecords(sheet, "TEST");
  assert.deepEqual([lang.sourceLanguage, lang.englishText, lang.translationStatus], ["unknown", "", "pending"]);
});

test("an unsupported language is refused for requests too, and nothing is written", async () => {
  for (const bad of ["fr", "", null, 3, "mr "]) {
    const sheet = worldSheet(); setContractorSheetForTests(sheet);
    const res = await submit(requestBody({ preferredLanguage: bad }));
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal(sheet.appended.length, 0);
  }
});

test("if the Languages tab is missing the request is still saved, the reply says so, and the log holds only a label", async () => {
  const sheet = makeSheet({}); setContractorSheetForTests(sheet);
  const log = captureErrors();
  try {
    const res = await submit(requestBody({ description: HINDI, preferredLanguage: "hi" }));
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).language, { saved: false, translation: null });
    assert.equal(sheet.appended.filter(([range]) => range.startsWith("Requests")).length, 1);
    const logged = log.lines.join("\n");
    assert.match(logged, /\[requests\] language_not_saved/);
    assert.ok(!logged.includes("प्लंबिंग") && !/9000000002/.test(logged), logged);
  } finally { log.restore(); }
});

test("a failing Requests save is still reported as a failure and no language record is written", async () => {
  const sheet = makeSheet({ tables: [LS.LANGUAGE_TABLE], failWith: Object.assign(new Error("denied"), { status: 403 }) });
  setContractorSheetForTests(sheet);
  const log = captureErrors();
  try {
    const res = await submit(requestBody({ preferredLanguage: "hi" }));
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { ok: false, error: "unavailable" });
  } finally { log.restore(); }
  assert.equal(sheet.appended.length, 0);
});

test("translating or saving a language never sends anything to Gemini, even when a Gemini key is configured", async () => {
  process.env.GEMINI_API_KEY = "synthetic-key-not-real";
  process.env.GEMINI_MODE = "synthetic-tests";
  process.env.GOOGLE_GEMINI_BASE_URL = fake.url;
  const sheet = worldSheet(); setContractorSheetForTests(sheet);
  await submit(requestBody({ description: HINDI, preferredLanguage: "hi" }));
  await register(contractorBody({ preferredLanguage: "mr" }));
  assert.equal(fake.captured.length, 0, "no text may reach Gemini");
});

test("the Languages tab holds no phone numbers, and the request reply holds none either", async () => {
  const sheet = worldSheet(); setContractorSheetForTests(sheet);
  const res = await submit(requestBody({ description: HINDI, preferredLanguage: "hi" }));
  assert.ok(!/\+91|9000000002/.test(await res.text()));
  assert.ok(!/\+91|9000000002|9000000001/.test(JSON.stringify(await readTable(sheet, LS.LANGUAGE_TABLE))));
});
