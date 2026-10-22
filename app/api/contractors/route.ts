import { saveContractor, SheetSetupError } from "@/lib/contractor-store";
import {
  getContractorSheet,
  getRecordType,
  NotConfiguredError,
} from "@/lib/google-sheets";
import { createRateLimiter, newId, reply, sameOrigin } from "@/lib/http";
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

  const errors = validate(parsed.values, todayInIndia());
  if (Object.keys(errors).length > 0) {
    return reply({ ok: false, error: "validation", errors }, 400);
  }

  const recordType = getRecordType();
  try {
    await saveContractor(getContractorSheet(), parsed.values, {
      id: newId("C"),
      recordType,
      nowIso: new Date().toISOString(),
    });
    // "saved" and "duplicate" look identical to the caller on purpose, so the
    // form can never be used to find out who is already registered.
    return reply({ ok: true, recordType }, 200);
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
