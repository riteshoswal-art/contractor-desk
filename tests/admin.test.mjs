// Tests the admin login and the guards on admin-only actions, using stand-ins
// for Next.js cookies and redirects (tests/stubs). All passwords and secrets
// below are made-up test values.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  adminConfigured,
  createSession,
  isAdmin,
  passwordMatches,
  requireAdmin,
} from "../lib/admin-auth.ts";
import { login, logout } from "../app/admin/login/actions.ts";
import { draftAction, linkAction } from "../app/admin/requests/[id]/contact/[contractorId]/actions.ts";
import { saveOutcomeAction } from "../app/admin/requests/[id]/outcome/[contractorId]/actions.ts";
import { setContractorSheetForTests } from "../lib/google-sheets.ts";
import { ACCEPTED_CONSENT_VERSIONS } from "../lib/match.ts";
import {
  getCookie,
  getCookieOptions,
  resetRequestState,
  setCookie,
  setRequestHeader,
} from "./stubs/next-headers.mjs";
import { connectionCalls, onConnection, resetConnectionCalls } from "./stubs/next-server.mjs";
import { contractorRow, makeSheet, requestRow } from "./helpers/fakes.mjs";

const PASSWORD = "synthetic-test-password";
const SECRET = "synthetic-secret-synthetic-secret-0123456789";
const COOKIE = "cd_admin";
let nextIp = 0;

beforeEach(() => {
  resetRequestState();
  process.env.NODE_ENV = "test";
  process.env.ADMIN_PASSWORD = PASSWORD;
  process.env.ADMIN_SESSION_SECRET = SECRET;
  delete process.env.REGISTRATION_RECORD_TYPE;
  setRequestHeader("x-forwarded-for", `198.51.100.${++nextIp}`);
  setContractorSheetForTests(null);
});

const redirectOf = async (fn) => {
  try {
    await fn();
  } catch (error) {
    if (error?.redirectUrl) return error.redirectUrl;
    throw error;
  }
  return null;
};
const token = (expiry, secret = SECRET) =>
  `${expiry}.${createHmac("sha256", secret).update(`admin:${expiry}`).digest("base64url")}`;
const inOneHour = () => String(Math.floor(Date.now() / 1000) + 3600);
const loginForm = (password) => {
  const form = new FormData();
  form.set("password", password);
  return form;
};

// ============================ configuration ============================

test("the admin area stays locked unless both password and secret are long enough", async () => {
  for (const [password, secret] of [
    [undefined, SECRET], [PASSWORD, undefined], ["short", SECRET], [PASSWORD, "too-short-secret"], ["", ""],
  ]) {
    resetRequestState();
    if (password === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = password;
    if (secret === undefined) delete process.env.ADMIN_SESSION_SECRET; else process.env.ADMIN_SESSION_SECRET = secret;
    assert.equal(adminConfigured(), false);
    assert.equal(passwordMatches(PASSWORD), false);
    await createSession("localhost:3000");
    assert.equal(getCookie(COOKIE), undefined, "a session was created while locked");
    setCookie(COOKIE, token(inOneHour()));
    assert.equal(await isAdmin(), false, "a cookie worked while locked");
  }
});

test("password check: right password only", () => {
  assert.equal(adminConfigured(), true);
  assert.equal(passwordMatches(PASSWORD), true);
  for (const wrong of ["", "wrong", PASSWORD + " ", PASSWORD.toUpperCase(), PASSWORD.slice(0, -1)]) {
    assert.equal(passwordMatches(wrong), false, JSON.stringify(wrong));
  }
});

// ============================ sessions ============================

test("a login cookie is private to the server and expires", async () => {
  await createSession("localhost:3000");
  const opts = getCookieOptions(COOKIE);
  assert.equal(opts.httpOnly, true);
  assert.equal(opts.sameSite, "strict");
  assert.equal(opts.path, "/");
  assert.equal(opts.maxAge, 8 * 60 * 60);
  assert.equal(await isAdmin(), true);
});

// Regression: Next.js refuses Date.now() while prerendering a page. The login
// check must wait for a real request (connection()) before it reads the clock,
// whenever it has a cookie to check.
test("the session check waits for a real request before reading the time", async () => {
  const realNow = Date.now;
  const events = [];
  Date.now = () => { events.push("clock"); return realNow(); };
  try {
    resetConnectionCalls();
    onConnection(() => events.push("connection"));
    setCookie(COOKIE, token(inOneHour()));
    events.length = 0; // only watch what isAdmin() itself does (the line above reads the clock too)
    assert.equal(await isAdmin(), true);
    assert.equal(connectionCalls(), 1, "connection() was not awaited");
    assert.deepEqual(events, ["connection", "clock"], "the clock must be read only after connection()");

    // No cookie, or a malformed one: nothing depends on the time, so no wait is needed.
    resetRequestState();
    resetConnectionCalls();
    assert.equal(await isAdmin(), false);
    setCookie(COOKIE, "garbage");
    assert.equal(await isAdmin(), false);
    assert.equal(connectionCalls(), 0);
  } finally {
    Date.now = realNow;
    resetConnectionCalls();
  }
});

test("the cookie is marked Secure everywhere except localhost", async () => {
  for (const [host, secure] of [
    ["localhost:3000", false], ["127.0.0.1:3000", false], ["[::1]:3000", false], ["localhost", false],
    ["myapp.vercel.app", true], ["example.com", true], ["localhost.evil.com", true], ["", true],
  ]) {
    await createSession(host);
    assert.equal(getCookieOptions(COOKIE).secure, secure, host);
  }
});

test("forged, expired, tampered and wrongly-signed cookies are rejected", async () => {
  const expired = String(Math.floor(Date.now() / 1000) - 10);
  const good = token(inOneHour());
  const [expiry, signature] = good.split(".");
  const bad = [
    "", "garbage", "9999999999.fake", "1.abc", `${expiry}.`, `.${signature}`, `${expiry}.${signature}.extra`,
    token(expired), token(inOneHour(), "some-other-secret-some-other-secret-9999"),
    `${Number(expiry) + 1000}.${signature}`, // changing the expiry breaks the signature
    `${expiry}.${signature.slice(0, -2)}xx`,
  ];
  for (const value of bad) {
    setCookie(COOKIE, value);
    assert.equal(await isAdmin(), false, value);
  }
  setCookie(COOKIE, good);
  assert.equal(await isAdmin(), true);
});

test("with no cookie at all the visitor is not an admin; logout removes the session", async () => {
  assert.equal(await isAdmin(), false);
  await createSession("localhost:3000");
  assert.equal(await isAdmin(), true);
  assert.equal(await redirectOf(() => logout()), "/admin/login");
  assert.equal(await isAdmin(), false);
});

test("requireAdmin sends visitors who are not logged in to the login page", async () => {
  assert.equal(await redirectOf(() => requireAdmin()), "/admin/login");
  await createSession("localhost:3000");
  assert.equal(await redirectOf(() => requireAdmin()), null);
});

// ============================ login form ============================

test("login: wrong password is refused with a generic message and no session", async () => {
  const result = await login(null, loginForm("wrong-password"));
  assert.deepEqual(result, { error: "Incorrect password." });
  assert.equal(getCookie(COOKIE), undefined);
});

test("login: the right password creates a session and goes to the requests page", async () => {
  assert.equal(await redirectOf(() => login(null, loginForm(PASSWORD))), "/admin/requests");
  assert.equal(await isAdmin(), true);
});

test("login: a missing or non-text password is refused", async () => {
  assert.deepEqual(await login(null, new FormData()), { error: "Incorrect password." });
  const form = new FormData();
  form.set("password", new Blob(["x"]));
  assert.deepEqual(await login(null, form), { error: "Incorrect password." });
});

test("login: when admin is not configured it says so and creates nothing", async () => {
  delete process.env.ADMIN_PASSWORD;
  assert.deepEqual(await login(null, loginForm(PASSWORD)), { error: "Admin login is not set up on this server." });
  assert.equal(getCookie(COOKIE), undefined);
});

test("login: too many attempts from one address are blocked (even with the right password)", async () => {
  const results = [];
  for (let i = 0; i < 7; i++) results.push((await login(null, loginForm("wrong")))?.error);
  assert.deepEqual(results.slice(0, 5), Array(5).fill("Incorrect password."));
  assert.deepEqual(results.slice(5), Array(2).fill("Too many attempts. Please wait a few minutes."));
  assert.deepEqual(await login(null, loginForm(PASSWORD)), { error: "Too many attempts. Please wait a few minutes." });
  assert.equal(getCookie(COOKIE), undefined);
});

// ============================ admin-only actions ============================

test("admin actions refuse visitors who are not logged in", async () => {
  const to = (fn) => redirectOf(fn);
  assert.equal(await to(() => draftAction("R-AAAAAAAA", "C-AAAAAAAA")), "/admin/login");
  assert.equal(await to(() => linkAction("R-AAAAAAAA", "C-AAAAAAAA", "Hello there friend", true)), "/admin/login");
  assert.equal(await to(() => saveOutcomeAction({})), "/admin/login");
});

test("admin actions refuse forged cookies too", async () => {
  setCookie(COOKIE, "9999999999.fake");
  assert.equal(await redirectOf(() => saveOutcomeAction({})), "/admin/login");
});

test("logged in: saving an outcome works against a pretend Sheet and is recorded as TEST", async () => {
  const RID = "R-BBBBBBBB";
  const CID = "C-AAAAAAAA";
  const sheet = makeSheet({
    contractors: [contractorRow({ contractor_id: CID, record_type: "TEST", consent_version: ACCEPTED_CONSENT_VERSIONS[0] })],
    requests: [requestRow({ request_id: RID, record_type: "TEST", created_at: "2020-01-01T00:00:00.000Z" })],
  });
  setContractorSheetForTests(sheet);
  await createSession("localhost:3000");
  const result = await saveOutcomeAction({
    requestId: RID, contractorId: CID, messageSent: "no", contactAttemptedAt: "", reply: "",
    repliedAt: "", matchUsable: "", rating: null, failureReason: "", jobStarted: "",
  });
  assert.deepEqual(result, { ok: true, updated: false, responseMinutes: null });
  assert.equal(sheet.appended.length, 1);
  assert.equal(sheet.appended[0][1][1], "TEST");
});

test("logged in: a Google failure gives a safe error, not a crash or a false success", async () => {
  setContractorSheetForTests(makeSheet({ failWith: new Error("secret-detail") }));
  await createSession("localhost:3000");
  const original = console.error;
  const lines = [];
  console.error = (...a) => lines.push(a.join(" "));
  try {
    const result = await saveOutcomeAction({ requestId: "R-BBBBBBBB", contractorId: "C-AAAAAAAA", messageSent: "no" });
    assert.deepEqual(result, { ok: false, error: "unavailable" });
    assert.deepEqual(lines, ["[admin/outcome] save_failed"]);
  } finally {
    console.error = original;
  }
});
