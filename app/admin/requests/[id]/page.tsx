import type { Metadata } from "next";
import { Suspense } from "react";
import {
  confirmedStart,
  historyOf,
  latestByPair,
  pairKey,
  type Confirmation,
} from "@/lib/confirmation";
import { loadConfirmations } from "@/lib/confirmation-store";
import { SheetSetupError } from "@/lib/contractor-store";
import {
  getContractorSheet,
  getRecordType,
  NotConfiguredError,
} from "@/lib/google-sheets";
import { latestLanguageByEntity, loadLanguageRecords, type LanguageRecord } from "@/lib/language-store";
import { languageName } from "@/lib/language";
import { formatDate, matchContractors } from "@/lib/match";
import { loadContractors, loadRequests } from "@/lib/records";
import { todayInIndia } from "@/lib/registration";
import { telegramConfig } from "@/lib/telegram";
import AdminShell from "../../AdminShell";
import MatchResults, { type CandidateExtras } from "../MatchResults";
import ConfirmationForm from "./ConfirmationForm";
import BidPanel from "./BidPanel";
import DetailTabs from "./DetailTabs";
import JobPanel from "./JobPanel";
import { BackLink, Notice, RequestMeta } from "./detail-ui";
import { loadBidWorkspace, type BidWorkspace } from "./bid-data";
import { loadJobWorkspace, type JobWorkspace } from "./job-data";

export const metadata: Metadata = { title: "Request | Contractor Desk" };

export default function RequestDetailPage(
  props: PageProps<"/admin/requests/[id]">,
) {
  return (
    <Suspense fallback={<p className="small muted" style={{ padding: 24 }}>Loading…</p>}>
      <AdminShell>
        <RequestDetail params={props.params} />
      </AdminShell>
    </Suspense>
  );
}

const TRANSLATION_TEXT: Record<string, string> = {
  not_needed: "Written in English, so no translation is needed.",
  pending:
    "English version pending: no translation service is connected. The text above is exactly what the developer wrote.",
  translated: "Translated to English automatically. Check it against the original text above.",
  failed: "The English translation did not work. Read the original text above.",
};

// What language the developer chose and whether an English version really
// exists. The original text above is never replaced.
function LanguageNote({ record }: { record: LanguageRecord }) {
  return (
    <Notice tone="muted" icon="info">
      <p style={{ margin: 0 }}>
        <b>Language chosen:</b> {languageName(record.preferredLanguage)}.{" "}
        {TRANSLATION_TEXT[record.translationStatus] ?? "Translation status not recorded."}
      </p>
      {record.englishText && (
        <p className="whitespace-pre-wrap" style={{ margin: "6px 0 0", color: "var(--ink)" }}>
          <b>English version ({record.translationMethod}):</b> {record.englishText}
        </p>
      )}
      {record.englishNotes && (
        <p className="whitespace-pre-wrap" style={{ margin: "6px 0 0", color: "var(--ink)" }}>
          <b>English version of the notes:</b> {record.englishNotes}
        </p>
      )}
    </Notice>
  );
}

async function RequestDetail({
  params,
}: {
  params: PageProps<"/admin/requests/[id]">["params"];
}) {
  const { id } = await params;
  const recordType = getRecordType();

  let request;
  let result;
  let confirmations: Confirmation[] = [];
  let confirmationsReady = true;
  let languageRecord: LanguageRecord | undefined;
  let workspace: JobWorkspace | undefined;
  let bidWorkspace: BidWorkspace | undefined;
  try {
    const sheet = getContractorSheet();
    const requests = await loadRequests(sheet);
    // Only requests from the current environment can be opened.
    request = requests.find((r) => r.id === id && r.recordType === recordType);
    if (request) {
      const contractors = await loadContractors(sheet);
      result = matchContractors(request, contractors, { envType: recordType });
      try {
        confirmations = await loadConfirmations(sheet, recordType);
      } catch (error) {
        // The new tab may not exist yet. Matching still works without it.
        if (!(error instanceof SheetSetupError)) throw error;
        confirmationsReady = false;
        console.error("[admin/match] confirmations_tab_not_set_up");
      }
      try {
        const records = await loadLanguageRecords(sheet, recordType);
        languageRecord = latestLanguageByEntity(records).get(`request|${request.id}`);
      } catch (error) {
        // The Languages tab may not exist yet; the page simply shows nothing about language.
        if (!(error instanceof SheetSetupError)) throw error;
        console.error("[admin/match] languages_tab_not_set_up");
      }
      // The job, its review invitation and its review. Each of those tabs is optional.
      workspace = await loadJobWorkspace(sheet, recordType, request, contractors, confirmations);
      // Bidding has its own optional tabs (Bids, BidInvites). No phone numbers are loaded.
      bidWorkspace = await loadBidWorkspace(sheet, recordType, request, contractors, confirmations, workspace.summaries);
    }
  } catch (error) {
    const label =
      error instanceof NotConfiguredError
        ? "sheets_not_configured"
        : error instanceof SheetSetupError
          ? "sheets_header_mismatch"
          : "sheets_request_failed";
    console.error(`[admin/match] ${label}`);
    return (
      <div style={{ marginTop: 24 }}>
        <Notice tone="warn" icon="info" role="alert">
          {error instanceof NotConfiguredError
            ? "Google Sheets is not set up on this server yet."
            : "Could not read the Sheet. Check the setup and try again."}
        </Notice>
      </div>
    );
  }

  if (!request || !result) {
    return (
      <div className="stack" style={{ marginTop: 24, ["--gap" as string]: "12px" }}>
        <BackLink href="/admin/requests">Back to requests</BackLink>
        <Notice tone="muted" icon="info" role="status">
          That request was not found among the {recordType} records.
        </Notice>
      </div>
    );
  }

  const latest = latestByPair(confirmations);
  const extras: Record<string, CandidateExtras> = {};
  for (const c of result.candidates) {
    extras[c.contractorId] = {
      confirmation: confirmationsReady
        ? {
            current: latest.get(pairKey(request.id, c.contractorId)) ?? null,
            state: confirmedStart(latest.get(pairKey(request.id, c.contractorId)), request),
            history: historyOf(confirmations, request.id, c.contractorId),
          }
        : undefined,
      rating: workspace?.summaries ? { summary: workspace.summaries.get(c.contractorId) ?? null } : undefined,
      slot: confirmationsReady ? (
        <ConfirmationForm
          requestId={request.id}
          contractorId={c.contractorId}
          requestHasDate={Boolean(request.startDate)}
        />
      ) : undefined,
    };
  }

  const bidPanel = bidWorkspace?.panel ?? null;
  const job = workspace?.panel?.job ?? null;
  const bidCount = bidPanel ? bidPanel.groups.reduce((n, g) => n + g.bids.length, 0) : 0;

  // The status pill beside the request id: a recorded job decides first, then bidding.
  const status: { text: string; tone: string } = job
    ? job.status === "completed"
      ? { text: "Job completed", tone: "pill-ok" }
      : job.status === "cancelled"
        ? { text: "Job cancelled", tone: "pill-muted" }
        : { text: "Contractor selected", tone: "pill-dark" }
    : bidPanel
      ? bidPanel.state === "open"
        ? { text: `Bidding open${bidPanel.closesAt ? ` · closes ${formatDate(bidPanel.closesAt)}` : ""}`, tone: "pill-info" }
        : { text: bidPanel.stateText, tone: bidPanel.state === "selected" ? "pill-dark" : "pill-muted" }
      : { text: request.status || "Status not recorded", tone: "pill-muted" };

  const setupNotices = (
    <>
      {!confirmationsReady && (
        <Notice tone="warn" icon="info" role="status">
          Availability confirmations are not set up in the Sheet yet (the &ldquo;Confirmations&rdquo; tab is missing), so
          statuses cannot be shown or recorded. Matching still works. See the README, section &ldquo;One-time Sheet
          setup&rdquo;.
        </Notice>
      )}
      {workspace && workspace.missingTabs.length > 0 && (
        <Notice tone="warn" icon="info" role="status">
          Not set up in the Sheet yet: {workspace.missingTabs.map((t) => `"${t}"`).join(", ")}. Recording the chosen
          contractor, completion and reviews needs {workspace.missingTabs.length === 1 ? "this tab" : "these tabs"}.
          Matching still works. See the README, section &ldquo;One-time Sheet setup&rdquo;.
        </Notice>
      )}
      {bidWorkspace && bidWorkspace.missingTabs.length > 0 && (
        <Notice tone="warn" icon="info" role="status">
          Bidding is not set up in the Sheet yet. Missing: {bidWorkspace.missingTabs.map((t) => `"${t}"`).join(", ")}.
          Nothing can be saved for bidding until {bidWorkspace.missingTabs.length === 1 ? "that tab exists" : "those tabs exist"}.
          See the README, section &ldquo;One-time Sheet setup&rdquo;.
        </Notice>
      )}
    </>
  );

  return (
    <div style={{ marginTop: 24 }}>
      <DetailTabs
        back={<BackLink href="/admin/requests">Requests</BackLink>}
        head={
          <div className="stack" style={{ ["--gap" as string]: "10px" }}>
            <div className="row wrap">
              <span className="mono muted">{request.id}</span>
              <span className={`pill ${status.tone}`}>{status.text}</span>
            </div>
            <h1 className="h1">
              {request.trade} in {request.area}
            </h1>
            <RequestMeta request={request} who="Developer" />
            <p className="tiny muted" style={{ margin: 0 }}>
              Received {formatDate(request.createdAt)}
            </p>
          </div>
        }
        intro={
          <div className="stack" style={{ ["--gap" as string]: "12px" }}>
            <p className="quote desc whitespace-pre-wrap">{request.description}</p>
            {languageRecord && <LanguageNote record={languageRecord} />}
            {setupNotices}
          </div>
        }
        labels={{ bids: `Bids · ${bidCount}`, matches: `Matches · ${result.candidates.length}`, job: "Job" }}
        bids={
          bidPanel ? (
            <BidPanel
              panel={bidPanel}
              today={todayInIndia()}
              telegram={{ configured: telegramConfig().configured, testMode: recordType === "TEST" }}
              confirmHref="?tab=matches"
            />
          ) : (
            <div className="card empty stack" style={{ ["--gap" as string]: "10px" }}>
              <h2 className="h2">Bids cannot be shown</h2>
              <p className="muted" style={{ margin: 0 }}>Bidding needs its tabs in the Sheet first (see the note above).</p>
            </div>
          )
        }
        matches={
          <div className="stack" style={{ ["--gap" as string]: "12px" }}>
            <Notice tone="muted" icon="info">
              Potential matches only: nobody is contacted automatically and no availability is guaranteed. Record what a
              contractor said about this request on their card; their bid can be selected once their start date is
              confirmed.
            </Notice>
            <MatchResults result={result} request={request} extras={extras} />
          </div>
        }
        job={
          workspace?.panel ? (
            <JobPanel {...workspace.panel} />
          ) : (
            <div className="card empty stack" style={{ ["--gap" as string]: "10px" }}>
              <h2 className="h2">The job cannot be shown</h2>
              <p className="muted" style={{ margin: 0 }}>The Jobs tab is not set up in the Sheet yet (see the note above).</p>
            </div>
          )
        }
      />
    </div>
  );
}
