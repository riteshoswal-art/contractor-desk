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
import { Icon } from "../../../../../ui";
import { Avatar, BackLink, Notice } from "../../detail-ui";
import ContactComposer from "./ContactComposer";

export const metadata: Metadata = { title: "Prepare message | Contractor Desk" };

type Props = PageProps<"/admin/requests/[id]/contact/[contractorId]">;

export default function ContactPage(props: Props) {
  return (
    <Suspense fallback={<p className="small muted" style={{ padding: 24 }}>Loading…</p>}>
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
      <div style={{ marginTop: 24 }}>
        <Notice tone="warn" icon="info" role="alert">
          {error instanceof NotConfiguredError
            ? "Google Sheets is not set up on this server yet."
            : "Could not read the Sheet. Check the setup and try again."}
        </Notice>
      </div>
    );
  }

  if (!found) {
    return (
      <div className="stack" style={{ marginTop: 24, ["--gap" as string]: "12px" }}>
        <BackLink href="/admin/requests">Back to requests</BackLink>
        <Notice tone="muted" icon="info" role="status">
          This contractor is not a current potential match for that request.
        </Notice>
      </div>
    );
  }

  const { request, candidate } = found;
  return (
    <div style={{ marginTop: 24 }}>
      <div className="detail-head">
        <BackLink href={`/admin/requests/${request.id}`}>Back to the request</BackLink>
        <div className="stack" style={{ ["--gap" as string]: "10px" }}>
          <div className="row wrap">
            <span className="mono muted">{request.id}</span>
            <span className="pill pill-muted plain">
              <Icon name="chat" size={12} /> Message
            </span>
          </div>
          <h1 className="h1">Prepare a message</h1>
        </div>
        <div className="card flat tint row" style={{ alignItems: "flex-start", padding: 16 }}>
          <Avatar name={candidate.name || "Name not given"} />
          <p className="small" style={{ margin: 0 }}>
            For <b>{candidate.name || "a contractor with no name on record"}</b>{" "}
            <span className="mono muted">{candidate.contractorId}</span> ({candidate.recordType}), about the{" "}
            {request.trade} request in {request.area}.{" "}
            <span className="muted">
              Availability is not guaranteed, and nothing is sent automatically. You read the message and press send
              yourself.
            </span>
          </p>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 720 }}>
        <ContactComposer requestId={request.id} contractorId={candidate.contractorId} />
      </div>
      <p className="small muted" style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
        After you have pressed send in WhatsApp (or decided not to), come back and{" "}
        <Link prefetch={false}
          href={`/admin/requests/${request.id}/outcome/${candidate.contractorId}`}
          style={{ color: "var(--ink)", fontWeight: 600, textDecoration: "underline" }}
        >
          record what happened
        </Link>
        . Opening the link is not recorded anywhere.
      </p>
    </div>
  );
}
