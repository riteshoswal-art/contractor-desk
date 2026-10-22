// Local-only "fixture mode": the app runs against an in-memory spreadsheet full
// of made-up records, so every screen can be tried in a browser without touching
// the real Google Sheet. It is safe by construction:
//
//   - it needs CONTRACTOR_DESK_FIXTURES=1 AND the Next.js development server
//     (NODE_ENV "development"): a production build can never switch it on;
//   - it is refused on Vercel, and whenever the server is set to REAL data;
//   - every record is labelled TEST, and the admin pages say FIXTURE MODE;
//   - nothing is ever written anywhere: the data is lost when the server stops.
import fs from "node:fs";
import path from "node:path";
import { CONFIRMATION_TABLE } from "./confirmation";
import { demoState, emptyDemoState, onDemoChange, setDemoState, type DemoState } from "./demo-store";
import { ensureDemoSeed } from "./demo-seed";
import { createMemorySheet, type MemorySheet } from "./memory-sheet";
import { REQUIRED_TABLES } from "./sheet-setup";
import { OUTCOME_HEADERS } from "./outcome";
import { CONSENT_VERSION, CONTRACTOR_HEADERS } from "./registration";
import { REQUEST_HEADERS } from "./request";

export function fixturesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (
    env.CONTRACTOR_DESK_FIXTURES === "1" &&
    env.NODE_ENV === "development" &&
    !env.VERCEL &&
    env.REGISTRATION_RECORD_TYPE !== "REAL"
  );
}

const row = (headers: readonly string[], o: Record<string, string>) => headers.map((h) => o[h] ?? "");
const addDays = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);

// Three made-up contractors and one made-up request, with dates relative to today
// so the matching rules always have something to show:
//   Asha: available now                     -> an exact-date match
//   Bhim: available from the day AFTER      -> a near-date match ("needs confirmation")
//   Chitra: an electrician                  -> a different trade, never a match
export function buildFixtureSheet(): MemorySheet {
  const nowIso = new Date().toISOString();
  const contractor = (o: Record<string, string>) =>
    row(CONTRACTOR_HEADERS, {
      record_type: "TEST",
      created_at: nowIso,
      primary_trade: "Masonry",
      service_areas: "Baner",
      consent_version: CONSENT_VERSION,
      consent_text: "Synthetic fixture consent",
      consent_timestamp: nowIso,
      availability_reported_at: nowIso,
      ...o,
    });
  const tabs: Record<string, string[][]> = {
    Contractors: [
      [...CONTRACTOR_HEADERS],
      contractor({ contractor_id: "C-ASHAASHA", name: "Asha (fixture)", availability_status: "now", phone: "+919000000011" }),
      contractor({ contractor_id: "C-BHIMBHIM", name: "Bhim (fixture)", availability_status: "from_date", earliest_start_date: addDays(6), phone: "+919000000012" }),
      contractor({ contractor_id: "C-CHITRACH", name: "Chitra (fixture)", primary_trade: "Electrical", availability_status: "now", phone: "+919000000013" }),
    ],
    Requests: [
      [...REQUEST_HEADERS],
      row(REQUEST_HEADERS, {
        request_id: "R-FIXTURE2", record_type: "TEST", created_at: nowIso, developer_name: "Fixture Developer", contact_phone: "+919000000099",
        description: "FIXTURE: a made-up masonry job in Baner. No real person is involved.", trade: "Masonry", service_area: "Baner",
        start_date: addDays(5), duration_days: "7", extraction_source: "manual", consent_version: "r2-2026-10-22",
        consent_text: "Synthetic fixture consent", consent_timestamp: nowIso, status: "New requirement",
      }),
    ],
    Outcomes: [[...OUTCOME_HEADERS]],
  };
  for (const table of REQUIRED_TABLES) tabs[table.tab] = [[...table.headers]];
  tabs[CONFIRMATION_TABLE.tab] ??= [[...CONFIRMATION_TABLE.headers]];
  return createMemorySheet(tabs);
}

// One fixture sheet per server, shared by every page and action (kept on
// globalThis because the development server may load a module more than once).
//
// Optional local save for the live demo: when CONTRACTOR_DESK_FIXTURE_FILE is
// set (npm run demo sets it to .demo-data/fixture-state.json, which Git
// ignores), the made-up records and the demo's Telegram links are written to
// that file after every change and loaded again on the next start, so a
// rehearsal survives a restart. `npm run demo:reset` deletes it. It never
// touches Google Sheets.
const KEY = "__contractorDeskFixtureSheet";
type Snapshot = { version: 1; tabs: Record<string, string[][]>; demo: DemoState };

function isGrid(v: unknown): v is string[][] {
  return Array.isArray(v) && v.every((row) => Array.isArray(row) && row.every((c) => typeof c === "string"));
}

export function loadSnapshot(file: string): Snapshot | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Snapshot>;
    if (parsed.version !== 1 || !parsed.tabs || typeof parsed.tabs !== "object") return null;
    if (!Object.values(parsed.tabs).every(isGrid)) return null;
    return { version: 1, tabs: parsed.tabs, demo: { ...emptyDemoState(), ...(parsed.demo ?? {}) } };
  } catch {
    return null; // no file yet, or unreadable: start fresh
  }
}

export function saveSnapshot(file: string, tabs: Record<string, string[][]>) {
  const snapshot: Snapshot = { version: 1, tabs, demo: demoState() };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(snapshot), "utf8");
  fs.renameSync(tmp, file);
}

export function fixtureSheet(): MemorySheet {
  const holder = globalThis as unknown as Record<string, MemorySheet | undefined>;
  if (holder[KEY]) return holder[KEY];
  const file = (process.env.CONTRACTOR_DESK_FIXTURE_FILE ?? "").trim();
  if (!file) {
    const plain = buildFixtureSheet();
    ensureDemoSeed(plain.tabs); // the labelled live-demo contractors (lib/demo-seed.ts)
    return (holder[KEY] = plain);
  }

  const saved = loadSnapshot(file);
  if (saved) setDemoState(saved.demo);
  // Tabs added since the file was saved (for example a newer feature) are created empty.
  const fresh = buildFixtureSheet().tabs;
  const tabs = saved ? { ...fresh, ...saved.tabs } : fresh;
  ensureDemoSeed(tabs); // adds the labelled live-demo contractors if missing (lib/demo-seed.ts)
  const save = () => {
    try {
      saveSnapshot(file, sheet.tabs);
    } catch {
      console.error("[fixtures] save_failed"); // a label only: the data stays in memory
    }
  };
  const sheet: MemorySheet = createMemorySheet(tabs, save);
  onDemoChange(save);
  save();
  return (holder[KEY] = sheet);
}
