// The two screens rendered in English, Hindi and Marathi. Text the person reads
// is translated; the values the server checks (trade names, locality spellings,
// availability codes) are not.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RegistrationForm from "../app/register/RegistrationForm.tsx";
import RequestForm from "../app/request/RequestForm.tsx";
import { getDict } from "../lib/i18n.ts";
import { hasDevanagari } from "../lib/language.ts";
import { CONSENT_TEXT, PUNE_AREAS, TRADES } from "../lib/registration.ts";

const CODES = ["en", "hi", "mr"];
const NON_ENGLISH = ["hi", "mr"];
const register = (language) => renderToStaticMarkup(createElement(RegistrationForm, { initialLanguage: language }));
const request = (language) => renderToStaticMarkup(createElement(RequestForm, { initialLanguage: language }));
// What a browser would display: tags removed, entities decoded.
const text = (html) =>
  html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&ldquo;|&rdquo;/g, '"').replace(/\s+/g, " ");

test("the language selector is always shown, with all three names in their own script, and marks the current one", () => {
  for (const screen of [register, request]) {
    for (const code of CODES) {
      const html = screen(code);
      for (const native of ["English", "हिन्दी", "मराठी"]) assert.ok(html.includes(`>${native}</button>`), `${code} ${native}`);
      assert.match(html, new RegExp(`lang="${code}"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*lang="${code}"`), `${code} not marked as selected`);
      assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
    }
  }
});

test("registration in English is exactly the English wording and has no Hindi or Marathi text", () => {
  const html = register("en"); const shown = text(html);
  const d = getDict("en");
  for (const s of [d.register.title, d.register.intro, d.register.nameLabel, d.register.tradeLabel, d.register.areaLabel, d.register.availabilityLabel, d.register.phoneLabel, d.register.submit, CONSENT_TEXT]) {
    assert.ok(shown.includes(s.replace(/'/g, "'")), s);
  }
  assert.ok(!html.replace(/<button[^>]*lang="(hi|mr)"[^>]*>[^<]*<\/button>/g, "").match(/[ऀ-ॿ]/), "Devanagari outside the language buttons");
  assert.match(html, /<div lang="en">/);
});

test("registration in Hindi and Marathi: labels, instructions, trades, areas, availability and consent are translated", () => {
  for (const code of NON_ENGLISH) {
    const html = register(code); const shown = text(html); const d = getDict(code);
    for (const s of [d.register.title, d.register.intro, d.register.noteBody, d.register.nameLabel, d.register.tradeLabel, d.register.areaLabel, d.register.availabilityLabel, d.register.phoneLabel, d.register.phoneHint, d.register.submit, d.consent.contractor, d.common.back, d.common.brand]) {
      assert.ok(shown.includes(s), `${code}: ${s.slice(0, 40)}`);
    }
    for (const t of TRADES) assert.ok(shown.includes(d.trades[t]), `${code} trade ${t}`);
    for (const a of PUNE_AREAS) assert.ok(shown.includes(d.areas[a]), `${code} area ${a}`);
    for (const v of ["now", "from_date", "unavailable"]) assert.ok(shown.includes(d.availability[v]), `${code} availability ${v}`);
    assert.match(html, new RegExp(`<div lang="${code}">`));
    assert.ok(!shown.includes(getDict("en").register.title), "English heading left behind");
  }
});

test("underneath the translated labels the values the server relies on are still the English ones", () => {
  for (const code of NON_ENGLISH) {
    const html = register(code);
    for (const t of TRADES) assert.ok(html.includes(`<option value="${t}">${getDict(code).trades[t]}</option>`), `${code} trade ${t}`);
    for (const a of PUNE_AREAS) assert.ok(html.includes(`<option value="${a}">${getDict(code).areas[a]}</option>`), `${code} area ${a}`);
    assert.ok(html.includes('<option value="Other">'));
    for (const v of ["now", "from_date", "unavailable"]) assert.ok(html.includes(`value="${v}"`), `${code} availability ${v}`);
  }
});

test("the consent shown in Hindi/Marathi is followed by the English wording that is recorded; English shows it once", () => {
  for (const code of NON_ENGLISH) {
    const html = register(code);
    assert.ok(text(html).includes(CONSENT_TEXT), `${code}: the recorded English wording is shown`);
    assert.ok(text(html).includes(getDict(code).common.consentRecordedLabel));
    assert.ok(html.includes('<p lang="en"'), "the English wording is marked as English");
  }
  const en = text(register("en"));
  assert.equal(en.split(CONSENT_TEXT).length - 1, 1);
  assert.ok(!en.includes(getDict("en").common.consentRecordedLabel));
});

test("registration form keeps its fields: required marks, honeypot, phone input and submit", () => {
  for (const code of CODES) {
    const html = register(code);
    for (const id of ["name", "trade", "area", "phone", "consent"]) assert.ok(html.includes(`id="${id}"`), `${code} ${id}`);
    assert.ok(html.includes('name="website"') && html.includes('aria-hidden="true"'), "honeypot");
    assert.ok(html.includes('type="tel"') && html.includes('inputMode="tel"'));
    assert.ok(html.includes('type="submit"'));
    assert.ok(html.includes("text-red-700\">*</span>"), "required marker");
  }
});

test("request screen in each language: heading, instructions, description box and the continue button", () => {
  for (const code of CODES) {
    const html = request(code); const shown = text(html); const d = getDict(code);
    for (const s of [d.request.title, d.request.intro, d.request.noteBody, d.request.descriptionLabel, d.request.continue, d.common.back]) {
      assert.ok(shown.includes(s.replace(/&apos;/g, "'")), `${code}: ${s.slice(0, 40)}`);
    }
    assert.ok(html.includes(`placeholder="${d.request.descriptionPlaceholder}"`), `${code} placeholder`);
    assert.ok(shown.includes(`0/2000`.replace("0/2000", code === "en" ? "0/2000 characters" : `0/2000 ${d.request.charCount.split(" ").pop()}`)), `${code} counter`);
    assert.match(html, new RegExp(`<div lang="${code}">`));
    if (code !== "en") assert.ok(!shown.includes(getDict("en").request.title));
  }
});

test("the request form in Hindi still sends text exactly as typed: the description box is a plain text area with no length change", () => {
  const html = request("hi");
  assert.ok(html.includes('maxLength="2000"'));
  assert.ok(html.includes("<textarea"));
});

test("no screen shows a phone number, a stored value or a leftover placeholder", () => {
  for (const screen of [register, request]) {
    for (const code of CODES) {
      const shown = text(screen(code));
      assert.ok(!/\+91\d|\b[6-9]\d{9}\b/.test(shown.replace(/98765 43210|\+91 98765 43210/g, "")), `${code}: phone-like text`);
      assert.ok(!/\{(n|min|max)\}/.test(shown), `${code}: unfilled placeholder`);
      assert.ok(!/undefined|\[object/.test(shown), `${code}: broken value`);
    }
  }
});

test("page text that used to be in English-only server pages is now translated with the form", () => {
  // the pages themselves only hold the form, so nothing is left behind in English
  for (const code of NON_ENGLISH) {
    const shown = text(register(code)) + text(request(code));
    for (const english of ["Contractor registration", "Tell us about the disruption", "How your details are used.", "Before you start."]) {
      assert.ok(!shown.includes(english), `${code} still shows: ${english}`);
    }
    assert.ok(hasDevanagari(shown));
  }
});
