import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, newId, sameOrigin } from "../lib/http.ts";

const req = (ip) =>
  new Request("http://localhost/x", { method: "POST", headers: ip ? { "x-forwarded-for": ip } : {} });

test("allows the limit, then blocks", () => {
  const limited = createRateLimiter(3, 60_000);
  assert.deepEqual([1, 2, 3, 4, 5].map(() => limited(req("198.51.100.1"))), [false, false, false, true, true]);
});

test("each caller address has its own counter", () => {
  const limited = createRateLimiter(1, 60_000);
  assert.equal(limited(req("198.51.100.1")), false);
  assert.equal(limited(req("198.51.100.1")), true);
  assert.equal(limited(req("198.51.100.2")), false);
});

test("only the first address in x-forwarded-for is used", () => {
  const limited = createRateLimiter(1, 60_000);
  assert.equal(limited(req("198.51.100.7, 10.0.0.1")), false);
  assert.equal(limited(req("198.51.100.7, 10.0.0.99")), true);
});

test("callers with no address share one bucket (so it fails towards blocking)", () => {
  const limited = createRateLimiter(1, 60_000);
  assert.equal(limited(req()), false);
  assert.equal(limited(req()), true);
});

test("a plain text key works too (used by the login form)", () => {
  const limited = createRateLimiter(2, 60_000);
  assert.deepEqual([1, 2, 3].map(() => limited("some-key")), [false, false, true]);
});

test("the counter resets after the time window", () => {
  mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  try {
    const limited = createRateLimiter(1, 10_000);
    assert.equal(limited("k"), false);
    assert.equal(limited("k"), true);
    mock.timers.tick(10_001);
    assert.equal(limited("k"), false);
  } finally {
    mock.timers.reset();
  }
});

test("LIMITATION: counters live inside one running copy of the app and are not shared", () => {
  // Two limiters stand in for two server instances. Each starts from zero, so
  // a caller can get the full allowance again from the other one. This is why
  // the in-memory limiter is only a speed bump on hosting with many instances.
  const instanceA = createRateLimiter(1, 60_000);
  const instanceB = createRateLimiter(1, 60_000);
  assert.equal(instanceA(req("198.51.100.9")), false);
  assert.equal(instanceA(req("198.51.100.9")), true);
  assert.equal(instanceB(req("198.51.100.9")), false);
});

test("sameOrigin: same site and non-browser callers pass, other sites do not", () => {
  const make = (origin, host = "localhost:3000") =>
    new Request("http://localhost:3000/x", { method: "POST", headers: { host, ...(origin ? { origin } : {}) } });
  assert.equal(sameOrigin(make("http://localhost:3000")), true);
  assert.equal(sameOrigin(make(undefined)), true);
  assert.equal(sameOrigin(make("https://evil.example")), false);
  assert.equal(sameOrigin(make("not a url")), false);
});

test("newId: readable format, no confusing characters, unique", () => {
  const ids = new Set(Array.from({ length: 500 }, () => newId("R")));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^R-[A-HJKMNP-TV-Z2-9]{8}$/);
});
