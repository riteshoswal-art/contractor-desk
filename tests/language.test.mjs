// Languages: the registry, the English/Hindi/Marathi dictionaries, translated
// validation messages, and the honest rules for free-text translation.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as L from "../lib/language.ts";
import * as I from "../lib/i18n.ts";
import * as T from "../lib/translation.ts";
import { CONSENT_TEXT, TRADES, PUNE_AREAS, AVAILABILITY_OPTIONS } from "../lib/registration.ts";
import { REQUEST_CONSENT_TEXT } from "../lib/request.ts";
import { createMockProvider } from "./helpers/mock-translation.mjs";

const CODES = ["en", "hi", "mr"];
const NON_ENGLISH = ["hi", "mr"];

// ------------------------- registry and helpers -------------------------
test("three languages are supported, each with its own native name, and English is the default", () => {
  assert.deepEqual(L.LANGUAGES.map((l) => l.code), CODES);
  assert.deepEqual(L.LANGUAGES.map((l) => l.native), ["English", "हिन्दी", "मराठी"]);
  assert.equal(L.DEFAULT_LANGUAGE, "en");
});

test("an untrusted language value is accepted only if it is exactly a supported code", () => {
  for (const ok of CODES) assert.equal(L.parseLanguage(ok), ok);
  for (const bad of ["EN", "fr", "hin", "", " hi", "hi ", null, undefined, 5, {}, ["hi"], true]) {
    assert.equal(L.parseLanguage(bad), null, String(bad));
  }
  assert.equal(L.isLanguageCode("mr"), true);
  assert.equal(L.languageName("hi"), "Hindi");
  assert.equal(L.languageName("zz"), "Unknown");
});

test("Devanagari detection", () => {
  assert.equal(L.hasDevanagari("बाणेर में काम"), true);
  assert.equal(L.hasDevanagari("work in Baner और काम"), true);
  assert.equal(L.hasDevanagari("work in Baner"), false);
  assert.equal(L.hasDevanagari(""), false);
});

test("known Pune localities typed in Hindi or Marathi get their English spelling; anything else stays as typed", () => {
  for (const [typed, english] of [
    ["बाणेर", "Baner"], ["baner", "Baner"], ["BANER", "Baner"], ["  बाणेर  ", "Baner"],
    ["हिंजवडी", "Hinjawadi"], ["हिंजेवाडी", "Hinjawadi"], ["वाकड", "Wakad"], ["खराडी", "Kharadi"],
    ["हडपसर", "Hadapsar"], ["कोथरूड", "Kothrud"], ["कोथरुड", "Kothrud"],
  ]) {
    assert.equal(L.canonicalLocality(typed), english, typed);
  }
  for (const other of ["वाघोली", "Wagholi", "Pune", "", "बाणेर रोड"]) assert.equal(L.canonicalLocality(other), other, other);
});

// ------------------------- dictionaries -------------------------
const flatten = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) => (typeof v === "string" ? [[`${prefix}${k}`, v]] : flatten(v, `${prefix}${k}.`)));
const dicts = Object.fromEntries(CODES.map((c) => [c, Object.fromEntries(flatten(I.getDict(c)))]));
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("every language has exactly the same set of strings (nothing missing, nothing extra)", () => {
  const en = Object.keys(dicts.en).sort();
  assert.ok(en.length > 100, `expected a full dictionary, got ${en.length} strings`);
  for (const code of NON_ENGLISH) assert.deepEqual(Object.keys(dicts[code]).sort(), en, code);
});

test("no string is empty, a leftover marker, or still English in Hindi and Marathi", () => {
  for (const code of CODES) {
    for (const [key, value] of Object.entries(dicts[code])) {
      assert.ok(value.trim().length > 0, `${code} ${key} is empty`);
      assert.ok(!/TODO|FIXME|XXX|lorem/i.test(value), `${code} ${key} looks unfinished`);
    }
  }
  for (const code of NON_ENGLISH) {
    for (const [key, value] of Object.entries(dicts[code])) {
      assert.notEqual(value, dicts.en[key], `${code} ${key} is not translated`);
      assert.ok(L.hasDevanagari(value), `${code} ${key} has no Devanagari text`);
    }
  }
});

test("placeholders such as {n}, {min} and {max} match the English string in every language", () => {
  for (const code of NON_ENGLISH) {
    for (const [key, value] of Object.entries(dicts[code])) {
      assert.equal(placeholders(value), placeholders(dicts.en[key]), `${code} ${key}`);
    }
  }
});

test("the English interface is exactly the existing English wording (consent texts included)", () => {
  assert.equal(I.getDict("en").consent.contractor, CONSENT_TEXT);
  assert.equal(I.getDict("en").consent.request, REQUEST_CONSENT_TEXT);
  assert.equal(I.getDict("en").validation.consentRegister, "Consent is required to register.");
});

test("every trade, locality and availability option the forms offer has a label in every language", () => {
  for (const code of CODES) {
    const d = I.getDict(code);
    for (const t of TRADES) assert.ok(d.trades[t], `${code} trade ${t}`);
    for (const a of PUNE_AREAS) assert.ok(d.areas[a], `${code} area ${a}`);
    for (const o of AVAILABILITY_OPTIONS) assert.ok(d.availability[o.value], `${code} availability ${o.value}`);
    assert.ok(d.areas.Other);
  }
  // exactly the options the forms offer: no label for something that does not exist
  assert.deepEqual(Object.keys(I.getDict("hi").trades).sort(), [...TRADES].sort());
  assert.deepEqual(Object.keys(I.getDict("mr").areas).sort(), [...PUNE_AREAS, "Other"].sort());
});

test("the consent is translated in Hindi and Marathi, and the English wording stays the one recorded", () => {
  for (const code of NON_ENGLISH) {
    const d = I.getDict(code);
    assert.ok(L.hasDevanagari(d.consent.contractor) && L.hasDevanagari(d.consent.request));
    assert.notEqual(d.consent.contractor, CONSENT_TEXT);
    assert.ok(d.common.consentRecordedLabel.length > 10);
  }
});

test("fill() replaces placeholders and leaves unknown ones visible", () => {
  assert.equal(I.fill("{n}/{max} characters", { n: 5, max: 2000 }), "5/2000 characters");
  assert.equal(I.fill("{n} and {other}", { n: 1 }), "1 and {other}");
  assert.equal(I.fill("none here", { n: 1 }), "none here");
});

// ------------------------- validation messages -------------------------
// Collect every message the two validators and the request form can produce,
// by reading the source files, so a newly added message cannot be forgotten.
function messagesIn(file, substitutions = {}) {
  const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const found = [];
  const re = /(?:errors|e)\.\w+\s*=\s*\n?\s*([`"])((?:\\.|(?!\1)[^\\])*)\1/g;
  let m;
  while ((m = re.exec(source))) {
    let text = m[2];
    for (const [name, value] of Object.entries(substitutions)) text = text.split("${" + name + "}").join(String(value));
    found.push(text);
  }
  return found;
}

test("every validation message the app can show is translated into Hindi and Marathi", () => {
  const SUB = { DESCRIPTION_MIN: 20, DESCRIPTION_MAX: 2000, DURATION_MAX_DAYS: 730, NOTES_MAX: 500 };
  const english = [
    ...messagesIn("../lib/registration.ts", SUB),
    ...messagesIn("../lib/request.ts", SUB),
    ...messagesIn("../lib/review.ts", { COMMENT_MAX: 600 }),
    ...messagesIn("../app/request/RequestForm.tsx", SUB).filter((s) => !s.includes("${")),
  ];
  assert.ok(english.length >= 20, `only found ${english.length} messages: the scan is broken`);
  for (const message of english) {
    assert.ok(I.validationKeyOf(message), `no dictionary entry for: ${message}`);
    for (const code of NON_ENGLISH) {
      const shown = I.translateMessage(code, message);
      assert.notEqual(shown, message, `${code} not translated: ${message}`);
      assert.ok(L.hasDevanagari(shown), `${code}: ${message}`);
      assert.ok(!/[{}]/.test(shown), `${code} left a placeholder open: ${shown}`);
    }
  }
});

test("translated messages fill in the real numbers", () => {
  const short = "Please describe the situation in at least 20 characters.";
  for (const code of NON_ENGLISH) assert.ok(I.translateMessage(code, short).includes("20"), code);
  assert.ok(I.translateMessage("hi", "Enter a whole number of days from 1 to 730.").includes("730"));
  assert.ok(I.translateMessage("mr", "Notes must be 500 characters or fewer.").includes("500"));
  assert.ok(I.translateMessage("hi", "Please describe the situation in 20 to 2000 characters.").includes("2000"));
});

test("English is returned unchanged; an unknown message is never invented; undefined stays undefined", () => {
  assert.equal(I.translateMessage("en", "Please enter a valid date."), "Please enter a valid date.");
  assert.equal(I.translateMessage("hi", "Some brand new message"), "Some brand new message");
  assert.equal(I.translateMessage("mr", undefined), undefined);
  assert.equal(I.translateMessage("hi", ""), "");
  // a near-miss is not translated either (exact wording only)
  assert.equal(I.translateMessage("hi", "Please enter a valid date"), "Please enter a valid date");
});

test("the real validators' output is translatable end to end", async () => {
  const { validate, emptyValues } = await import("../lib/registration.ts");
  const { validateRequest, emptyRequest } = await import("../lib/request.ts");
  const reg = validate({ ...emptyValues, name: "x".repeat(81), phone: "123" }, "2026-10-21");
  const req = validateRequest({ ...emptyRequest, description: "short", phone: "", area: "!" }, "2026-10-21");
  for (const msg of [...Object.values(reg), ...Object.values(req)]) {
    for (const code of NON_ENGLISH) assert.notEqual(I.translateMessage(code, msg), msg, `${code}: ${msg}`);
  }
});

// ------------------------- Devanagari is accepted by the validators -------------------------
test("Hindi and Marathi locality names are accepted (they used to be rejected)", async () => {
  const { isValidLocality, validateRequest, emptyRequest } = await import("../lib/request.ts");
  const { validate, emptyValues, OTHER_AREA } = await import("../lib/registration.ts");
  for (const place of ["बाणेर", "हिंजवडी", "वाघोली", "कोथरूड", "पिंपरी-चिंचवड", "Baner", "Hinjawadi, Phase 1"]) {
    assert.equal(isValidLocality(place), true, place);
  }
  for (const bad of ["", "a", "x".repeat(61), "<script>", "बाणेर;drop", "!!"]) assert.equal(isValidLocality(bad), false, bad);
  const req = validateRequest({ ...emptyRequest, description: "x".repeat(30), phone: "9000000002", trade: "Masonry", area: "वाघोली", consent: true }, "2026-10-21");
  assert.equal(req.area, undefined);
  const reg = validate({ ...emptyValues, trade: "Masonry", area: OTHER_AREA, otherArea: "वाघोली", availability: "now", phone: "9000000001", consent: true }, "2026-10-21");
  assert.equal(reg.otherArea, undefined);
  assert.ok(validate({ ...emptyValues, trade: "Masonry", area: OTHER_AREA, otherArea: "<b>", availability: "now", phone: "9000000001", consent: true }, "2026-10-21").otherArea);
});

// ------------------------- free-text translation: honest rules -------------------------
const HINDI = "बाणेर साइट पर हमारा प्लंबिंग ठेकेदार काम छोड़कर चला गया।";

test("English text on the English form needs no translation and is not sent to any provider", async () => {
  const provider = createMockProvider();
  const r = await T.normalizeToEnglish("Plumber left the Baner site.", "en", provider);
  assert.deepEqual(r, { sourceLanguage: "en", englishText: "Plumber left the Baner site.", status: "not_needed", method: "written_in_english" });
  assert.equal(provider.calls.length, 0);
});

test("Hindi/Marathi text with NO provider connected is 'pending': English stays empty and the original is never passed off as English", async () => {
  for (const code of NON_ENGLISH) {
    const r = await T.normalizeToEnglish(HINDI, code);
    assert.deepEqual(r, { sourceLanguage: code, englishText: "", status: "pending", method: "none" });
    assert.notEqual(r.englishText, HINDI);
  }
  assert.equal(T.getTranslationProvider().name, "none");
  assert.deepEqual(await T.notConfiguredProvider.translate("x", "hi"), { ok: false, reason: "not_configured" });
});

test("Devanagari typed on the ENGLISH form is not labelled English", async () => {
  const provider = createMockProvider();
  const r = await T.normalizeToEnglish(HINDI, "en", provider);
  assert.deepEqual(r, { sourceLanguage: "unknown", englishText: "", status: "pending", method: "none" });
  assert.equal(provider.calls.length, 0, "no guess about which language it is");
});

test("Latin letters typed on the Hindi form are not assumed to be English either", async () => {
  const r = await T.normalizeToEnglish("Plumber chhod kar chala gaya", "hi");
  assert.equal(r.status, "pending"); assert.equal(r.englishText, "");
});

test("with a (mock) provider, a real translation is stored with the method that made it", async () => {
  const provider = createMockProvider({ translations: { [HINDI]: "Our plumbing contractor left the Baner site." } });
  const r = await T.normalizeToEnglish(HINDI, "hi", provider);
  assert.deepEqual(r, { sourceLanguage: "hi", englishText: "Our plumbing contractor left the Baner site.", status: "translated", method: "mock" });
  assert.deepEqual(provider.calls, [{ text: HINDI, from: "hi" }]);
  assert.equal((await T.normalizeToEnglish(HINDI, "mr", createMockProvider())).sourceLanguage, "mr");
});

test("a provider that fails, throws, or returns nothing useful gives 'failed', never a made-up English text", async () => {
  for (const options of [{ fail: true }, { throwError: true }, { reply: "" }, { reply: "   " }, { reply: "\n\t" }]) {
    const r = await T.normalizeToEnglish(HINDI, "mr", createMockProvider(options));
    assert.equal(r.status, "failed", JSON.stringify(options));
    assert.equal(r.englishText, "", JSON.stringify(options));
    assert.equal(r.method, "mock");
  }
  assert.equal((await T.normalizeToEnglish(HINDI, "hi", createMockProvider({ notConfigured: true }))).status, "pending");
});

test("a provider's answer is cleaned and limited before it is stored", async () => {
  const messy = await T.normalizeToEnglish(HINDI, "hi", createMockProvider({ reply: "  Line one\n\n\tline   two\u0000  " }));
  assert.equal(messy.englishText, "Line one line two");
  const long = await T.normalizeToEnglish(HINDI, "hi", createMockProvider({ reply: "x".repeat(9000) }));
  assert.equal(long.englishText.length, 4000);
});

test("empty text needs no translation and calls nothing", async () => {
  const provider = createMockProvider();
  for (const empty of ["", "   ", "\n"]) {
    for (const code of CODES) {
      const r = await T.normalizeToEnglish(empty, code, provider);
      assert.deepEqual([r.status, r.englishText, r.method], ["not_needed", "", "none"], `${code} ${JSON.stringify(empty)}`);
    }
  }
  assert.equal(provider.calls.length, 0);
});
