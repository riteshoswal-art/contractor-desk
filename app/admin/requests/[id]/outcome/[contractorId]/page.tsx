import type { Metadata } from "next";
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
import { BackLink, Notice } from "../../detail-ui";
import OutcomeForm from "./OutcomeForm";

export const metadata: Metadata = { title: "Record outcome | Contractor Desk" };

type Props = PageProps<"/admin/requests/[id]/outcome/[contractorId]">;

export default function OutcomePage(props: Props) {
  return (
    <Suspense fallback={<p className="small muted" style={{ padding: 24 }}>Loading…</p>}>
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
      <div style={{ marginTop: 24 }}>
        <Notice tone="warn" icon="info" role="alert">
          {error instanceof NotConfiguredError
            ? "Google Sheets is not set up on this server yet."
            : "Could not read the Sheet. Check the setup (including the Outcomes tab headers) and try again."}
        </Notice>
      </div>
    );
  }

  if (!form || !request) {
    return (
      <div className="stack" style={{ marginTop: 24, ["--gap" as string]: "12px" }}>
        <BackLink href="/admin/requests">Back to requests</BackLink>
        <Notice tone="muted" icon="info" role="status">
          That request and contractor were not found among the {recordType} records.
        </Notice>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24 }}>
      <div className="detail-head">
        <BackLink href={`/admin/requests/${request.id}`}>Back to the request</BackLink>
        <div className="stack" style={{ ["--gap" as string]: "10px" }}>
          <div className="row wrap">
            <span className="mono muted">{request.id}</span>
            <span className="mono muted">{contractorId}</span>
          </div>
          <h1 className="h1">Record what happened</h1>
        </div>
        <p className="small muted desc" style={{ margin: 0 }}>
          {request.trade} request in {request.area} · contractor <span className="mono">{contractorId}</span>. Record only
          what you know. Anything you leave blank stays blank: nothing is guessed. No names, phone numbers or message text
          are stored with outcomes.
        </p>
      </div>
      <div className="card" style={{ maxWidth: 720 }}>
        <OutcomeForm initial={form.values} exists={form.exists} requestCreatedAt={request.createdAt} />
      </div>
    </div>
  );
}
