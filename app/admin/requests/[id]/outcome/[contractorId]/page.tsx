import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SheetSetupError } from "@/lib/contractor-store";
import {
  getContractorSheet,
  getRecordType,
  NotConfiguredError,
} from "@/lib/google-sheets";
import { loadRequests } from "@/lib/records";
import { loadFormValues } from "@/lib/outcome-store";
import AdminShell from "../../../../AdminShell";
import OutcomeForm from "./OutcomeForm";

export const metadata: Metadata = { title: "Record outcome | Contractor Desk" };

type Props = PageProps<"/admin/requests/[id]/outcome/[contractorId]">;

export default function OutcomePage(props: Props) {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
      <AdminShell>
        <OutcomeContent params={props.params} />
      </AdminShell>
    </Suspense>
  );
}

async function OutcomeContent({ params }: { params: Props["params"] }) {
  const { id, contractorId } = await params;
  const recordType = getRecordType();

  let form;
  let request;
  try {
    const sheet = getContractorSheet();
    form = await loadFormValues(sheet, id, contractorId, recordType);
    request = form
      ? (await loadRequests(sheet)).find((r) => r.id === id && r.recordType === recordType)
      : undefined;
  } catch (error) {
    const label =
      error instanceof NotConfiguredError
        ? "sheets_not_configured"
        : error instanceof SheetSetupError
          ? "sheets_header_mismatch"
          : "sheets_request_failed";
    console.error(`[admin/outcome] ${label}`);
    return (
      <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        {error instanceof NotConfiguredError
          ? "Google Sheets is not set up on this server yet."
          : "Could not read the Sheet. Check the setup (including the Outcomes tab headers) and try again."}
      </p>
    );
  }

  if (!form || !request) {
    return (
      <div className="mt-6">
        <p role="status" className="rounded-md border border-zinc-300 bg-zinc-50 p-4 text-sm">
          That request and contractor were not found among the {recordType} records.
        </p>
        <Link href="/admin/requests" className="mt-3 inline-block text-sm text-blue-800 underline">
          &larr; Back to requests
        </Link>
      </div>
    );
  }

  return (
    <>
      <Link href={`/admin/requests/${request.id}`} className="mt-6 inline-block text-sm text-blue-800 underline">
        &larr; Back to the request
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Record what happened</h1>
      <p className="mt-2 text-sm text-zinc-700">
        {request.trade} request in {request.area} · contractor{" "}
        <span className="font-mono">{contractorId}</span>. Record only what you
        know. Anything you leave blank stays blank: nothing is guessed. No names,
        phone numbers or message text are stored with outcomes.
      </p>
      <OutcomeForm
        initial={form.values}
        exists={form.exists}
        requestCreatedAt={request.createdAt}
      />
    </>
  );
}
