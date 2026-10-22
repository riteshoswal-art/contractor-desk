import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SheetSetupError } from "@/lib/contractor-store";
import { loadContactContext } from "@/lib/contact";
import {
  getContractorSheet,
  getRecordType,
  NotConfiguredError,
} from "@/lib/google-sheets";
import AdminShell from "../../../../AdminShell";
import ContactComposer from "./ContactComposer";

export const metadata: Metadata = { title: "Prepare message | Contractor Desk" };

type Props = PageProps<"/admin/requests/[id]/contact/[contractorId]">;

export default function ContactPage(props: Props) {
  return (
    <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
      <AdminShell>
        <ContactContent params={props.params} />
      </AdminShell>
    </Suspense>
  );
}

async function ContactContent({ params }: { params: Props["params"] }) {
  const { id, contractorId } = await params;

  let found;
  try {
    found = await loadContactContext(getContractorSheet(), id, contractorId, {
      recordType: getRecordType(),
      testContactPhone: "",
      realContactAllowed: false,
    });
  } catch (error) {
    const label =
      error instanceof NotConfiguredError
        ? "sheets_not_configured"
        : error instanceof SheetSetupError
          ? "sheets_header_mismatch"
          : "sheets_request_failed";
    console.error(`[admin/contact] ${label}`);
    return (
      <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        {error instanceof NotConfiguredError
          ? "Google Sheets is not set up on this server yet."
          : "Could not read the Sheet. Check the setup and try again."}
      </p>
    );
  }

  if (!found) {
    return (
      <div className="mt-6">
        <p role="status" className="rounded-md border border-zinc-300 bg-zinc-50 p-4 text-sm">
          This contractor is not a current potential match for that request.
        </p>
        <Link href="/admin/requests" className="mt-3 inline-block text-sm text-blue-800 underline">
          &larr; Back to requests
        </Link>
      </div>
    );
  }

  const { request, candidate } = found;
  return (
    <>
      <Link
        href={`/admin/requests/${request.id}`}
        className="mt-6 inline-block text-sm text-blue-800 underline"
      >
        &larr; Back to the request
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Prepare a message
      </h1>
      <p className="mt-2 text-sm text-zinc-700">
        For {candidate.name || "a contractor with no name on record"}{" "}
        <span className="font-mono">{candidate.contractorId}</span> (
        {candidate.recordType}), about the {request.trade} request in{" "}
        {request.area}. Availability is not guaranteed, and nothing is sent
        automatically. You read the message and press send yourself.
      </p>
      <ContactComposer requestId={request.id} contractorId={candidate.contractorId} />
      <p className="mt-8 border-t border-zinc-200 pt-4 text-sm text-zinc-700">
        After you have pressed send in WhatsApp (or decided not to), come back
        and{" "}
        <Link
          href={`/admin/requests/${request.id}/outcome/${candidate.contractorId}`}
          className="font-medium text-blue-800 underline"
        >
          record what happened
        </Link>
        . Opening the link is not recorded anywhere.
      </p>
    </>
  );
}
