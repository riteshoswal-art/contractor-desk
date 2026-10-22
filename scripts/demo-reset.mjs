// npm run demo:reset: deletes the saved live-demo data (registrations, tickets,
// bids and Telegram connections made in demo mode). Stop `npm run demo` first.
// It never touches Google Sheets.
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(".demo-data", "fixture-state.json");
if (fs.existsSync(file)) {
  fs.rmSync(file);
  console.log(`Deleted ${file}. The next "npm run demo" starts fresh.`);
} else {
  console.log("No saved demo data. Nothing to delete.");
}
