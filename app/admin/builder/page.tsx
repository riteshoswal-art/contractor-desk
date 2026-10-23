import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getContractorSheet, getRecordType } from "@/lib/google-sheets";
import { formatDate } from "@/lib/match";
import { loadRequests } from "@/lib/records";
import { todayInIndia } from "@/lib/registration";
import { Icon } from "../../ui";
import AdminShell from "../AdminShell";
import TicketForm from "./TicketForm";

export const metadata: Metadata = { title: "Tickets | Contractor Desk" };

export default function BuilderPage() {
  return (
    <Suspense fallback={<p className="page small muted">Loading…</p>}>
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
    <>
      <div className="page-head">
        <span className="eyebrow">Operator</span>
        <h1 className="h1" style={{ marginTop: 4 }}>
          Tickets
        </h1>
        <p className="lead-sm" style={{ marginTop: 8, maxWidth: 760 }}>
          Raise a ticket on a builder&apos;s behalf (for example after a phone call) and follow it from request to chosen contractor.
          Builders can also raise tickets themselves on the builder page.
        </p>
      </div>
      <div className="form-layout">
        <TicketForm today={todayInIndia()} />
        <section className="card stack" style={{ ["--gap" as string]: "12px" }} aria-labelledby="tickets-heading">
          <div className="row between">
            <h2 id="tickets-heading" className="h2">
              Tickets
            </h2>
            {!problem && <span className="pill pill-muted plain">{tickets.length}</span>}
          </div>
          {problem && (
            <p role="alert" className="notice notice-warn">
              {problem}
            </p>
          )}
          {!problem && tickets.length === 0 && <p className="small muted">No tickets yet.</p>}
          {tickets.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link prefetch={false} href={`/admin/builder/${t.id}`} className="attn">
                    <span className="ic-box">
                      <Icon name="file" />
                    </span>
                    <span className="grow">
                      <span className="h3 block">{t.title}</span>
                      <span className="small muted">
                        <span className="mono">{t.id}</span> · {t.start ? `from ${formatDate(t.start)}` : "no date"}
                      </span>
                    </span>
                    <Icon name="arrow" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
