// Server-only: reads secrets from environment variables. Never import this
// file from a component marked "use client".
import { auth, sheets } from "@googleapis/sheets";
import type { sheets_v4 } from "@googleapis/sheets";
import type { ContractorSheet } from "./contractor-store";
import { fixtureSheet, fixturesEnabled } from "./fixtures";
import type { RecordType } from "./registration";

// The Sheet cannot be used. `reason` is a short, stable label that is safe to
// log; it never contains secrets, emails or other personal information.
export class NotConfiguredError extends Error {
  readonly reason: string;
  constructor(reason = "not_configured") {
    super(reason);
    this.reason = reason;
  }
}

// True only on a production build that is explicitly set to REAL data. On
// Vercel it must also be the Production deployment, so a preview deployment
// can never create or contact REAL records even if the variable is set there.
// Local `npm run dev` can never be REAL, and the browser has no say in it.
export function isRealMode(): boolean {
  if (process.env.REGISTRATION_RECORD_TYPE !== "REAL") return false;
  if (process.env.NODE_ENV !== "production") return false;
  const vercelEnv = process.env.VERCEL_ENV; // set by Vercel only
  return vercelEnv === undefined || vercelEnv === "production";
}

export function getRecordType(): RecordType {
  return isRealMode() ? "REAL" : "TEST";
}

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

// ---------------------------------------------------------------------------
// Which way to sign in to Google
// ---------------------------------------------------------------------------
//
// GOOGLE_AUTH_METHOD
//   empty or "key"   -> sign in with the service account's private key
//                       (GOOGLE_PRIVATE_KEY). This is the original behaviour.
//   "impersonation"  -> keyless, for local use: act as the service account
//                       using the computer's Google sign-in ("Application
//                       Default Credentials" set up with
//                       `gcloud auth application-default login
//                        --impersonate-service-account=...`).
// Anything else is refused. The app never picks a method by itself.

export type AuthSettings =
  | { method: "key"; spreadsheetId: string; email: string; key: string }
  | { method: "impersonation"; spreadsheetId: string; email: string };

export function readAuthSettings(env: Record<string, string | undefined>): AuthSettings {
  const spreadsheetId = env.GOOGLE_SHEET_ID?.trim();
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const method = (env.GOOGLE_AUTH_METHOD ?? "").trim().toLowerCase();
  // The key is stored in one line with literal "\n" markers; turn them back
  // into real line breaks, and tolerate surrounding quotes.
  const key =
    env.GOOGLE_PRIVATE_KEY?.trim()
      .replace(/^"|"$/g, "")
      .replace(/\\n/g, "\n") ?? "";

  if (method !== "" && method !== "key" && method !== "impersonation") {
    throw new NotConfiguredError("unknown_auth_method");
  }
  if (!spreadsheetId) throw new NotConfiguredError("missing_sheet_id");
  if (!email) throw new NotConfiguredError("missing_service_account_email");

  if (method === "impersonation") {
    // Two sign-in methods at once would be ambiguous: refuse.
    if (key) throw new NotConfiguredError("key_with_impersonation");
    return { method: "impersonation", spreadsheetId, email };
  }
  if (!key) throw new NotConfiguredError("missing_private_key");
  return { method: "key", spreadsheetId, email, key };
}

// "name@my-project.iam.gserviceaccount.com" -> "my-project". Telling the auth
// library the project up front stops it probing Google's cloud-server metadata
// address, which does not exist on a laptop.
export function projectIdFromServiceAccount(email: string): string | undefined {
  const m = /^[^@\s]+@([a-z][a-z0-9-]{4,28}[a-z0-9])\.iam\.gserviceaccount\.com$/i.exec(email.trim());
  return m ? m[1].toLowerCase() : undefined;
}

// ---------------------------------------------------------------------------
// Safe logging: a stable label and, when known, the numeric HTTP status only.
// Never the error message, tokens, credentials, headers, bodies, cell values,
// emails or any other personal information.
// ---------------------------------------------------------------------------

export function httpStatusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const e = error as { status?: unknown; code?: unknown; response?: { status?: unknown } };
  for (const candidate of [e.response?.status, e.status, e.code]) {
    const n =
      typeof candidate === "string" && /^\d{3}$/.test(candidate) ? Number(candidate) : candidate;
    if (typeof n === "number" && Number.isInteger(n) && n >= 100 && n <= 599) return n;
  }
  return null;
}

function logFailure(label: string, error?: unknown): void {
  const status = error === undefined ? "" : ` status=${httpStatusOf(error) ?? "unknown"}`;
  console.error(`[sheets] ${label}${status}`);
}

// ---------------------------------------------------------------------------
// Identity check for keyless sign-in
// ---------------------------------------------------------------------------

// Confirms the account Google will act as is exactly the configured service
// account. If the computer's sign-in is a person's own account (which reports
// no service-account email), or any other account, it refuses: the Sheet is
// never reached with the wrong identity.
export async function verifyIdentity(
  getCredentials: () => Promise<{ client_email?: string | null }>,
  expectedEmail: string,
): Promise<void> {
  let actual: string | null | undefined;
  try {
    actual = (await getCredentials()).client_email;
  } catch (error) {
    logFailure("sheets_impersonation_unavailable", error);
    throw new NotConfiguredError("impersonation_unavailable");
  }
  if (!actual || actual.trim().toLowerCase() !== expectedEmail.trim().toLowerCase()) {
    logFailure("sheets_identity_mismatch");
    throw new NotConfiguredError("identity_mismatch");
  }
}

// ---------------------------------------------------------------------------
// The Sheet operations (unchanged behaviour), wrapped with the identity check
// and safe failure logging.
// ---------------------------------------------------------------------------

// The three Google Sheets calls the app uses, so they can be replaced in tests.
export interface SheetsValuesApi {
  batchGet(params: {
    spreadsheetId: string;
    ranges: string[];
    valueRenderOption: string;
  }): Promise<{ data: { valueRanges?: { values?: unknown[][] | null }[] | null } }>;
  append(params: {
    spreadsheetId: string;
    range: string;
    valueInputOption: string;
    insertDataOption: string;
    requestBody: { values: string[][] };
  }): Promise<unknown>;
  update(params: {
    spreadsheetId: string;
    range: string;
    valueInputOption: string;
    requestBody: { values: string[][] };
  }): Promise<unknown>;
  // Used only by the one-time setup step.
  tabTitles?(spreadsheetId: string): Promise<string[]>;
  addTab?(spreadsheetId: string, title: string): Promise<unknown>;
}

// Google allows about 60 Sheet reads a minute. One operator page reads several
// ranges, so a few quick clicks could hit that limit ("429 Too Many Requests").
// Two things keep the app under it:
//   - readCacheMs: identical reads within this many milliseconds share one
//     answer (and one request in flight). Any write clears the cache at once,
//     so a page never shows data older than its own last save.
//   - retries: a 429 (or a passing 5xx) is retried after a short pause. Google
//     rejected those requests, so retrying a write cannot save it twice.
export type SheetOptions = { readCacheMs?: number; retries?: number; pause?: (ms: number) => Promise<void> };
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

export function createSheet(
  api: SheetsValuesApi,
  spreadsheetId: string,
  beforeRequest: () => Promise<void>,
  options: SheetOptions = {},
): ContractorSheet {
  const { readCacheMs = 0, retries = 0 } = options;
  const pause = options.pause ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const reads = new Map<string, { at: number; value: Promise<string[][][]> }>();

  async function call<T>(operation: () => Promise<T>): Promise<T> {
    // Runs first, every time. If it fails, no request is sent to Google.
    await beforeRequest();
    for (let attempt = 0; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const status = httpStatusOf(error);
        if (attempt < retries && status !== null && RETRY_STATUSES.has(status)) {
          await pause(1000 * 2 ** attempt + Math.floor(Math.random() * 250));
          continue;
        }
        logFailure("sheets_request_failed", error);
        throw error;
      }
    }
  }
  // Every write goes through here so cached reads are dropped first.
  const write = <T>(operation: () => Promise<T>) => {
    reads.clear();
    return call(operation).finally(() => reads.clear());
  };

  const readNow = (ranges: string[]) =>
    call(async () => {
      const res = await api.batchGet({
        spreadsheetId,
        ranges,
        valueRenderOption: "FORMATTED_VALUE",
      });
      return (res.data.valueRanges ?? []).map((r) =>
        (r.values ?? []).map((row) => row.map((cell) => String(cell))),
      );
    });

  return {
    read: (ranges) => {
      if (readCacheMs <= 0) return readNow(ranges);
      const key = JSON.stringify(ranges);
      const now = Date.now();
      const hit = reads.get(key);
      if (hit && now - hit.at < readCacheMs) return hit.value.then((grids) => grids.map((g) => g.map((row) => [...row])));
      const value = readNow(ranges);
      reads.set(key, { at: now, value });
      value.catch(() => reads.delete(key)); // a failure is never reused
      return value.then((grids) => grids.map((g) => g.map((row) => [...row])));
    },
    append: (range, row) =>
      write(async () => {
        await api.append({
          spreadsheetId,
          range,
          // RAW: store text exactly as given; never interpret it as a formula.
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: [row] },
        });
      }),
    update: (range, row) =>
      write(async () => {
        await api.update({
          spreadsheetId,
          range,
          valueInputOption: "RAW",
          requestBody: { values: [row] },
        });
      }),
    ...(api.tabTitles
      ? { listTabs: () => call(() => api.tabTitles!(spreadsheetId)) }
      : {}),
    ...(api.addTab
      ? {
          addTab: (title: string) =>
            write(async () => {
              await api.addTab!(spreadsheetId, title);
            }),
        }
      : {}),
  };
}

function valuesApiOf(client: sheets_v4.Sheets): SheetsValuesApi {
  const values = client.spreadsheets.values;
  return {
    batchGet: (params) => values.batchGet(params),
    append: (params) => values.append(params),
    update: (params) => values.update(params),
    tabTitles: async (spreadsheetId) => {
      const res = await client.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties.title",
      });
      return (res.data.sheets ?? []).flatMap((s) => (s.properties?.title ? [s.properties.title] : []));
    },
    addTab: (spreadsheetId, title) =>
      client.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title } } }] },
      }),
  };
}

let cached: ContractorSheet | null = null;

// The real Sheet: identical reads within 15 seconds are shared, and a "too many
// requests" answer is retried up to 5 times (after about 1, 2, 4, 8 and 16
// seconds), which covers Google's one-minute quota window.
const LIVE_SHEET_OPTIONS: SheetOptions = { readCacheMs: 15_000, retries: 5 };

// Lets automated tests swap in a pretend Sheet so the API routes can be tested
// without Google. It refuses to work unless NODE_ENV is "test", which Next.js
// never uses, so it cannot be switched on in development or production.
export function setContractorSheetForTests(sheet: ContractorSheet | null): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setContractorSheetForTests is only available in tests");
  }
  cached = sheet;
}

// Settings problems that only the new sign-in options can cause get their own
// log label. (Missing basics are already logged by the caller as
// "sheets_not_configured".)
const LOGGED_REASONS: Record<string, string> = {
  key_with_impersonation: "sheets_auth_conflict",
  unknown_auth_method: "sheets_auth_method_invalid",
};

export function getContractorSheet(): ContractorSheet {
  if (cached) return cached;
  // Local fixture mode (see lib/fixtures.ts): an in-memory Sheet of made-up
  // records. It cannot switch on in production, on Vercel, or for REAL data.
  if (fixturesEnabled()) return fixtureSheet();

  let settings: AuthSettings;
  try {
    settings = readAuthSettings(process.env);
  } catch (error) {
    if (error instanceof NotConfiguredError && LOGGED_REASONS[error.reason]) {
      logFailure(LOGGED_REASONS[error.reason]);
    }
    throw error;
  }

  if (settings.method === "key") {
    const client = sheets({
      version: "v4",
      auth: new auth.JWT({
        email: settings.email,
        key: settings.key,
        scopes: [SHEETS_SCOPE],
      }),
    });
    cached = createSheet(valuesApiOf(client), settings.spreadsheetId, async () => {}, LIVE_SHEET_OPTIONS);
    return cached;
  }

  // Keyless: act as the service account through the computer's sign-in.
  const expectedEmail = settings.email;
  const googleAuth = new auth.GoogleAuth({
    scopes: [SHEETS_SCOPE],
    projectId: projectIdFromServiceAccount(expectedEmail),
  });
  const client = sheets({ version: "v4", auth: googleAuth });

  // Checked before the first request. Only a success is remembered, so after
  // fixing the sign-in the next request checks again.
  let verified: Promise<void> | null = null;
  const verifyOnce = () => {
    if (!verified) {
      verified = verifyIdentity(() => googleAuth.getCredentials(), expectedEmail).catch(
        (error: unknown) => {
          verified = null;
          throw error;
        },
      );
    }
    return verified;
  };

  cached = createSheet(valuesApiOf(client), settings.spreadsheetId, verifyOnce, LIVE_SHEET_OPTIONS);
  return cached;
}
