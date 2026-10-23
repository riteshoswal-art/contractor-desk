// Read-only: checks that the Contractors, Requests and Outcomes tabs have
// exactly the header rows the app expects. Changes nothing.
//   node --import ./tests/register.mjs scripts/check-base-tabs.mjs
const { getContractorSheet } = await import("../lib/google-sheets.ts");
const { CONTRACTOR_HEADERS } = await import("../lib/registration.ts");
const { REQUEST_HEADERS } = await import("../lib/request.ts");
const { OUTCOME_HEADERS } = await import("../lib/outcome.ts");

const sheet = getContractorSheet();
const tabs = { Contractors: CONTRACTOR_HEADERS, Requests: REQUEST_HEADERS, Outcomes: OUTCOME_HEADERS };
const grids = await sheet.read(Object.keys(tabs).map((t) => `${t}!1:1`));
Object.entries(tabs).forEach(([tab, expected], i) => {
  const header = grids[i]?.[0] ?? [];
  const same = header.length === expected.length && expected.every((h, j) => header[j] === h);
  const missing = expected.filter((h) => !header.includes(h));
  console.log(`${tab}: ${same ? "ok" : `HEADERS DIFFER${missing.length ? ` (missing: ${missing.join(", ")})` : " (order or extra columns)"}`}`);
});
