import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SheetSetupError } from "@/lib/contractor-store";
import {
  getContractorSheet,
  getRecordType,
  NotConfiguredError,
} from "@/lib/google-sheets";
import { formatDate, matchContractors } from "@/lib/match";
import { loadContractors, loadRequests } from "@/lib/records";
import AdminShell from "../../AdminShell";
import MatchResults from "../MatchResults";

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

async function RequestDetail({
  params,
}: {
  params: PageProps<"/admin/requests/[id]">["params"];
}) {
  const { id } = await params;
  const recordType = getRecordType();

  let request;
  let result;
  try {
    const sheet = getContractorSheet();
    const requests = await loadRequests(sheet);
    // Only requests from the current environment can be opened.
    request = requests.find((r) => r.id === id && r.recordType === recordType);
    if (request) {
      const contractors = await loadContractors(sheet);
      result = matchContractors(request, contractors, { envType: recordType });
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

      <MatchResults result={result} request={request} />
    </>
  );
}
