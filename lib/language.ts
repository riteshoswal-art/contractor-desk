// The languages the app supports, and small helpers that do not depend on any
// screen. No imports, so the rules can be tested on their own.
//
// To add a language later: add it to LANGUAGES, then add one dictionary for it
// in lib/i18n.ts (TypeScript refuses to build until every string is present).

export const LANGUAGES = [
  { code: "en", name: "English", native: "English" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "mr", name: "Marathi", native: "मराठी" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export const DEFAULT_LANGUAGE: LanguageCode = "en";

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && LANGUAGES.some((l) => l.code === value);
}

// An untrusted value (from a form, a URL or the Sheet) -> a supported code or null.
export function parseLanguage(value: unknown): LanguageCode | null {
  return isLanguageCode(value) ? value : null;
}

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? "Unknown";
}

// True if the text contains Devanagari letters (used by Hindi and Marathi).
export function hasDevanagari(text: string): boolean {
  return /[ऀ-ॿ]/.test(text);
}

// ---------------------------------------------------------------------------
// Known Pune localities in each language -> the one English spelling that
// matching compares. Only places the app already lists are mapped; anything
// else is kept exactly as typed.
// ---------------------------------------------------------------------------

const LOCALITY_NAMES: Record<string, string[]> = {
  Baner: ["baner", "बाणेर", "बानेर"],
  Hinjawadi: ["hinjawadi", "hinjewadi", "हिंजवडी", "हिंजेवाडी", "हिंजवाड़ी", "हिंजेवाड़ी"],
  Wakad: ["wakad", "वाकड", "वाकड़"],
  Kharadi: ["kharadi", "खराडी", "खरादी"],
  Hadapsar: ["hadapsar", "हडपसर", "हडपसार"],
  Kothrud: ["kothrud", "कोथरूड", "कोथरुड", "कोठरूड"],
};

export function canonicalLocality(value: string): string {
  const v = value.trim().toLowerCase();
  for (const [english, names] of Object.entries(LOCALITY_NAMES)) {
    if (names.some((n) => n.toLowerCase() === v)) return english;
  }
  return value;
}

export function localizedLocalityNames(): Record<string, string[]> {
  return LOCALITY_NAMES;
}
