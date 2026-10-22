import { isAdmin } from "@/lib/admin-auth";
import { decideRequestReading } from "@/lib/ai-policy";
import { extractRequestFields, GeminiNotConfiguredError } from "@/lib/gemini";
import { getRecordType, httpStatusOf } from "@/lib/google-sheets";
import { createRateLimiter, reply, sameOrigin } from "@/lib/http";
import { DESCRIPTION_MAX, DESCRIPTION_MIN } from "@/lib/request";
import { cleanText, todayInIndia } from "@/lib/registration";

const MAX_BODY_BYTES = 6_000;
// Each call costs a Gemini request, so this limit is tighter than the others.
const rateLimited = createRateLimiter(5, 10 * 60 * 1000); // 5 per 10 minutes

// Reads a developer's description with Gemini and returns suggested fields.
// Nothing is stored here. The description is never logged.
//
// Gemini is used ONLY for the founder's own tests with made-up text (see
// lib/ai-policy.ts). Every other request gets an honest "ai_not_used" answer and
// the person fills the details in by hand; nothing is sent to Gemini.
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
  let description: string;
  try {
    const body: unknown = JSON.parse(text);
    const value = (body as { description?: unknown } | null)?.description;
    if (typeof value !== "string") throw new Error("shape");
    description = cleanText(value);
  } catch {
    return reply({ ok: false, error: "invalid" }, 400);
  }
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    return reply({ ok: false, error: "invalid" }, 400);
  }

  // Decided on the server: the browser has no say in it.
  const decision = decideRequestReading({
    mode: process.env.GEMINI_MODE,
    recordType: getRecordType(),
    isAdmin: await isAdmin(),
  });
  if (!decision.allowed) {
    // Not a failure: automatic reading is switched off here. Label only.
    console.info(`[requests/extract] gemini_not_used reason=${decision.reason}`);
    return reply({ ok: false, error: "ai_not_used" }, 200);
  }

  try {
    const result = await extractRequestFields(description, todayInIndia());
    return reply({ ok: true, synthetic: true, ...result }, 200);
  } catch (error) {
    // Log a short label (and Google's numeric status when there is one) only.
    // Error objects can contain the message text, so they are never logged.
    const label =
      error instanceof GeminiNotConfiguredError
        ? "gemini_not_configured"
        : error instanceof SyntaxError
          ? "gemini_bad_output"
          : `gemini_request_failed status=${httpStatusOf(error) ?? "unknown"}`;
    console.error(`[requests/extract] ${label}`);
    return reply({ ok: false, error: "extraction_unavailable" }, 503);
  }
}
