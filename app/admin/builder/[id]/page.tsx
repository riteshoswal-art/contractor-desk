import type { Metadata } from "next";
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
import { Avatar, BackLink, Notice, RequestMeta } from "../../requests/[id]/detail-ui";
import LiveRefresh from "./LiveRefresh";
import MatchesPanel, { type MatchRow } from "./MatchesPanel";

export const metadata: Metadata = { title: "Ticket | Contractor Desk" };

export default function TicketPage(props: PageProps<"/admin/builder/[id]">) {
  return (
    <Suspense fallback={<p className="small muted" style={{ padding: 24 }}>Loading…</p>}>
      <AdminShell>
        <Ticket params={props.params} searchParams={props.searchParams} />
      </AdminShell>
    </Suspense>
  );
}

const ALERT_TEXT: Record<string, { text: string; tone: string }> = {
  sent: { text: "Builder alerted on Telegram", tone: "pill-ok" },
  failed: { text: "Builder Telegram alert failed (the bid is saved)", tone: "pill-warn" },
  not_configured: { text: "Builder alert not sent: TELEGRAM_FOUNDER_CHAT_ID not set (the bid is saved)", tone: "pill-warn" },
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
      <div style={{ marginTop: 24 }}>
        <Notice tone="warn" icon="info" role="alert">
          Could not load this ticket. Check the setup and try again.
        </Notice>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="stack" style={{ marginTop: 24, ["--gap" as string]: "12px" }}>
        <BackLink href="/admin/builder">Tickets</BackLink>
        <Notice tone="muted" icon="info" role="status">
          That ticket was not found among the {recordType} records.
        </Notice>
      </div>
    );
  }
  const { request, workspace, bidWorkspace, panel, rows, liveBids, alerts } = data;
  const cfg = telegramConfig();
  const job = workspace.panel?.job ?? null;
  const status: { text: string; tone: string } = job
    ? job.status === "completed"
      ? { text: "Job completed", tone: "pill-ok" }
      : job.status === "cancelled"
        ? { text: "Job cancelled", tone: "pill-muted" }
        : { text: "Contractor selected", tone: "pill-dark" }
    : panel
      ? panel.state === "open"
        ? { text: `Bidding open${panel.closesAt ? ` · closes ${formatDate(panel.closesAt)}` : ""}`, tone: "pill-info" }
        : { text: panel.stateText, tone: panel.state === "selected" ? "pill-dark" : "pill-muted" }
      : { text: request.status || "Status not recorded", tone: "pill-muted" };

  return (
    <div style={{ marginTop: 24 }}>
      <div className="detail-head">
        <BackLink href="/admin/builder">Tickets</BackLink>
        {isNew && (
          <Notice tone="ok" icon="check" role="status">
            <b>
              Ticket raised. Reference: <span className="mono">{request.id}</span>. No contractor has been contacted yet.
            </b>
          </Notice>
        )}
        <div className="stack" style={{ ["--gap" as string]: "10px" }}>
          <div className="row wrap">
            <span className="mono muted">Ticket {request.id}</span>
            <span className={`pill ${status.tone}`}>{status.text}</span>
          </div>
          <h1 className="h1">
            {request.trade} in {request.area}
          </h1>
          <RequestMeta request={request} who="Builder" />
        </div>
        <p className="quote desc whitespace-pre-wrap">{request.description}</p>
        {request.notes && (
          <p className="small desc" style={{ margin: 0 }}>
            <span className="muted">Notes:</span> {request.notes}
          </p>
        )}
        {bidWorkspace.missingTabs.length > 0 && (
          <Notice tone="warn" icon="info" role="status">
            Bidding is not set up in this Sheet (missing {bidWorkspace.missingTabs.join(", ")}). Use the local data mode.
          </Notice>
        )}
      </div>

      <div className="stack" style={{ ["--gap" as string]: "40px" }}>
        <MatchesPanel requestId={request.id} rows={rows} botReady={Boolean(telegramToken())} builderAlertsReady={cfg.configured} />

        <section aria-labelledby="bids-heading" className="stack" style={{ ["--gap" as string]: "16px" }}>
          <div className="group-head">
            <h2 id="bids-heading" className="h2">2. Bids</h2>
            <span className="small muted">
              <b style={{ color: "var(--ink)" }}>{liveBids.length}</b> bid{liveBids.length === 1 ? "" : "s"} received
              {liveBids[0] && <> · latest from {liveBids[0].contractorName} at {istTime(liveBids[0].submittedAt)}</>}
            </span>
          </div>
          <LiveRefresh />
          {liveBids.length > 0 && (
            <ul className="card flat" style={{ listStyle: "none", margin: 0, padding: "4px 16px" }} aria-label="Bids as they arrived, newest first">
              {liveBids.map((b, i) => {
                const alert = alerts[b.bidId];
                const a = alert ? (alert.detail === "sending" ? { text: "Builder alert sending…", tone: "pill-muted" } : ALERT_TEXT[alert.status]) : null;
                return (
                  <li key={b.bidId} className="row wrap" style={{ padding: "10px 0", borderTop: i === 0 ? 0 : "1px solid var(--line)", gap: 10 }}>
                    <Avatar name={b.contractorName} />
                    <span className="grow">
                      <span className="h3" style={{ display: "block" }}>{b.contractorName}</span>
                      <span className="small muted">
                        {b.price} · {istTime(b.submittedAt)}
                      </span>
                    </span>
                    {a && <span className={`pill ${a.tone}`} style={{ whiteSpace: "normal" }}>{a.text}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {panel && <BidPanel panel={panel} today={todayInIndia()} telegram={{ configured: Boolean(telegramToken()), testMode: recordType === "TEST" }} />}
        </section>

        <section aria-labelledby="job-section-heading" className="stack" style={{ ["--gap" as string]: "16px" }}>
          <h2 id="job-section-heading" className="h2">3. Job, contact details and review</h2>
          {workspace.panel ? (
            <JobPanel {...workspace.panel} />
          ) : (
            <Notice tone="muted" icon="info">The Jobs tab is not set up.</Notice>
          )}
        </section>
      </div>
    </div>
  );
}
