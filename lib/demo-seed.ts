// Seed data for the local data mode (fixture mode only): made-up contractors
// with past jobs and reviews, so a ticket for plumbing in Baner finds 3
// available plumbers out of 5. At the founder's request (2026-10-22) the names
// and reviews carry no "demo" or "sample" label on screen; every phone number is
// a made-up 90000-series number, and each record's hidden founder_notes /
// consent_text says it is seed data. Nothing here is ever written to Google
// Sheets.
//
// ensureDemoSeed() only ADDS what is missing (by fixed IDs), so it never touches
// data entered later, and running it twice changes nothing. It also removes the
// on-screen labels older saved data still carries (cleanLabels).
import { CONTRACTOR_HEADERS, CONSENT_VERSION } from "./registration";
import { REQUEST_HEADERS } from "./request";
import { JOB_TABLE } from "./job";
import { REVIEW_TABLE } from "./review";

type Grid = string[][];
const row = (headers: readonly string[], o: Record<string, string>) => headers.map((h) => o[h] ?? "");

type SeedContractor = { id: string; name: string; trade: string; area: string; availability: "now" | "from_date" | "unavailable"; fromDays?: number; phone: string; reviews: { overall: number; workmanship: number; punctuality: number; communication: number; comment: string }[] };

export const DEMO_CONTRACTORS: SeedContractor[] = [
  { id: "C-PLMBRMSH", name: "Ramesh Patil", trade: "Plumbing", area: "Baner", availability: "now", phone: "+919000010001", reviews: [
    { overall: 5, workmanship: 5, punctuality: 4, communication: 5, comment: "Neat concealed piping, finished on time." },
    { overall: 4, workmanship: 4, punctuality: 4, communication: 5, comment: "Good work, explained every step." },
    { overall: 5, workmanship: 5, punctuality: 5, communication: 4, comment: "Fixed the leaks in one visit." },
  ] },
  { id: "C-PLMBSNLM", name: "Sunil More", trade: "Plumbing", area: "Baner", availability: "now", phone: "+919000010002", reviews: [
    { overall: 4, workmanship: 4, punctuality: 3, communication: 4, comment: "Solid work, started a day late." },
    { overall: 4, workmanship: 4, punctuality: 4, communication: 4, comment: "Reliable for bathroom fittings." },
  ] },
  { id: "C-PLMBIMRN", name: "Imran Shaikh", trade: "Plumbing", area: "Baner", availability: "now", phone: "+919000010003", reviews: [
    { overall: 5, workmanship: 5, punctuality: 5, communication: 5, comment: "Very professional team of two." },
  ] },
  { id: "C-PLMBVKSJ", name: "Vikas Jadhav", trade: "Plumbing", area: "Baner", availability: "unavailable", phone: "+919000010004", reviews: [] },
  { id: "C-PLMBDPKK", name: "Deepak Kale", trade: "Plumbing", area: "Baner", availability: "from_date", fromDays: 30, phone: "+919000010005", reviews: [] },
  { id: "C-PLMBWKDA", name: "Anil Gaikwad", trade: "Plumbing", area: "Wakad", availability: "now", phone: "+919000010006", reviews: [] },
  { id: "C-ELECAJAY", name: "Ajay Shinde", trade: "Electrical", area: "Baner", availability: "now", phone: "+919000010007", reviews: [] },
  { id: "C-MASNKIRN", name: "Kiran Pawar", trade: "Masonry", area: "Hinjawadi", availability: "now", phone: "+919000010008", reviews: [] },
];

export const DEMO_CONTRACTOR_IDS = new Set(DEMO_CONTRACTORS.map((c) => c.id));

const PAST_CLIENT = "Shree Constructions";
const pastJob = (trade: string, area: string) => `Completed job: ${trade.toLowerCase()} work in ${area}.`;

// On-screen labels that older saved data carries; removed on load.
function cleanLabels(tabs: Record<string, Grid>): boolean {
  let changed = false;
  const fix = (tab: string, column: string, f: (v: string) => string) => {
    const grid = tabs[tab];
    const col = grid?.[0]?.indexOf(column) ?? -1;
    if (!grid || col < 0) return;
    for (const r of grid.slice(1)) {
      const next = f(r[col] ?? "");
      if (next !== r[col]) {
        r[col] = next;
        changed = true;
      }
    }
  };
  fix("Contractors", "name", (v) => v.replace(/\s*\((demo|fixture)\)$/i, ""));
  fix(REVIEW_TABLE.tab, "comment", (v) => v.replace(/^Sample review \(demo data\):\s*(.)/, (_, c: string) => c.toUpperCase()));
  fix(JOB_TABLE.tab, "recorded_by", (v) => (v === "demo data" ? "seed data" : v));
  fix("Requests", "developer_name", (v) => (v === "Sample builder (demo data)" ? PAST_CLIENT : v === "Fixture Developer" ? "Kulkarni Developers" : v));
  fix("Requests", "description", (v) => {
    const past = /^SAMPLE PAST JOB \(demo data\): (\w+) work in (.+?), used only to show ratings\.$/.exec(v);
    if (past) return pastJob(past[1], past[2]);
    return v === "FIXTURE: a made-up masonry job in Baner. No real person is involved." ? "Masonry work in Baner: internal block walls on floor 4 need finishing." : v;
  });
  return changed;
}

const LETTERS = "ABCDEFGHJKMNPQRSTVWXYZ";
const code = (n: number) => String(n).split("").map((d) => LETTERS[Number(d)]).join("").padStart(8, "S");

// Adds the demo contractors and their sample past jobs and reviews to the tabs
// if they are not there yet. Returns true when something was added.
export function ensureDemoSeed(tabs: Record<string, Grid>, now = new Date()): boolean {
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400_000).toISOString();
  const day = (offset: number) => new Date(now.getTime() + offset * 86400_000 + 5.5 * 3600_000).toISOString().slice(0, 10);
  const has = (tab: string, col: number, value: string) => (tabs[tab] ?? []).some((r) => r[col] === value);
  if (!tabs.Contractors || !tabs.Requests || !tabs[JOB_TABLE.tab] || !tabs[REVIEW_TABLE.tab]) return false;
  let added = cleanLabels(tabs);

  DEMO_CONTRACTORS.forEach((c, ci) => {
    if (!has("Contractors", CONTRACTOR_HEADERS.indexOf("contractor_id"), c.id)) {
      tabs.Contractors.push(row(CONTRACTOR_HEADERS, {
        contractor_id: c.id, record_type: "TEST", created_at: iso(20), name: c.name, primary_trade: c.trade, service_areas: c.area,
        availability_status: c.availability, earliest_start_date: c.availability === "from_date" ? day(c.fromDays ?? 30) : "",
        phone: c.phone, consent_version: CONSENT_VERSION, consent_text: "Seed data consent (made-up contractor)",
        consent_timestamp: iso(20), availability_reported_at: iso(0), founder_notes: "Seed data: made-up contractor",
      }));
      added = true;
    }
    c.reviews.forEach((r, ri) => {
      const n = (ci + 1) * 10 + ri + 1;
      const requestId = `R-${code(n)}`;
      const jobId = `J-${code(n)}`;
      if (has("Requests", REQUEST_HEADERS.indexOf("request_id"), requestId)) return;
      const past = 40 + ri * 15;
      tabs.Requests.push(row(REQUEST_HEADERS, {
        request_id: requestId, record_type: "TEST", created_at: iso(past + 5), developer_name: PAST_CLIENT, contact_phone: "+919000019999",
        description: pastJob(c.trade, c.area), trade: c.trade, service_area: c.area,
        start_date: day(-past), duration_days: "5", extraction_source: "manual", consent_version: "r2-2026-10-22", consent_text: "Seed data consent",
        consent_timestamp: iso(past + 5), status: "Job completed",
      }));
      const job = (event: string, status: string, at: string) => row(JOB_TABLE.headers, {
        job_id: jobId, record_type: "TEST", request_id: requestId, contractor_id: c.id, event, status, completion_date: event === "completed" ? day(-past + 5) : "",
        recorded_at: at, recorded_by: "seed data",
      });
      tabs[JOB_TABLE.tab].push(job("selected", "selected", iso(past)), job("completed", "completed", iso(past - 5)));
      tabs[REVIEW_TABLE.tab].push(row(REVIEW_TABLE.headers, {
        review_id: `W-${code(n)}`, record_type: "TEST", job_id: jobId, request_id: requestId, contractor_id: c.id, invite_id: `V-${code(n)}`,
        submitted_at: iso(past - 6), overall: String(r.overall), workmanship: String(r.workmanship), punctuality: String(r.punctuality),
        communication: String(r.communication), comment: r.comment, comment_language: "en", comment_english: "", translation_status: "not_needed",
        translation_method: "none", status: "valid",
      }));
      added = true;
    });
  });

  // Keep the demo contractors' availability fresh, so they are not "stale" on demo day.
  const reportedCol = CONTRACTOR_HEADERS.indexOf("availability_reported_at");
  const idCol = CONTRACTOR_HEADERS.indexOf("contractor_id");
  for (const r of tabs.Contractors) {
    if (DEMO_CONTRACTOR_IDS.has(r[idCol]) && Date.parse(r[reportedCol]) < now.getTime() - 3 * 86400_000) {
      r[reportedCol] = iso(0);
      added = true;
    }
  }
  return added;
}
