// One-time setup for the newer Google Sheet tabs.
//
//   npm run sheet:setup               report only: changes NOTHING
//   npm run sheet:setup -- --apply    create the missing tabs (and their header rows)
//
// It never edits, clears or deletes anything in an existing tab, and it never
// prints a password, key or Sheet ID.
import fs from "node:fs";
import path from "node:path";

const apply = process.argv.includes("--apply");

// Same settings file the app uses. Values already set in the terminal win.
try {
  for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && m[2].trim() !== "" && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
    }
  }
} catch {
  console.error("Could not read .env.local in this folder. Run this from the project folder.");
  process.exit(1);
}

const { getContractorSheet, httpStatusOf } = await import("../lib/google-sheets.ts");
const { REQUIRED_TABLES, applySetup, planSetup } = await import("../lib/sheet-setup.ts");

const WORDS = {
  ok: "already set up",
  missing: "MISSING",
  header_mismatch: "EXISTS BUT ITS HEADERS DIFFER (left untouched)",
  created: "created",
};

try {
  const sheet = getContractorSheet();
  const before = await planSetup(sheet, REQUIRED_TABLES);
  console.log(apply ? "Setting up the Sheet..." : "Checking the Sheet (nothing will be changed)...");
  for (const item of before) console.log(`  ${item.tab}: ${WORDS[item.state]}`);

  if (!apply) {
    const missing = before.filter((i) => i.state === "missing").length;
    console.log(
      missing > 0
        ? `\n${missing} tab(s) are missing. To create them, run:  npm run sheet:setup -- --apply`
        : "\nNothing to create.",
    );
  } else {
    const after = await applySetup(sheet, REQUIRED_TABLES);
    console.log("\nResult:");
    for (const item of after) console.log(`  ${item.tab}: ${WORDS[item.state]}`);
  }
} catch (error) {
  const status = httpStatusOf(error);
  const label = error && typeof error === "object" && "reason" in error ? error.reason : "request_failed";
  console.error(`Could not finish: ${label}${status ? ` (HTTP ${status})` : ""}.`);
  process.exit(1);
}
