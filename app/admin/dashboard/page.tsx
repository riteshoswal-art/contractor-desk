import type { Metadata } from "next";
import { Suspense } from "react";
import { SheetSetupError } from "@/lib/contractor-store";
import { getContractorSheet, NotConfiguredError } from "@/lib/google-sheets";
import { loadOutcomes } from "@/lib/outcome-store";
import { computeTypeStats } from "@/lib/stats";
import AdminShell from "../AdminShell";
import StatsView from "./StatsView";

export const metadata: Metadata = { title: "Dashboard | Contractor Desk" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
      <AdminShell>
        <Dashboard />
      </AdminShell>
    </Suspense>
  );
}

async function Dashboard() {
  let outcomes;
  try {
    outcomes = await loadOutcomes(getContractorSheet());
  } catch (error) {
    const label =
      error instanceof NotConfiguredError
        ? "sheets_not_configured"
        : error instanceof SheetSetupError
          ? "sheets_header_mismatch"
          : "sheets_request_failed";
    console.error(`[admin/dashboard] ${label}`);
    return (
      <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        {error instanceof NotConfiguredError
          ? "Google Sheets is not set up on this server yet."
          : "Could not read the Outcomes tab. Check that row 1 has the expected headers and try again."}
      </p>
    );
  }

  return (
    <>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Results so far</h1>
      <p className="mt-2 text-sm text-zinc-700">
        Counts of what you recorded. Percentages and medians appear only when
        there are enough real data points. A reply is not confirmed
        availability, and a usable match is your own judgement. No names, phone
        numbers or messages are shown here.
      </p>
      <StatsView
        stats={computeTypeStats(outcomes, "REAL")}
        title="Real results"
        caption="Outcomes for real contractors and developers who gave consent."
      />
      <StatsView
        stats={computeTypeStats(outcomes, "TEST")}
        title="Test results"
        caption="Practice data only. It shows the tool works, not that anyone wants it."
      />
    </>
  );
}
