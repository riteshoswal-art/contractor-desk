"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_LANGUAGE, parseLanguage, type LanguageCode } from "@/lib/language";

// Which language a screen is shown in. Order of preference:
//   1. the one just chosen on this screen,
//   2. ?lang=hi or ?lang=mr in the address (so a link can be shared that opens
//      the form in that language, for example in a WhatsApp message),
//   3. the choice remembered on this phone,
//   4. English.
// The first render (on the server) is always the default, so the page and the
// browser agree and nothing flickers or mismatches.

const STORAGE_KEY = "cd_lang";
let chosen: LanguageCode | null = null;
const listeners = new Set<() => void>();

function fromAddressOrMemory(): LanguageCode | null {
  try {
    const fromUrl = parseLanguage(new URLSearchParams(window.location.search).get("lang"));
    if (fromUrl) return fromUrl;
  } catch {
    // no address available
  }
  try {
    return parseLanguage(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null; // storage can be blocked: the page still works
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function chooseLanguage(code: LanguageCode) {
  chosen = code;
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // remembering is a convenience only
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", code);
    window.history.replaceState(null, "", url);
  } catch {
    // the address is a convenience only
  }
  listeners.forEach((l) => l());
}

export function useLanguage(initial: LanguageCode = DEFAULT_LANGUAGE): [LanguageCode, (code: LanguageCode) => void] {
  const language = useSyncExternalStore<LanguageCode>(
    subscribe,
    () => chosen ?? fromAddressOrMemory() ?? initial,
    () => initial,
  );
  return [language, chooseLanguage];
}
