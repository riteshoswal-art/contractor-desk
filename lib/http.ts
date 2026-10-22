// Small helpers shared by the API routes (server-side only).
import { randomBytes } from "node:crypto";

export function reply(body: Record<string, unknown>, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

// Rejects browser requests that come from a different website.
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser callers (e.g. curl) send no Origin
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

// Simple in-memory limiter, one counter per caller address. It slows down
// casual abuse, but on Vercel each server instance keeps its own counts, so
// treat it as a speed bump only. Addresses are never logged.
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  // Accepts a Request, or a plain key (used by server actions, which have no
  // Request object).
  return function isLimited(source: Request | string): boolean {
    const ip =
      typeof source === "string"
        ? source
        : source.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          "unknown";
    const now = Date.now();
    if (hits.size > 1000) {
      for (const [key, value] of hits) {
        if (value.resetAt < now) hits.delete(key);
      }
    }
    const entry = hits.get(ip);
    if (!entry || entry.resetAt < now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return false;
    }
    entry.count += 1;
    return entry.count > limit;
  };
}

// Letters and digits that are easy to read aloud (no 0/O, 1/I/L).
const ID_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export function newId(prefix: string): string {
  let id = `${prefix}-`;
  for (const b of randomBytes(8)) id += ID_ALPHABET[b % ID_ALPHABET.length];
  return id;
}
