// Free-text translation, kept deliberately honest.
//
//   - Labels, instructions, validation messages and known categories are
//     translated locally (lib/i18n.ts): no service is involved.
//   - A person's own free text (a request description, notes) can only be
//     translated by a real translation provider. None is configured, because
//     no free, permitted method exists yet: the Gemini key is on an unpaid tier
//     where text may be reviewed and used by Google, so real people's text must
//     not be sent to it, and a paid service needs your approval first.
//   So, until a provider is connected, such text is saved EXACTLY as written and
//   marked "pending". Text that has not been translated is never copied into the
//   English field and never labelled English.
import { hasDevanagari, type LanguageCode } from "./language";

export type TranslationStatus = "not_needed" | "pending" | "translated" | "failed";

export type TranslationResult =
  | { ok: true; text: string }
  | { ok: false; reason: "not_configured" | "failed" };

// Anything that can turn text from a supported language into English. A real
// provider is added by implementing this and returning it from
// getTranslationProvider(), after approval for cost and privacy.
export interface TranslationProvider {
  readonly name: string;
  translate(text: string, from: LanguageCode): Promise<TranslationResult>;
}

export const notConfiguredProvider: TranslationProvider = {
  name: "none",
  async translate() {
    return { ok: false, reason: "not_configured" };
  },
};

export function getTranslationProvider(): TranslationProvider {
  return notConfiguredProvider;
}

export type NormalizedText = {
  // The language the text is written in. "unknown" when it does not match what
  // the person chose (for example Devanagari letters typed on the English form).
  sourceLanguage: LanguageCode | "unknown";
  // English text, or "" when there is no real translation. NEVER the original.
  englishText: string;
  status: TranslationStatus;
  // How the English text was produced: "written_in_english", a provider name,
  // or "none" when there is no English text.
  method: string;
};

const MAX_ENGLISH = 4000;
const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

export async function normalizeToEnglish(
  text: string,
  chosen: LanguageCode,
  provider: TranslationProvider = getTranslationProvider(),
): Promise<NormalizedText> {
  const original = text.trim();
  if (original === "") {
    return { sourceLanguage: chosen, englishText: "", status: "not_needed", method: "none" };
  }

  if (chosen === "en") {
    // Devanagari letters on the English form: it is NOT English, so it is not
    // labelled as English and nothing is guessed about which language it is.
    if (hasDevanagari(original)) {
      return { sourceLanguage: "unknown", englishText: "", status: "pending", method: "none" };
    }
    return { sourceLanguage: "en", englishText: original, status: "not_needed", method: "written_in_english" };
  }

  // Hindi or Marathi: only a real provider can supply English. Latin letters on
  // the Hindi/Marathi form are not assumed to be English either.
  let result: TranslationResult;
  try {
    result = await provider.translate(original, chosen);
  } catch {
    return { sourceLanguage: chosen, englishText: "", status: "failed", method: provider.name };
  }
  if (!result.ok) {
    return result.reason === "not_configured"
      ? { sourceLanguage: chosen, englishText: "", status: "pending", method: "none" }
      : { sourceLanguage: chosen, englishText: "", status: "failed", method: provider.name };
  }
  const english = clean(typeof result.text === "string" ? result.text : "").slice(0, MAX_ENGLISH);
  if (english === "") {
    return { sourceLanguage: chosen, englishText: "", status: "failed", method: provider.name };
  }
  return { sourceLanguage: chosen, englishText: english, status: "translated", method: provider.name };
}
