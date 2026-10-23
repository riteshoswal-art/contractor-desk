import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SheetSetupError } from "@/lib/contractor-store";
import {
  getContractorSheet,
  getRecordType,
  NotConfiguredError,
} from "@/lib/google-sheets";
import { currentTimeMs } from "@/lib/job-overview";
import { formatDate } from "@/lib/match";
import { loadRequests } from "@/lib/records";
import { Icon } from "../../ui";
import AdminShell from "../AdminShell";
import { loadOverview } from "./overview";

export const metadata: Metadata = { title: "Requests | Contractor Desk" };

export default function RequestsPage() {
  return (
    <Suspense fallback={<p className="page small muted">Loading…</p>}>
      <AdminShell>
        <RequestList />
      </AdminShell>
    </Suspense>
  );
}

const num = (n: number | null) => (n === null ? "—" : String(n));

async function RequestList() {
  await connection(); // bidding and invitation states depend on the current time
  const recordType = getRecordType();
  let requests;
  let overview;
  try {
    const sheet = getContractorSheet();
    requests = (await loadRequests(sheet)).filter(
      (r) => r.recordType === recordType,
    );
    requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    overview = await loadOverview(sheet, recordType, requests, currentTimeMs());
  } catch (error) {
    const label =
      error instanceof NotConfiguredError
        ? "sheets_not_configured"
        : error instanceof SheetSetupError
          ? "sheets_header_mismatch"
          : "sheets_request_failed";
    console.error(`[admin/requests] ${label}`);
    return (
      <p role="alert" className="notice notice-warn">
        {error instanceof NotConfiguredError
          ? "Google Sheets is not set up on this server yet."
          : "Could not read the Sheet. Check the setup and try again."}
      </p>
    );
  }

  const { rows, facts, attention, missingTabs } = overview;

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Operator · {recordType === "TEST" ? "test records" : "real records"}</span>
        <h1 className="h1" style={{ marginTop: 4 }}>
          Requests
        </h1>
      </div>

      <div className="facts facts-inline">
        {(
          [
            [facts.openRequests, "open requests"],
            [facts.biddingOpen, "bidding open"],
            [facts.startDatesToConfirm, "start dates to confirm"],
            [facts.reviewsReceived, "reviews received"],
          ] as [number | null, string][]
        ).map(([n, label]) => (
          <div key={label}>
            <b>{num(n)}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {missingTabs.length > 0 && (
        <p role="status" className="notice notice-warn small" style={{ marginBottom: 16 }}>
          Not set up in the Sheet yet: {missingTabs.map((t) => `"${t}"`).join(", ")}. Figures that need{" "}
          {missingTabs.length === 1 ? "this tab" : "these tabs"} show &ldquo;—&rdquo;.
        </p>
      )}

      {requests.length === 0 ? (
        <div role="status" className="card empty" style={{ textAlign: "center" }}>
          <span className="ic-box" style={{ margin: "0 auto 12px" }}>
            <Icon name="file" />
          </span>
          <p className="h3">No requests yet</p>
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            No {recordType} requests yet. Requests appear here after a developer
            submits the request form.
          </p>
        </div>
      ) : (
        <div className="card flat" style={{ padding: "8px 8px 0" }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Needed from</th>
                  <th>Duration</th>
                  <th>Matches</th>
                  <th>Bids</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ request: r, matches, bids, status, tone }) => (
                  <tr key={r.id} style={{ position: "relative" }}>
                    <td>
                      <Link
                        href={`/admin/requests/${r.id}`}
                        aria-label={`${r.trade} in ${r.area}, ${r.id}: find potential contractors`}
                        className="h3 block after:absolute after:inset-0 after:content-['']"
                        style={{ color: "var(--ink)", textDecoration: "none" }}
                      >
                        {r.trade} in {r.area}
                      </Link>
                      <div className="mono muted">{r.id}</div>
                      <div className="tiny muted">Received {formatDate(r.createdAt)}</div>
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.startDate ? formatDate(r.startDate) : "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{r.durationDays ? `${r.durationDays} days` : "—"}</td>
                    <td>{num(matches)}</td>
                    <td>{bids ? bids : "—"}</td>
                    <td>
                      <span className={`pill ${tone}`}>{status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {attention.length > 0 && (
        <div className="card stack" style={{ ["--gap" as string]: "12px", marginTop: 16 }}>
          <div className="row between">
            <h2 className="h2">Needs your attention</h2>
            <span className="pill pill-muted plain">{attention.length}</span>
          </div>
          {attention.map((a) => (
            <Link key={a.key} href={a.href} className="attn">
              <span className="ic-box">
                <Icon name={a.icon} />
              </span>
              <span className="grow">
                <span className="h3 block">{a.title}</span>
                <span className="small muted">{a.sub}</span>
              </span>
              <Icon name="arrow" size={16} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
