import { SheetSetupError } from "@/lib/contractor-store";
import {
  getContractorSheet,
  getRecordType,
  NotConfiguredError,
} from "@/lib/google-sheets";
import { createRateLimiter, newId, reply, sameOrigin } from "@/lib/http";
import { saveRequestLanguage } from "@/lib/language-store";
import { DEFAULT_LANGUAGE, parseLanguage, type LanguageCode } from "@/lib/language";
import { getTranslationProvider, normalizeToEnglish, type TranslationStatus } from "@/lib/translation";
import { todayInIndia } from "@/lib/registration";
import { parseRequestSubmission, validateRequest } from "@/lib/request";
import { saveRequest } from "@/lib/request-store";

const MAX_BODY_BYTES = 8_000;
const rateLimited = createRateLimiter(10, 10 * 60 * 1000); // 10 per 10 minutes

// Saves a reviewed developer request to the Requests tab. Every field is
// re-validated here: the browser, and Gemini's earlier suggestions, are not
// trusted. Nothing in the response or the logs contains submitted text.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ ok: false, error: "forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return reply({ ok: false, error: "invalid" }, 415);
  }
  if (rateLimited(request)) {
    return reply({ ok: false, error: "too_many_requests" }, 429);
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return reply({ ok: false, error: "invalid" }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply({ ok: false, error: "invalid" }, 400);
  }

  const parsed = parseRequestSubmission(body);
  if (!parsed || parsed.honeypot !== "") {
    return reply({ ok: false, error: "invalid" }, 400);
  }

  // The language the form was shown in. Missing means English; anything that is
  // not a supported language is refused rather than guessed.
  let preferredLanguage: LanguageCode = DEFAULT_LANGUAGE;
  const rawLanguage = (body as Record<string, unknown>).preferredLanguage;
  if (rawLanguage !== undefined) {
    const language = parseLanguage(rawLanguage);
    if (!language) return reply({ ok: false, error: "invalid" }, 400);
    preferredLanguage = language;
  }

  const errors = validateRequest(parsed.values, todayInIndia());
  if (Object.keys(errors).length > 0) {
    return reply({ ok: false, error: "validation", errors }, 400);
  }

  const recordType = getRecordType();
  try {
    const id = newId("R");
    const nowIso = new Date().toISOString();
    await saveRequest(getContractorSheet(), parsed.values, { id, recordType, nowIso });

    // The original text is already saved, exactly as written. Now record the
    // language and the English version, if a real translation exists. With no
    // translation provider connected the status is "pending" and the English
    // field stays empty: untranslated text is never passed off as English.
    let language: { saved: boolean; translation: TranslationStatus | null } = {
      saved: false,
      translation: null,
    };
    try {
      const provider = getTranslationProvider();
      const description = await normalizeToEnglish(parsed.values.description, preferredLanguage, provider);
      const notes = await normalizeToEnglish(parsed.values.notes, preferredLanguage, provider);
      const status = await saveRequestLanguage(
        getContractorSheet(),
        {
          requestId: id,
          preferredLanguage,
          description: parsed.values.description,
          notes: parsed.values.notes,
          descriptionNormalized: description,
          notesNormalized: notes,
        },
        { recordType, now: new Date(nowIso) },
        () => newId("L"),
      );
      language = { saved: true, translation: status };
    } catch {
      console.error("[requests] language_not_saved");
    }
    return reply({ ok: true, recordType, language }, 200);
  } catch (error) {
    const label =
      error instanceof NotConfiguredError
        ? "sheets_not_configured"
        : error instanceof SheetSetupError
          ? "sheets_header_mismatch"
          : "sheets_request_failed";
    console.error(`[requests] ${label}`);
    return reply({ ok: false, error: "unavailable" }, 503);
  }
}
