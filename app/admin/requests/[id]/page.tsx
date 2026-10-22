import type { Metadata } from "next";
import Link from "next/link";
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
import JobPanel from "./JobPanel";
import { loadBidWorkspace, type BidWorkspace } from "./bid-data";
import { loadJobWorkspace, type JobWorkspace } from "./job-data";

export const metadata: Metadata = { title: "Request | Contractor Desk" };

export default function RequestDetailPage(
  props: PageProps<"/admin/requests/[id]">,
) {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
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
    <div className="mt-2 rounded-md border border-zinc-300 p-3 text-sm">
      <p>
        <span className="font-medium">Language chosen:</span> {languageName(record.preferredLanguage)}.{" "}
        {TRANSLATION_TEXT[record.translationStatus] ?? "Translation status not recorded."}
      </p>
      {record.englishText && (
        <p className="mt-2 whitespace-pre-wrap">
          <span className="font-medium">English version ({record.translationMethod}):</span> {record.englishText}
        </p>
      )}
      {record.englishNotes && (
        <p className="mt-2 whitespace-pre-wrap">
          <span className="font-medium">English version of the notes:</span> {record.englishNotes}
        </p>
      )}
    </div>
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
      <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        {error instanceof NotConfiguredError
          ? "Google Sheets is not set up on this server yet."
          : "Could not read the Sheet. Check the setup and try again."}
      </p>
    );
  }

  if (!request || !result) {
    return (
      <div className="mt-6">
        <p role="status" className="rounded-md border border-zinc-300 bg-zinc-50 p-4 text-sm">
          That request was not found among the {recordType} records.
        </p>
        <Link href="/admin/requests" className="mt-3 inline-block text-sm text-blue-800 underline">
          &larr; Back to requests
        </Link>
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

  return (
    <>
      <Link href="/admin/requests" className="mt-6 inline-block text-sm text-blue-800 underline">
        &larr; Back to requests
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        {request.trade} in {request.area}
      </h1>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-zinc-600">Request</dt>
        <dd className="font-mono">{request.id}</dd>
        <dt className="text-zinc-600">Received</dt>
        <dd>{formatDate(request.createdAt)}</dd>
        <dt className="text-zinc-600">Needed from</dt>
        <dd>{request.startDate ? formatDate(request.startDate) : "Not stated"}</dd>
        <dt className="text-zinc-600">Duration</dt>
        <dd>{request.durationDays ? `About ${request.durationDays} days` : "Not stated"}</dd>
        <dt className="text-zinc-600">Developer</dt>
        <dd>{request.developerName || "Name not given"}</dd>
        <dt className="text-zinc-600">Status</dt>
        <dd>{request.status}</dd>
      </dl>
      <p className="mt-3 whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-sm text-zinc-800">
        {request.description}
      </p>
      {languageRecord && <LanguageNote record={languageRecord} />}

      {!confirmationsReady && (
        <p role="status" className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          Availability confirmations are not set up in the Sheet yet (the
          &ldquo;Confirmations&rdquo; tab is missing), so statuses cannot be
          shown or recorded. Matching below still works. See the README, section
          &ldquo;One-time Sheet setup&rdquo;.
        </p>
      )}
      {workspace && workspace.missingTabs.length > 0 && (
        <p role="status" className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          Not set up in the Sheet yet: {workspace.missingTabs.map((t) => `"${t}"`).join(", ")}. Recording the
          chosen contractor, completion and reviews needs{" "}
          {workspace.missingTabs.length === 1 ? "this tab" : "these tabs"}. Matching below still works. See the README,
          section &ldquo;One-time Sheet setup&rdquo;.
        </p>
      )}
      {bidWorkspace && bidWorkspace.missingTabs.length > 0 && (
        <p role="status" className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          Bidding is not set up in the Sheet yet. Missing: {bidWorkspace.missingTabs.map((t) => `"${t}"`).join(", ")}.
          Nothing can be saved for bidding until {bidWorkspace.missingTabs.length === 1 ? "that tab exists" : "those tabs exist"}.
          See the README, section &ldquo;One-time Sheet setup&rdquo;.
        </p>
      )}
      {bidWorkspace?.panel && <BidPanel panel={bidWorkspace.panel} today={todayInIndia()} telegram={{ configured: telegramConfig().configured, testMode: recordType === "TEST" }} />}
      {workspace?.panel && <JobPanel {...workspace.panel} />}
      <MatchResults result={result} request={request} extras={extras} />
    </>
  );
}
