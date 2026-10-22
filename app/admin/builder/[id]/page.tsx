import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { istTime } from "@/lib/bid-alert";
import { latestByPair, pairKey, type Confirmation } from "@/lib/confirmation";
import { loadConfirmations } from "@/lib/confirmation-store";
import { SheetSetupError } from "@/lib/contractor-store";
import { demoState } from "@/lib/demo-store";
import { getContractorSheet, getRecordType, NotConfiguredError } from "@/lib/google-sheets";
import { formatDate, matchContractors } from "@/lib/match";
import { loadContractors, loadRequests } from "@/lib/records";
import { todayInIndia } from "@/lib/registration";
import { telegramConfig, telegramToken } from "@/lib/telegram";
import AdminShell from "../../AdminShell";
import BidPanel from "../../requests/[id]/BidPanel";
import JobPanel from "../../requests/[id]/JobPanel";
import { loadBidWorkspace } from "../../requests/[id]/bid-data";
import { loadJobWorkspace } from "../../requests/[id]/job-data";
import LiveRefresh from "./LiveRefresh";
import MatchesPanel, { type MatchRow } from "./MatchesPanel";

export const metadata: Metadata = { title: "Ticket | Contractor Desk" };

export default function TicketPage(props: PageProps<"/admin/builder/[id]">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
      <AdminShell>
        <Ticket params={props.params} searchParams={props.searchParams} />
      </AdminShell>
    </Suspense>
  );
}

const ALERT_TEXT: Record<string, { text: string; tone: string }> = {
  sent: { text: "Builder alerted on Telegram", tone: "bg-green-100 text-green-900" },
  failed: { text: "Builder Telegram alert failed (the bid is saved)", tone: "bg-red-100 text-red-900" },
  not_configured: { text: "Builder alert not sent: TELEGRAM_FOUNDER_CHAT_ID not set (the bid is saved)", tone: "bg-amber-100 text-amber-900" },
};

// Everything the ticket view shows, read fresh on every request (and on every
// live refresh). Phone numbers are never loaded here.
async function loadTicket(id: string, recordType: ReturnType<typeof getRecordType>) {
  const sheet = getContractorSheet();
  const request = (await loadRequests(sheet)).find((r) => r.id === id && r.recordType === recordType);
  if (!request) return null;
  const contractors = await loadContractors(sheet);
  let confirmations: Confirmation[] = [];
  try {
    confirmations = await loadConfirmations(sheet, recordType);
  } catch (error) {
    if (!(error instanceof SheetSetupError)) throw error;
  }
  const workspace = await loadJobWorkspace(sheet, recordType, request, contractors, confirmations);
  const bidWorkspace = await loadBidWorkspace(sheet, recordType, request, contractors, confirmations, workspace.summaries);
  const panel = bidWorkspace.panel;
  const state = demoState();
  const latest = latestByPair(confirmations);
  const bidders = new Set(panel ? [...panel.groups.flatMap((g) => g.bids), ...panel.withdrawn].map((b) => b.contractorId) : []);

  const rows: MatchRow[] = matchContractors(request, contractors, { envType: recordType, max: Number.MAX_SAFE_INTEGER }).candidates.map((c) => ({
    id: c.contractorId,
    name: c.name,
    fit: c.startFit.label === null ? "on_date" : "needs_confirmation",
    fitText: c.startFit.label === null ? "Available on the requested date (their own statement)" : `${c.startFit.label}: not a confirmed date`,
    reasons: c.reasons,
    connected: Boolean(state.links[c.contractorId]),
    telegramName: state.links[c.contractorId]?.telegramName ?? "",
    notice: state.notices[`${request.id}|${c.contractorId}`] ?? null,
    hasBid: bidders.has(c.contractorId),
    unavailable: latest.get(pairKey(request.id, c.contractorId))?.status === "unavailable",
  }));

  const liveBids = panel ? panel.groups.flatMap((g) => g.bids).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)) : [];
  return { request, workspace, bidWorkspace, panel, rows, liveBids, alerts: state.bidAlerts };
}

async function Ticket({ params, searchParams }: { params: PageProps<"/admin/builder/[id]">["params"]; searchParams: PageProps<"/admin/builder/[id]">["searchParams"] }) {
  const { id } = await params;
  const isNew = (await searchParams).new === "1";
  const recordType = getRecordType();

  let data: Awaited<ReturnType<typeof loadTicket>> = null;
  let failed = false;
  try {
    data = await loadTicket(id, recordType);
  } catch (error) {
    failed = true;
    console.error(`[admin/builder] ${error instanceof NotConfiguredError ? "sheets_not_configured" : "ticket_failed"}`);
  }
  if (failed) {
    return (
      <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        Could not load this ticket. Check the setup and try again.
      </p>
    );
  }
  if (!data) {
    return (
      <div className="mt-6 space-y-3">
        <p role="status" className="rounded-md border border-zinc-300 bg-zinc-50 p-4 text-sm">That ticket was not found among the {recordType} records.</p>
        <Link href="/admin/builder" className="text-sm text-blue-800 underline">&larr; Tickets</Link>
      </div>
    );
  }
  const { request, workspace, bidWorkspace, panel, rows, liveBids, alerts } = data;
  const cfg = telegramConfig();

  return (
      <div className="mt-6">
        <Link href="/admin/builder" className="text-sm text-blue-800 underline">&larr; Tickets</Link>
        {isNew && (
          <p role="status" className="mt-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm font-medium text-green-900">
            Ticket raised. Reference: <span className="font-mono">{request.id}</span>. No contractor has been contacted yet.
          </p>
        )}
        <p className="mt-4 font-mono text-sm text-zinc-600">Ticket {request.id}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{request.trade} in {request.area}</h1>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-zinc-600">Needed from</dt>
          <dd>{request.startDate ? formatDate(request.startDate) : "Not stated"}</dd>
          <dt className="text-zinc-600">Duration</dt>
          <dd>{request.durationDays ? `About ${request.durationDays} days` : "Not stated"}</dd>
          <dt className="text-zinc-600">Builder</dt>
          <dd>{request.developerName || "Name not given"}</dd>
          {request.notes && (
            <>
              <dt className="text-zinc-600">Notes</dt>
              <dd>{request.notes}</dd>
            </>
          )}
        </dl>
        <p className="mt-3 whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-sm text-zinc-800">{request.description}</p>

        {bidWorkspace.missingTabs.length > 0 && (
          <p role="status" className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            Bidding is not set up in this Sheet (missing {bidWorkspace.missingTabs.join(", ")}). Use the local data mode.
          </p>
        )}

        <MatchesPanel requestId={request.id} rows={rows} botReady={Boolean(telegramToken())} builderAlertsReady={cfg.configured} />

        <section aria-labelledby="bids-heading" className="mt-8 space-y-3">
          <h2 id="bids-heading" className="text-lg font-semibold">2. Bids</h2>
          <LiveRefresh />
          <p className="text-sm">
            <span className="font-semibold">{liveBids.length}</span> bid{liveBids.length === 1 ? "" : "s"} received
            {liveBids[0] && <> · latest from {liveBids[0].contractorName} at {istTime(liveBids[0].submittedAt)}</>}
          </p>
          {liveBids.length > 0 && (
            <ul className="space-y-1 text-sm">
              {liveBids.map((b) => {
                const alert = alerts[b.bidId];
                const a = alert ? (alert.detail === "sending" ? { text: "Builder alert sending…", tone: "bg-zinc-100 text-zinc-700" } : ALERT_TEXT[alert.status]) : null;
                return (
                  <li key={b.bidId} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{b.contractorName}</span> {b.price} <span className="text-zinc-600">{istTime(b.submittedAt)}</span>
                    {a && <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${a.tone}`}>{a.text}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {panel && <BidPanel panel={panel} today={todayInIndia()} telegram={{ configured: Boolean(telegramToken()), testMode: recordType === "TEST" }} />}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">3. Job, contact details and review</h2>
          {workspace.panel ? <JobPanel {...workspace.panel} /> : <p className="mt-2 text-sm text-zinc-700">The Jobs tab is not set up.</p>}
        </section>
      </div>
    );
}
