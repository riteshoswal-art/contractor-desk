// One-time Sheet setup for the newer tabs. It is deliberately cautious:
//   - it only ever CREATES a tab that does not exist, and writes that new tab's
//     header row;
//   - it never edits, clears or deletes anything in an existing tab, including
//     your Contractors, Requests and Outcomes tabs;
//   - an existing tab whose headers differ is reported, never "fixed";
//   - by default it only reports what it WOULD do (a dry run).
import type { ContractorSheet } from "./contractor-store";
import { BID_TABLE } from "./bid";
import { BID_INVITE_TABLE } from "./bid-invite";
import { CONFIRMATION_TABLE } from "./confirmation";
import { INVITE_TABLE } from "./invite";
import { JOB_TABLE } from "./job";
import { LANGUAGE_TABLE } from "./language-store";
import { REVIEW_TABLE } from "./review";
import { colLetter, type TableDef } from "./tables";

// Tabs the app needs. Each later feature adds its own tab here when it ships.
export const REQUIRED_TABLES: TableDef[] = [
  CONFIRMATION_TABLE,
  LANGUAGE_TABLE,
  JOB_TABLE,
  INVITE_TABLE,
  REVIEW_TABLE,
  BID_TABLE,
  BID_INVITE_TABLE,
];

export type TabState = "ok" | "missing" | "header_mismatch" | "created";
export type TabPlan = { tab: string; state: TabState };

async function existingTabs(sheet: ContractorSheet): Promise<string[]> {
  if (!sheet.listTabs) throw new Error("this Sheet connection cannot list tabs");
  return sheet.listTabs();
}

async function headerOf(sheet: ContractorSheet, tab: string): Promise<string[]> {
  const [grid = []] = await sheet.read([`${tab}!1:1`]);
  return grid[0] ?? [];
}

// Read-only: says what is there and what is missing.
export async function planSetup(
  sheet: ContractorSheet,
  defs: TableDef[] = REQUIRED_TABLES,
): Promise<TabPlan[]> {
  const tabs = new Set(await existingTabs(sheet));
  const plan: TabPlan[] = [];
  for (const def of defs) {
    if (!tabs.has(def.tab)) {
      plan.push({ tab: def.tab, state: "missing" });
      continue;
    }
    const header = await headerOf(sheet, def.tab);
    const same = header.length === def.headers.length && def.headers.every((h, i) => header[i] === h);
    plan.push({ tab: def.tab, state: same ? "ok" : "header_mismatch" });
  }
  return plan;
}

// Creates only the missing tabs, then writes their header rows. Everything else
// is left exactly as it is.
export async function applySetup(
  sheet: ContractorSheet,
  defs: TableDef[] = REQUIRED_TABLES,
): Promise<TabPlan[]> {
  if (!sheet.addTab) throw new Error("this Sheet connection cannot add tabs");
  const plan = await planSetup(sheet, defs);
  const result: TabPlan[] = [];
  for (const item of plan) {
    if (item.state !== "missing") {
      result.push(item);
      continue;
    }
    const def = defs.find((d) => d.tab === item.tab)!;
    await sheet.addTab(def.tab);
    await sheet.update(`${def.tab}!A1:${colLetter(def.headers.length - 1)}1`, [...def.headers]);
    result.push({ tab: def.tab, state: "created" });
  }
  return result;
}
