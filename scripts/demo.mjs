// npm run demo: starts Contractor Desk in LIVE DEMO (fixture) mode on port 3100.
//
//   - In-memory spreadsheet: made-up starter records plus whoever registers
//     during the demo. Admin pages show FIXTURE MODE and TEST banners. Your
//     Google Sheet is never read or written.
//   - Saved to .demo-data/fixture-state.json (ignored by Git) after every
//     change, so a rehearsal survives a restart. `npm run demo:reset` deletes it.
//   - Fixture mode refuses to switch on in a production build, on Vercel, or
//     with REAL data.
//   - Telegram: set TELEGRAM_BOT_TOKEN (and TELEGRAM_DEMO_CHAT_ID for the
//     builder's alerts) in .env.local. See /admin/telegram.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const port = process.env.PORT || "3100";
const file = path.resolve(".demo-data", "fixture-state.json");

const addresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);
const lan = addresses.map((a) => `http://${a}:${port}`);

console.log("Contractor Desk: LIVE DEMO (fixture mode). Made-up and demo data only; your Google Sheet is not used.");
console.log(`  On this laptop:          http://localhost:${port}/admin/builder`);
for (const url of lan) console.log(`  Phones on the same Wi-Fi: ${url}/register   (admin: ${url}/admin/builder)`);
console.log(`  Demo data is saved in:  ${file}`);
console.log("  Press Ctrl+C to stop.\n");

const child = spawn("npx", ["next", "dev", "-H", "0.0.0.0", "-p", port], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, CONTRACTOR_DESK_FIXTURES: "1", CONTRACTOR_DESK_FIXTURE_FILE: file, CONTRACTOR_DESK_DEV_ORIGINS: addresses.join(",") },
});
child.on("exit", (code) => process.exit(code ?? 0));
