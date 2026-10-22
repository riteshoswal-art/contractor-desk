import { SheetSetupError } from "@/lib/contractor-store";
import {
  getContractorSheet,
  getRecordType,
  NotConfiguredError,
} from "@/lib/google-sheets";
import { createRateLimiter, newId, reply, sameOrigin } from "@/lib/http";
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

  const errors = validateRequest(parsed.values, todayInIndia());
  if (Object.keys(errors).length > 0) {
    return reply({ ok: false, error: "validation", errors }, 400);
  }

  const recordType = getRecordType();
  try {
    await saveRequest(getContractorSheet(), parsed.values, {
      id: newId("R"),
      recordType,
      nowIso: new Date().toISOString(),
    });
    return reply({ ok: true, recordType }, 200);
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
