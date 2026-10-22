import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SheetSetupError } from "@/lib/contractor-store";
import {
  getContractorSheet,
  getRecordType,
  NotConfiguredError,
} from "@/lib/google-sheets";
import { formatDate } from "@/lib/match";
import { loadRequests } from "@/lib/records";
import AdminShell from "../AdminShell";

export const metadata: Metadata = { title: "Requests | Contractor Desk" };

export default function RequestsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
      <AdminShell>
        <RequestList />
      </AdminShell>
    </Suspense>
  );
}

async function RequestList() {
  const recordType = getRecordType();
  let requests;
  try {
    requests = (await loadRequests(getContractorSheet())).filter(
      (r) => r.recordType === recordType,
    );
  } catch (error) {
    const label =
      error instanceof NotConfiguredError
        ? "sheets_not_configured"
        : error instanceof SheetSetupError
          ? "sheets_header_mismatch"
          : "sheets_request_failed";
    console.error(`[admin/requests] ${label}`);
    return (
      <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        {error instanceof NotConfiguredError
          ? "Google Sheets is not set up on this server yet."
          : "Could not read the Sheet. Check the setup and try again."}
      </p>
    );
  }

  requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Developer requests
      </h1>
      {requests.length === 0 ? (
        <p role="status" className="mt-4 rounded-md border border-zinc-300 bg-zinc-50 p-4 text-sm">
          No {recordType} requests yet. Requests appear here after a developer
          submits the request form.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {requests.map((r) => (
            <li key={r.id} className="rounded-md border border-zinc-300 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {r.trade} in {r.area}
                </span>
                <span className="font-mono text-zinc-600">{r.id}</span>
              </div>
              <p className="mt-1 text-zinc-700">
                Received {formatDate(r.createdAt)}
                {r.startDate ? ` · needed from ${formatDate(r.startDate)}` : ""}
                {r.durationDays ? ` · about ${r.durationDays} days` : ""} ·{" "}
                {r.status}
              </p>
              <Link
                href={`/admin/requests/${r.id}`}
                className="mt-2 inline-block font-medium text-blue-800 underline"
              >
                Find potential contractors
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
