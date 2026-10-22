// Shared helpers for the NEW tabs (Confirmations, Jobs, Bids, Reviews,
// Notifications, Languages). The original tabs (Contractors, Requests,
// Outcomes) are left exactly as they were.
//
// Every new tab is append-only: a change is a new row, so the tab doubles as
// an audit trail. Readers decide which row counts (first wins, or latest wins)
// and ignore the rest. Nothing here talks to Google directly: it uses the same
// small ContractorSheet interface as the rest of the app, so it can be tested
// with a pretend Sheet.
import { SheetSetupError, type ContractorSheet } from "./contractor-store";
import { neutralizeCell } from "./registration";

// 0 -> A, 25 -> Z, 26 -> AA ...
export function colLetter(index: number): string {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export type TableDef<H extends string = string> = {
  tab: string;
  headers: readonly H[];
};

export function defineTable<const H extends readonly string[]>(
  tab: string,
  headers: H,
): TableDef<H[number]> {
  return { tab, headers };
}

export type TableRow<H extends string> = Record<H, string>;

function lastColumn(def: TableDef): string {
  return colLetter(def.headers.length - 1);
}

// Google answers 400 when a tab does not exist: that is a setup problem.
async function readRange(sheet: ContractorSheet, range: string): Promise<string[][]> {
  try {
    const [grid = []] = await sheet.read([range]);
    return grid;
  } catch (error) {
    const e = error as { status?: unknown; code?: unknown };
    const status = e?.status ?? e?.code;
    if (status === 400 || status === "400") throw new SheetSetupError("tab missing");
    throw error;
  }
}

// Reads a whole tab after checking that row 1 is exactly the expected header.
// A missing tab, or one with different headers, is a setup problem (never
// guessed around): SheetSetupError.
export async function readTable<H extends string>(
  sheet: ContractorSheet,
  def: TableDef<H>,
): Promise<TableRow<H>[]> {
  const grid = await readRange(sheet, `${def.tab}!A1:${lastColumn(def)}`);
  const header = grid[0] ?? [];
  const ok =
    header.length === def.headers.length && def.headers.every((h, i) => header[i] === h);
  if (!ok) throw new SheetSetupError("header mismatch");

  const rows: TableRow<H>[] = [];
  grid.slice(1).forEach((cells) => {
    const obj = {} as TableRow<H>;
    def.headers.forEach((h, j) => {
      obj[h] = cells[j] ?? "";
    });
    if (cells.some((c) => c !== "")) rows.push(obj); // skip blank rows
  });
  return rows;
}

// Appends one row after re-checking the header (so a tab edited by hand can
// never receive misaligned data). Free text is made safe against being read
// as a spreadsheet formula.
export async function appendTableRow<H extends string>(
  sheet: ContractorSheet,
  def: TableDef<H>,
  cells: Record<H, string>,
): Promise<void> {
  const grid = await readRange(sheet, `${def.tab}!1:1`);
  const header = grid[0] ?? [];
  const ok =
    header.length === def.headers.length && def.headers.every((h, i) => header[i] === h);
  if (!ok) throw new SheetSetupError("header mismatch");
  await sheet.append(
    `${def.tab}!A1`,
    def.headers.map((h) => neutralizeCell(cells[h] ?? "")),
  );
}

// ---------------------------------------------------------------------------
// A tiny in-process lock. It stops two requests handled by THIS server from
// interleaving read-check-write sequences for the same key (for example two
// bids from one contractor). Servers run as several instances, so the readers
// also pick one winner deterministically (the first row): the lock keeps the
// common case clean, the reader rule keeps the rare case correct.
// ---------------------------------------------------------------------------

const tails = new Map<string, Promise<unknown>>();

export async function withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(work);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  try {
    return await run;
  } finally {
    if (tails.get(key) === tail) tails.delete(key);
  }
}
