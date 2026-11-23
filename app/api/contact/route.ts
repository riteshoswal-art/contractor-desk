import { contactEnv, gmailMailer, saveContactMessage, sendContactEmails, validateContact } from "@/lib/contact-form";
import { createRateLimiter, reply, sameOrigin } from "@/lib/http";

const MAX_BODY_BYTES = 6_000;
const rateLimited = createRateLimiter(5, 10 * 60 * 1000); // 5 per 10 minutes

// The "Contact us" form: save the message to Supabase first (the message is
// never lost), then email the owner and send the writer an acknowledgement.
// Logs hold short labels only, never names, emails or message text.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return reply({ ok: false, error: "forbidden" }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ ok: false, error: "invalid" }, 415);
  if (rateLimited(request)) return reply({ ok: false, error: "too_many_requests" }, 429);

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return reply({ ok: false, error: "invalid" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply({ ok: false, error: "invalid" }, 400);
  }
  const checked = validateContact(body);
  if (!checked) return reply({ ok: false, error: "invalid" }, 400);
  if (!checked.ok) return reply({ ok: false, error: "validation", errors: checked.errors }, 400);
  // A bot filled the hidden field: answer as if it worked, store nothing.
  if (checked.honeypot) return reply({ ok: true, emailed: true }, 200);

  const env = contactEnv();
  if (!env) {
    console.error("[contact] not_configured");
    return reply({ ok: false, error: "unavailable" }, 503);
  }
  try {
    await saveContactMessage(env, checked.values);
  } catch (error) {
    const status = (error as { status?: number }).status;
    console.error(`[contact] save_failed${status ? ` status=${status}` : ""}`);
    return reply({ ok: false, error: "unavailable" }, 503);
  }
  const sent = await sendContactEmails(env, checked.values, gmailMailer(env));
  if (!sent.owner) console.error("[contact] owner_email_failed");
  if (!sent.ack) console.error("[contact] ack_email_failed");
  return reply({ ok: true, emailed: sent.ack }, 200);
}
