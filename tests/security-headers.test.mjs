import test from "node:test";
import assert from "node:assert/strict";
import { contentSecurityPolicy, securityHeaders } from "../lib/security-headers.ts";
import nextConfig from "../next.config.ts";

const valueOf = (headers, key) => headers.find((h) => h.key === key)?.value;
const directives = (csp) =>
  Object.fromEntries(csp.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));

test("production headers: all the basic ones are present", () => {
  const h = securityHeaders(false);
  for (const key of [
    "Content-Security-Policy",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
    "Strict-Transport-Security",
  ]) {
    assert.ok(valueOf(h, key), `missing ${key}`);
  }
  assert.equal(valueOf(h, "X-Content-Type-Options"), "nosniff");
  assert.equal(valueOf(h, "X-Frame-Options"), "DENY");
  assert.equal(valueOf(h, "Referrer-Policy"), "no-referrer");
  assert.equal(new Set(h.map((x) => x.key)).size, h.length, "duplicate header names");
});

test("HTTPS header is sent in production only (development must stay plain http-friendly)", () => {
  assert.match(valueOf(securityHeaders(false), "Strict-Transport-Security"), /^max-age=\d+$/);
  assert.equal(valueOf(securityHeaders(true), "Strict-Transport-Security"), undefined);
});

test("CSP: framing, plugins, base tag and form targets are locked down", () => {
  for (const isDev of [true, false]) {
    const d = directives(contentSecurityPolicy(isDev));
    assert.deepEqual(d["frame-ancestors"], ["'none'"]);
    assert.deepEqual(d["object-src"], ["'none'"]);
    assert.deepEqual(d["base-uri"], ["'self'"]);
    assert.deepEqual(d["form-action"], ["'self'"]);
    assert.deepEqual(d["default-src"], ["'self'"]);
  }
});

test("CSP: nothing may load from or connect to other websites", () => {
  for (const isDev of [true, false]) {
    const csp = contentSecurityPolicy(isDev);
    assert.ok(!/https?:\/\//.test(csp), "an outside web address is allowed");
    assert.ok(!/(^| )\*( |;|$)/.test(csp), "a wildcard source is allowed");
    assert.deepEqual(directives(csp)["img-src"].filter((s) => !["'self'", "data:", "blob:"].includes(s)), []);
  }
});

test("CSP: 'unsafe-eval' and websockets are allowed only in development", () => {
  const prod = directives(contentSecurityPolicy(false));
  const dev = directives(contentSecurityPolicy(true));
  assert.ok(!prod["script-src"].includes("'unsafe-eval'"));
  assert.ok(!prod["connect-src"].some((s) => s.startsWith("ws")));
  assert.ok(dev["script-src"].includes("'unsafe-eval'"));
  assert.ok(dev["connect-src"].includes("ws:"));
});

test("CSP keeps 'unsafe-inline' for scripts (documented trade-off), so it is not a full script-injection defence", () => {
  assert.ok(directives(contentSecurityPolicy(false))["script-src"].includes("'unsafe-inline'"));
});

test("Permissions-Policy switches off camera, microphone, location, payment and USB", () => {
  const p = valueOf(securityHeaders(false), "Permissions-Policy");
  for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
    assert.ok(p.includes(`${feature}=()`), feature);
  }
});

test("next.config.ts sends these headers on every route", async () => {
  assert.equal(typeof nextConfig.headers, "function");
  const rules = await nextConfig.headers();
  assert.equal(rules.length, 1);
  assert.equal(rules[0].source, "/(.*)");
  const isDev = process.env.NODE_ENV !== "production";
  assert.deepEqual(rules[0].headers, securityHeaders(isDev));
});
