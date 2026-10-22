// Tests for how the app signs in to Google Sheets: the original key method,
// the keyless "impersonation" method, the identity safety check, and safe
// failure logging.
//
// Everything here is offline and synthetic: made-up account names, made-up
// sign-in files in a temporary folder, and all network calls blocked and
// counted. The computer's real Google sign-in is never read, and no request is
// ever sent to Google. These tests therefore do NOT prove the real Google
// connection works; only a real read or write can show that.
import test, { after, afterEach, before, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import {
  NotConfiguredError,
  createSheet,
  getContractorSheet,
  httpStatusOf,
  projectIdFromServiceAccount,
  readAuthSettings,
  setContractorSheetForTests,
  verifyIdentity,
} from "../lib/google-sheets.ts";
import { captureErrors } from "./helpers/fakes.mjs";

// Synthetic values only.
const SHEET_ID = "synthetic-sheet-id";
const SA = "test-desk-server@synthetic-project.iam.gserviceaccount.com";
const OTHER_SA = "someone-else@other-project.iam.gserviceaccount.com";
const ENV_KEY = "\"-----BEGIN PRIVATE KEY-----\\nsynthetic-not-a-real-key\\n-----END PRIVATE KEY-----\\n\"";
const SAFE_LOG = /^\[sheets\] [a-z_]+( status=(\d{3}|unknown))?$/;

const reasonOf = (fn) => {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof NotConfiguredError, `expected NotConfiguredError, got ${error}`);
    return error.reason;
  }
  assert.fail("expected an error");
};

// ============================ settings ============================

describe("which sign-in method is used", () => {
  test("no method set + key -> the original key method, with the key cleaned up exactly as before", () => {
    const s = readAuthSettings({ GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA, GOOGLE_PRIVATE_KEY: ENV_KEY });
    assert.equal(s.method, "key");
    assert.equal(s.spreadsheetId, SHEET_ID);
    assert.equal(s.email, SA);
    assert.equal(s.key, "-----BEGIN PRIVATE KEY-----\nsynthetic-not-a-real-key\n-----END PRIVATE KEY-----\n");
  });

  test("'key' can also be chosen explicitly (spaces and capitals tolerated)", () => {
    for (const m of ["key", " KEY ", "Key"]) {
      assert.equal(readAuthSettings({ GOOGLE_AUTH_METHOD: m, GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA, GOOGLE_PRIVATE_KEY: ENV_KEY }).method, "key", m);
    }
  });

  test("'impersonation' with no key -> keyless method, and no key is carried", () => {
    const s = readAuthSettings({ GOOGLE_AUTH_METHOD: "impersonation", GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA });
    assert.deepEqual(s, { method: "impersonation", spreadsheetId: SHEET_ID, email: SA });
    for (const empty of ["", "   ", "\"\""]) {
      assert.equal(readAuthSettings({ GOOGLE_AUTH_METHOD: "impersonation", GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA, GOOGLE_PRIVATE_KEY: empty }).method, "impersonation", JSON.stringify(empty));
    }
  });

  test("'impersonation' while a key is filled in is refused (no ambiguity)", () => {
    assert.equal(reasonOf(() => readAuthSettings({ GOOGLE_AUTH_METHOD: "impersonation", GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA, GOOGLE_PRIVATE_KEY: ENV_KEY })), "key_with_impersonation");
  });

  test("an unknown method is refused, never guessed", () => {
    for (const m of ["oauth", "user", "impersonate", "auto", "adc"]) {
      assert.equal(reasonOf(() => readAuthSettings({ GOOGLE_AUTH_METHOD: m, GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA, GOOGLE_PRIVATE_KEY: ENV_KEY })), "unknown_auth_method", m);
    }
  });

  test("missing settings are refused with a clear reason, for both methods", () => {
    for (const method of [undefined, "key", "impersonation"]) {
      assert.equal(reasonOf(() => readAuthSettings({ GOOGLE_AUTH_METHOD: method, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA, GOOGLE_PRIVATE_KEY: method === "impersonation" ? "" : ENV_KEY })), "missing_sheet_id", String(method));
      assert.equal(reasonOf(() => readAuthSettings({ GOOGLE_AUTH_METHOD: method, GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_PRIVATE_KEY: method === "impersonation" ? "" : ENV_KEY })), "missing_service_account_email", String(method));
    }
    assert.equal(reasonOf(() => readAuthSettings({ GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA })), "missing_private_key");
    assert.equal(reasonOf(() => readAuthSettings({ GOOGLE_AUTH_METHOD: "key", GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA })), "missing_private_key");
    assert.equal(reasonOf(() => readAuthSettings({})), "missing_sheet_id");
  });

  test("the error type is unchanged for callers (a NotConfiguredError, with a safe reason label)", () => {
    const e = new NotConfiguredError();
    assert.ok(e instanceof Error);
    assert.equal(e.reason, "not_configured");
    assert.equal(new NotConfiguredError("identity_mismatch").message, "identity_mismatch");
  });

  test("the project is read from the service-account address (so no cloud-server probing)", () => {
    assert.equal(projectIdFromServiceAccount("example-server@example-project-123456.iam.gserviceaccount.com"), "example-project-123456");
    assert.equal(projectIdFromServiceAccount(SA), "synthetic-project");
    for (const odd of ["", "not-an-email", "a@gmail.com", "123-compute@developer.gserviceaccount.com", "a@x.iam.gserviceaccount.com"]) {
      assert.equal(projectIdFromServiceAccount(odd), undefined, odd);
    }
  });
});

// ============================ safe status extraction ============================

describe("numeric HTTP status for logs", () => {
  test("found in the usual places, and nothing else is ever taken from the error", () => {
    assert.equal(httpStatusOf({ response: { status: 403 } }), 403);
    assert.equal(httpStatusOf({ status: 404 }), 404);
    assert.equal(httpStatusOf({ code: "429" }), 429);
    assert.equal(httpStatusOf({ code: 500 }), 500);
    for (const nothing of [null, undefined, "403", 403, {}, { code: "ECONNRESET" }, { status: 99 }, { status: 600 }, { status: 403.5 }, { code: "4030" }]) {
      assert.equal(httpStatusOf(nothing), null, JSON.stringify(nothing));
    }
  });
});

// ============================ identity check ============================

describe("identity check (keyless method)", () => {
  let log;
  beforeEach(() => (log = captureErrors()));
  afterEach(() => log.restore());

  test("the configured service account passes (spaces and capitals tolerated); nothing is logged", async () => {
    await verifyIdentity(async () => ({ client_email: `  ${SA.toUpperCase()} ` }), SA);
    assert.deepEqual(log.lines, []);
  });

  test("a different account is refused", async () => {
    await assert.rejects(() => verifyIdentity(async () => ({ client_email: OTHER_SA }), SA), (e) => e instanceof NotConfiguredError && e.reason === "identity_mismatch");
    assert.deepEqual(log.lines, ["[sheets] sheets_identity_mismatch"]);
  });

  test("a person's own sign-in (no service-account address) is refused: never used as a fallback", async () => {
    for (const creds of [{}, { client_email: null }, { client_email: "" }, { client_email: "student@school.example" }]) {
      await assert.rejects(() => verifyIdentity(async () => creds, SA), (e) => e.reason === "identity_mismatch", JSON.stringify(creds));
    }
  });

  test("if the sign-in cannot be read, it fails closed and logs only a label", async () => {
    const secretish = Object.assign(new Error(`token ya29.SECRET for ${SA} at C:\\Users\\someone\\adc.json`), { response: { status: 401 } });
    await assert.rejects(() => verifyIdentity(async () => { throw secretish; }, SA), (e) => e.reason === "impersonation_unavailable");
    assert.deepEqual(log.lines, ["[sheets] sheets_impersonation_unavailable status=401"]);
  });

  test("identity logs never contain an email address", async () => {
    await assert.rejects(() => verifyIdentity(async () => ({ client_email: OTHER_SA }), SA));
    for (const line of log.lines) {
      assert.ok(!line.includes("@"), line);
      assert.match(line, SAFE_LOG);
    }
  });
});

// ============================ the Sheet operations ============================

function fakeApi(overrides = {}) {
  const calls = [];
  return {
    calls,
    async batchGet(params) {
      calls.push(["batchGet", params]);
      if (overrides.batchGet) return overrides.batchGet(params);
      return { data: { valueRanges: [{ values: [["a", 1, true]] }, {}] } };
    },
    async append(params) {
      calls.push(["append", params]);
      if (overrides.append) return overrides.append(params);
      return {};
    },
    async update(params) {
      calls.push(["update", params]);
      if (overrides.update) return overrides.update(params);
      return {};
    },
  };
}

describe("Sheet operations: same behaviour as before, now behind the identity check", () => {
  let log;
  beforeEach(() => (log = captureErrors()));
  afterEach(() => log.restore());

  test("read, append and update send the same settings as before", async () => {
    const api = fakeApi();
    const sheet = createSheet(api, SHEET_ID, async () => {});
    assert.deepEqual(await sheet.read(["Contractors!1:1", "Contractors!B2:B"]), [[["a", "1", "true"]], []]);
    await sheet.append("Contractors!A1", ["x", "y"]);
    await sheet.update("Outcomes!A2:O2", ["z"]);
    assert.deepEqual(api.calls, [
      ["batchGet", { spreadsheetId: SHEET_ID, ranges: ["Contractors!1:1", "Contractors!B2:B"], valueRenderOption: "FORMATTED_VALUE" }],
      ["append", { spreadsheetId: SHEET_ID, range: "Contractors!A1", valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: [["x", "y"]] } }],
      ["update", { spreadsheetId: SHEET_ID, range: "Outcomes!A2:O2", valueInputOption: "RAW", requestBody: { values: [["z"]] } }],
    ]);
    assert.deepEqual(log.lines, []);
  });

  test("the check runs before EVERY operation", async () => {
    const order = [];
    const api = fakeApi();
    const sheet = createSheet(
      { batchGet: (p) => (order.push("request"), api.batchGet(p)), append: (p) => (order.push("request"), api.append(p)), update: (p) => (order.push("request"), api.update(p)) },
      SHEET_ID,
      async () => order.push("check"),
    );
    await sheet.read(["A!1:1"]);
    await sheet.append("A!A1", ["x"]);
    await sheet.update("A!A2:A2", ["y"]);
    assert.deepEqual(order, ["check", "request", "check", "request", "check", "request"]);
  });

  test("if the check fails, NOTHING is sent to Google (fail closed)", async () => {
    const api = fakeApi();
    const sheet = createSheet(api, SHEET_ID, async () => { throw new NotConfiguredError("identity_mismatch"); });
    for (const op of [() => sheet.read(["A!1:1"]), () => sheet.append("A!A1", ["x"]), () => sheet.update("A!A2:A2", ["y"])]) {
      await assert.rejects(op, (e) => e.reason === "identity_mismatch");
    }
    assert.equal(api.calls.length, 0);
  });

  test("a Google failure logs ONLY a label and the numeric status, then is passed on unchanged", async () => {
    const failure = Object.assign(new Error(`Requested entity was not found. ${SA} Bearer ya29.SECRET cell "Test Person 9000000001"`), { response: { status: 404, data: { secret: "body" } } });
    const sheet = createSheet(fakeApi({ append: async () => { throw failure; } }), SHEET_ID, async () => {});
    await assert.rejects(() => sheet.append("A!A1", ["Test Person", "+919000000001"]), (e) => e === failure);
    assert.deepEqual(log.lines, ["[sheets] sheets_request_failed status=404"]);
  });

  test("status found in other places, or not at all", async () => {
    const cases = [[{ code: "403" }, "status=403"], [{ status: 429 }, "status=429"], [new Error("socket hang up"), "status=unknown"]];
    for (const [error, expected] of cases) {
      const sheet = createSheet(fakeApi({ batchGet: async () => { throw error; } }), SHEET_ID, async () => {});
      await assert.rejects(() => sheet.read(["A!1:1"]));
      assert.equal(log.lines.at(-1), `[sheets] sheets_request_failed ${expected}`);
    }
    for (const line of log.lines) assert.match(line, SAFE_LOG);
  });
});

// ============================ the real module, offline ============================

const ENV_NAMES = ["GOOGLE_SHEET_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_AUTH_METHOD", "GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT"];

describe("getContractorSheet, offline (synthetic sign-in files, network blocked)", () => {
  const saved = {};
  const originals = {};
  let attempts;
  let dir;
  let log;

  const block = (where) => () => {
    attempts.push(where);
    throw new Error("network is blocked in tests");
  };
  const setEnv = (values) => {
    for (const k of ENV_NAMES) delete process.env[k];
    Object.assign(process.env, values);
  };
  const writeCredentials = (name, content) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, JSON.stringify(content));
    return file;
  };
  const impersonationFile = (target) =>
    writeCredentials(`imp-${target.split("@")[0]}.json`, {
      type: "impersonated_service_account",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${target}:generateAccessToken`,
      source_credentials: { type: "authorized_user", client_id: "synthetic", client_secret: "synthetic", refresh_token: "synthetic" },
      delegates: [],
    });

  before(() => {
    for (const k of ENV_NAMES) saved[k] = process.env[k];
    originals.fetch = globalThis.fetch;
    originals.httpRequest = http.request;
    originals.httpsRequest = https.request;
    originals.httpGet = http.get;
    originals.httpsGet = https.get;
    globalThis.fetch = block("fetch");
    http.request = block("http.request");
    https.request = block("https.request");
    http.get = block("http.get");
    https.get = block("https.get");
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "contractor-desk-auth-test-"));
  });
  after(() => {
    globalThis.fetch = originals.fetch;
    http.request = originals.httpRequest;
    https.request = originals.httpsRequest;
    http.get = originals.httpGet;
    https.get = originals.httpsGet;
    for (const k of ENV_NAMES) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    fs.rmSync(dir, { recursive: true, force: true });
    setContractorSheetForTests(null);
  });
  beforeEach(() => {
    attempts = [];
    setContractorSheetForTests(null);
    log = captureErrors();
  });
  afterEach(() => log.restore());

  test("UNCHANGED key method: builds the Sheet without any network call", () => {
    setEnv({ GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA, GOOGLE_PRIVATE_KEY: ENV_KEY });
    const sheet = getContractorSheet();
    assert.equal(typeof sheet.read, "function");
    assert.equal(typeof sheet.append, "function");
    assert.equal(typeof sheet.update, "function");
    assert.equal(getContractorSheet(), sheet, "the same Sheet object is reused");
    assert.deepEqual(attempts, []);
    assert.deepEqual(log.lines, []);
  });

  test("UNCHANGED: missing settings still raise NotConfiguredError and add no new log line", () => {
    for (const env of [{}, { GOOGLE_SHEET_ID: SHEET_ID }, { GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA }]) {
      setEnv(env);
      assert.throws(() => getContractorSheet(), NotConfiguredError);
    }
    assert.deepEqual(log.lines, []);
  });

  test("key filled in while impersonation is chosen: refused and labelled", () => {
    setEnv({ GOOGLE_AUTH_METHOD: "impersonation", GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA, GOOGLE_PRIVATE_KEY: ENV_KEY });
    assert.throws(() => getContractorSheet(), (e) => e.reason === "key_with_impersonation");
    assert.deepEqual(log.lines, ["[sheets] sheets_auth_conflict"]);
  });

  test("unknown method: refused and labelled", () => {
    setEnv({ GOOGLE_AUTH_METHOD: "auto", GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA, GOOGLE_PRIVATE_KEY: ENV_KEY });
    assert.throws(() => getContractorSheet(), (e) => e.reason === "unknown_auth_method");
    assert.deepEqual(log.lines, ["[sheets] sheets_auth_method_invalid"]);
  });

  test("keyless, signed in as a DIFFERENT service account: every operation is refused, nothing reaches the network", async () => {
    setEnv({ GOOGLE_AUTH_METHOD: "impersonation", GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA, GOOGLE_APPLICATION_CREDENTIALS: impersonationFile(OTHER_SA) });
    const sheet = getContractorSheet();
    await assert.rejects(() => sheet.read(["Contractors!1:1"]), (e) => e.reason === "identity_mismatch");
    await assert.rejects(() => sheet.append("Contractors!A1", ["x"]), (e) => e.reason === "identity_mismatch");
    await assert.rejects(() => sheet.update("Outcomes!A2:O2", ["x"]), (e) => e.reason === "identity_mismatch");
    assert.deepEqual(attempts, [], "a network call was attempted");
    assert.deepEqual(log.lines, Array(3).fill("[sheets] sheets_identity_mismatch"), "a failed check is not remembered; each request checks again");
  });

  test("keyless, but the computer is signed in as a PERSON (no impersonation): refused, never used as a fallback", async () => {
    setEnv({ GOOGLE_AUTH_METHOD: "impersonation", GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA,
      GOOGLE_APPLICATION_CREDENTIALS: writeCredentials("person.json", { type: "authorized_user", client_id: "synthetic", client_secret: "synthetic", refresh_token: "synthetic" }) });
    await assert.rejects(() => getContractorSheet().append("Contractors!A1", ["x"]), (e) => e.reason === "identity_mismatch");
    assert.deepEqual(attempts, []);
    assert.deepEqual(log.lines, ["[sheets] sheets_identity_mismatch"]);
  });

  test("keyless, but there is no sign-in at all: refused (fails closed), nothing reaches the network", async () => {
    setEnv({ GOOGLE_AUTH_METHOD: "impersonation", GOOGLE_SHEET_ID: SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL: SA, GOOGLE_APPLICATION_CREDENTIALS: path.join(dir, "missing.json") });
    await assert.rejects(() => getContractorSheet().read(["Contractors!1:1"]), (e) => e.reason === "impersonation_unavailable");
    assert.deepEqual(attempts, []);
    assert.deepEqual(log.lines, ["[sheets] sheets_impersonation_unavailable status=unknown"]);
  });

  test("the library reads the configured identity from a correct keyless sign-in, offline", async () => {
    // Only the identity is checked here: no Sheet operation is run, because a
    // matching identity would go on to contact Google.
    const { auth } = await import("@googleapis/sheets");
    setEnv({ GOOGLE_APPLICATION_CREDENTIALS: impersonationFile(SA) });
    const googleAuth = new auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/spreadsheets"], projectId: projectIdFromServiceAccount(SA) });
    await verifyIdentity(() => googleAuth.getCredentials(), SA);
    assert.deepEqual(attempts, []);
    assert.deepEqual(log.lines, []);
  });

  test("every log line from this file has the safe shape (label + optional numeric status)", () => {
    for (const line of log.lines) assert.match(line, SAFE_LOG);
  });
});
