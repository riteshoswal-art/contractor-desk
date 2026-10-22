// A spreadsheet that lives only in memory, with the same small interface as the
// real Google connection. It exists so the screens can be tried in a browser with
// made-up records, without touching the real Sheet. It forgets everything when
// the server stops. It is only ever used through lib/fixtures.ts, which refuses
// to switch it on in production, on Vercel, or for REAL data.
import type { ContractorSheet } from "./contractor-store";

type Grid = string[][];
export type MemorySheet = ContractorSheet & { tabs: Record<string, Grid> };

function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// Google answers 400 when a tab does not exist: the same here, so the rest of
// the app treats a missing tab exactly as it would with the real Sheet.
function missingTab(): Error {
  return Object.assign(new Error("Unable to parse range"), { status: 400 });
}

// Google leaves out trailing empty cells.
function trimmed(cells: string[]): string[] {
  const out = [...cells];
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

const RANGE = /^([^!]+)!(?:([A-Z]+)(\d+):([A-Z]+)(\d*)|(\d+):(\d+)|([A-Z]+)(\d+))$/;

// `onChange` runs after every write (fixture mode uses it to save a local copy).
export function createMemorySheet(initial: Record<string, Grid> = {}, onChange?: () => void): MemorySheet {
  const tabs: Record<string, Grid> = Object.fromEntries(
    Object.entries(initial).map(([name, grid]) => [name, grid.map((row) => [...row])]),
  );
  const grid = (name: string): Grid => {
    const g = tabs[name];
    if (!g) throw missingTab();
    return g;
  };

  return {
    tabs,
    async read(ranges) {
      return ranges.map((range) => {
        const m = RANGE.exec(range);
        if (!m) throw new Error(`memory sheet cannot read range ${range}`);
        const g = grid(m[1]);
        if (m[6]) return g.slice(Number(m[6]) - 1, Number(m[7])).map((row) => trimmed(row)); // whole rows
        if (m[2]) {
          const [from, to] = [columnIndex(m[2]), columnIndex(m[4])];
          const firstRow = Number(m[3]) - 1;
          const lastRow = m[5] ? Number(m[5]) : undefined;
          return g.slice(firstRow, lastRow).map((row) => trimmed(row.slice(from, to + 1)));
        }
        return [];
      });
    },
    async append(range, row) {
      const tab = range.split("!")[0];
      grid(tab).push([...row]);
      onChange?.();
    },
    async update(range, row) {
      const m = RANGE.exec(range);
      if (!m) throw new Error(`memory sheet cannot update range ${range}`);
      const g = grid(m[1]);
      const rowNumber = Number(m[3] ?? m[6] ?? m[9]);
      g[rowNumber - 1] = [...row];
      onChange?.();
    },
    async listTabs() {
      return Object.keys(tabs);
    },
    async addTab(title) {
      if (tabs[title]) throw new Error("tab already exists");
      tabs[title] = [];
      onChange?.();
    },
  };
}
