import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { formatDate } from "@/lib/match";
import { loadRequests } from "@/lib/records";
import { todayInIndia } from "@/lib/registration";
import AdminShell from "../AdminShell";
import TicketForm from "./TicketForm";

export const metadata: Metadata = { title: "Builder demo | Contractor Desk" };

export default function BuilderPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
      <AdminShell>
        <BuilderHome />
      </AdminShell>
    </Suspense>
  );
}

async function BuilderHome() {
  let tickets: { id: string; title: string; start: string }[] = [];
  let problem = "";
  try {
    const requests = await loadRequests(getContractorSheet());
    tickets = requests
      .filter((r) => r.recordType === getRecordType())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ id: r.id, title: `${r.trade} in ${r.area}`, start: r.startDate }));
  } catch {
    problem = "Could not read the requests.";
  }

  return (
    <div className="mt-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Builder demo</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-700">
          A builder&apos;s job ticket, from request to chosen contractor. There are no builder accounts yet: for this demo the founder
          raises the ticket on the builder&apos;s behalf, and the builder&apos;s Telegram chat receives an alert for every new bid.
        </p>
      </div>
      <TicketForm today={todayInIndia()} />
      <section>
        <h2 className="text-lg font-semibold">Tickets</h2>
        {problem && <p role="alert" className="mt-2 text-sm text-red-800">{problem}</p>}
        {!problem && tickets.length === 0 && <p className="mt-2 text-sm text-zinc-600">No tickets yet.</p>}
        <ul className="mt-2 divide-y divide-zinc-200 rounded-md border border-zinc-300">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/builder/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-zinc-50">
                <span>
                  <span className="font-medium">{t.title}</span> <span className="font-mono text-zinc-600">{t.id}</span>
                </span>
                <span className="text-zinc-600">{t.start ? `from ${formatDate(t.start)}` : "no date"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
