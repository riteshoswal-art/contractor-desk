import { saveContractor, SheetSetupError } from "@/lib/contractor-store";
import {
  getContractorSheet,
  getRecordType,
  NotConfiguredError,
} from "@/lib/google-sheets";
import { createRateLimiter, newId, reply, sameOrigin } from "@/lib/http";
import { saveContractorLanguage } from "@/lib/language-store";
import { fixturesEnabled } from "@/lib/fixtures";
import { botUsername, telegramToken } from "@/lib/telegram";
import { newPairingCode, pairingUrl } from "@/lib/telegram-pairing";
import { DEFAULT_LANGUAGE, parseLanguage, type LanguageCode } from "@/lib/language";
import { parseSubmission, todayInIndia, validate } from "@/lib/registration";

const MAX_BODY_BYTES = 5_000;
const rateLimited = createRateLimiter(10, 10 * 60 * 1000); // 10 per 10 minutes

// Responses never include any stored contractor data, and the logs below
// never include names, phone numbers or other submitted text.
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

  const parsed = parseSubmission(body);
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

  const errors = validate(parsed.values, todayInIndia());
  if (Object.keys(errors).length > 0) {
    return reply({ ok: false, error: "validation", errors }, 400);
  }

  const recordType = getRecordType();
  try {
    const id = newId("C");
    const nowIso = new Date().toISOString();
    const outcome = await saveContractor(getContractorSheet(), parsed.values, { id, recordType, nowIso });
    // The language choice is a separate record, written only after the
    // registration itself is safely saved. If it cannot be written the
    // registration still stands; only a short label is logged.
    if (outcome === "saved") {
      try {
        await saveContractorLanguage(
          getContractorSheet(),
          { contractorId: id, preferredLanguage },
          { recordType, now: new Date(nowIso) },
          () => newId("L"),
        );
      } catch {
        console.error("[contractors] language_not_saved");
      }
    }
    // LIVE DEMO only (fixture mode, bot set up): offer the new contractor a
    // one-time link to connect their own Telegram chat for job alerts.
    let telegramConnectUrl: string | undefined;
    if (outcome === "saved" && fixturesEnabled()) {
      try {
        const token = telegramToken();
        const username = token ? await botUsername(token) : null;
        if (username) telegramConnectUrl = pairingUrl(username, newPairingCode(id).code);
      } catch {
        console.error("[contractors] telegram_link_failed");
      }
    }
    // Otherwise "saved" and "duplicate" look identical to the caller on purpose,
    // so the form can never be used to find out who is already registered.
    return reply({ ok: true, recordType, ...(telegramConnectUrl ? { telegramConnectUrl } : {}) }, 200);
  } catch (error) {
    // Log a short label only. Error objects can contain request details.
    const label =
      error instanceof NotConfiguredError
        ? "sheets_not_configured"
        : error instanceof SheetSetupError
          ? "sheets_header_mismatch"
          : "sheets_request_failed";
    console.error(`[contractors] ${label}`);
    return reply({ ok: false, error: "unavailable" }, 503);
  }
}
