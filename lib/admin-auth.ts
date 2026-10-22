// Server-only: a single-founder admin login. The password and signing secret
// come from environment variables. If either is missing or too short, nobody
// can log in (the admin area fails closed).
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "cd_admin";
const SESSION_SECONDS = 8 * 60 * 60;

function config(): { password: string; secret: string } | null {
  const password = process.env.ADMIN_PASSWORD ?? "";
  const secret = process.env.ADMIN_SESSION_SECRET ?? "";
  if (password.length < 10 || secret.length < 32) return null;
  return { password, secret };
}

export function adminConfigured(): boolean {
  return config() !== null;
}

function sign(secret: string, expiry: string): string {
  return createHmac("sha256", secret).update(`admin:${expiry}`).digest("base64url");
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// Compares hashes, so timing does not reveal how much of a guess was right.
export function passwordMatches(input: string): boolean {
  const cfg = config();
  if (!cfg) return false;
  return timingSafeEqual(digest(input), digest(cfg.password));
}

// The login cookie is marked Secure (sent only over https) on every host
// except localhost, so a real deployment never sends it over plain http while
// local testing on http://localhost still works.
export async function createSession(host: string): Promise<void> {
  const cfg = config();
  if (!cfg) return;
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const expiry = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  (await cookies()).set(COOKIE_NAME, `${expiry}.${sign(cfg.secret, expiry)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: !isLocal,
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

export async function isAdmin(): Promise<boolean> {
  // Read the cookies BEFORE anything else. That marks the page as depending on
  // the request, so Next never decides "not logged in" once at build time
  // (when no password exists) and bakes that answer into the page.
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const cfg = config();
  if (!cfg || !token) return false;
  const [expiry, signature, ...rest] = token.split(".");
  if (!expiry || !signature || rest.length > 0) return false;
  if (!/^\d+$/.test(expiry) || Number(expiry) < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(cfg.secret, expiry));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// Call at the top of every admin page and action. Sends visitors who are not
// logged in to the login page.
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
