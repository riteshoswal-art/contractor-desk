import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { SheetSetupError } from "@/lib/contractor-store";
import { getContractorSheet, getRecordType, NotConfiguredError } from "@/lib/google-sheets";
import { INVITE_STATE_TEXT, INVITE_TABLE, type Invite } from "@/lib/invite";
import { buildJobRows, contractorRatings, currentTimeMs } from "@/lib/job-overview";
import { JOB_STATUS_LABELS, JOB_TABLE, type Job } from "@/lib/job";
import { loadJobs } from "@/lib/job-store";
import { languageName } from "@/lib/language";
import { formatDate } from "@/lib/match";
import { loadContractors, loadRequests } from "@/lib/records";
import { REVIEW_TABLE, ratingText, summariesByContractor, type Review } from "@/lib/review";
import { loadInvites, loadReviews } from "@/lib/review-store";
import AdminShell from "../AdminShell";

export const metadata: Metadata = { title: "Jobs and reviews | Contractor Desk" };

// Admin only: AdminShell sends anyone who is not logged in to the login page
// before any of this is read.
export default function ReviewsPage() {
  return (
    <Suspense fallback={<p className="page small muted">Loading…</p>}>
      <AdminShell>
        <Overview />
      </AdminShell>
    </Suspense>
  );
}

const JOB_TONE: Record<Job["status"], string> = { selected: "pill-dark", completed: "pill-ok", cancelled: "pill-muted" };
const score = (n: number | null) => (n === null ? "—" : String(n));

async function Overview() {
  await connection(); // invitation states depend on the current time
  const recordType = getRecordType();
  const missing: string[] = [];
  let jobs: Job[] = [];
  let invites: Invite[] = [];
  let reviews: Review[] = [];
  let requests: Awaited<ReturnType<typeof loadRequests>> = [];
  let contractors: Awaited<ReturnType<typeof loadContractors>> = [];

  try {
    const sheet = getContractorSheet();
    requests = (await loadRequests(sheet)).filter((r) => r.recordType === recordType);
    contractors = (await loadContractors(sheet)).filter((c) => c.recordType === recordType);
    const tab = async <T,>(name: string, work: Promise<T[]>): Promise<T[]> => {
      try {
        return await work;
      } catch (error) {
        if (!(error instanceof SheetSetupError)) throw error;
        missing.push(name);
        console.error(`[admin/reviews] ${name.toLowerCase()}_tab_not_set_up`);
        return [];
      }
    };
    jobs = await tab(JOB_TABLE.tab, loadJobs(sheet, recordType));
    invites = await tab(INVITE_TABLE.tab, loadInvites(sheet, recordType));
    reviews = await tab(REVIEW_TABLE.tab, loadReviews(sheet, recordType));
  } catch (error) {
    const label =
      error instanceof NotConfiguredError ? "sheets_not_configured" : error instanceof SheetSetupError ? "sheets_header_mismatch" : "sheets_request_failed";
    console.error(`[admin/reviews] ${label}`);
    return (
      <p role="alert" className="notice notice-warn">
        {error instanceof NotConfiguredError ? "Google Sheets is not set up on this server yet." : "Could not read the Sheet. Check the setup and try again."}
      </p>
    );
  }

  const rows = buildJobRows({ jobs, invites, reviews, requests, contractors, nowMs: currentTimeMs() });
  const ratings = contractorRatings(summariesByContractor(reviews, jobs), contractors);
  const count = (fn: (r: (typeof rows)[number]) => boolean) => rows.filter(fn).length;

  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Operator</span>
        <h1 className="h1" style={{ marginTop: 4 }}>
          Jobs and reviews
        </h1>
        <p className="lead-sm" style={{ marginTop: 8, maxWidth: 760 }}>
          Jobs are created on a request&apos;s page, where you record the contractor the developer chose and later mark the job
          completed or cancelled. Reviews come only from developers you invite after a job is completed.
        </p>
      </div>

      {missing.length > 0 && (
        <p role="status" className="notice notice-warn" style={{ marginBottom: 20 }}>
          Not set up in the Sheet yet: {missing.map((t) => `"${t}"`).join(", ")}. Nothing below can be recorded or shown for{" "}
          {missing.length === 1 ? "this tab" : "these tabs"} until it exists. See the README, section &ldquo;One-time Sheet setup&rdquo;.
        </p>
      )}

      <dl className="grid grid-3" style={{ margin: "0 0 16px" }}>
        {[
          ["Jobs recorded", rows.length],
          ["In progress", count((r) => r.job.status === "selected")],
          ["Completed", count((r) => r.job.status === "completed")],
          ["Cancelled", count((r) => r.job.status === "cancelled")],
          ["Completed, awaiting an invitation", count((r) => r.awaitingInvitation)],
          ["Reviews received", count((r) => r.review !== null)],
        ].map(([label, value]) => (
          <div key={label as string} className="card stat">
            <dt className="small muted">{label}</dt>
            <dd className="stat-n" style={{ margin: 0 }}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <section className="card flat" style={{ padding: "20px 8px 0" }}>
        <div className="row between wrap" style={{ padding: "0 12px 8px" }}>
          <h2 className="h2">Jobs</h2>
          <span className="pill pill-muted plain">{rows.length}</span>
        </div>
        {rows.length === 0 ? (
          <p className="notice notice-muted" style={{ margin: "4px 12px 20px" }}>
            No job has been recorded yet. Open a request and use &ldquo;Job and review&rdquo; to record the contractor the developer
            chose.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ minWidth: "40rem" }}>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Contractor</th>
                  <th>Outcome</th>
                  <th>Review invitation</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.job.id} style={{ cursor: "default" }}>
                    <td style={{ verticalAlign: "top" }}>
                      <Link href={`/admin/requests/${r.job.requestId}`} className="h3 block" style={{ color: "var(--ink)", textDecoration: "none" }}>
                        {r.trade} in {r.area}
                      </Link>
                      <div className="mono muted">{r.job.requestId}</div>
                    </td>
                    <td style={{ verticalAlign: "top" }}>
                      {r.contractorName || "Name not given"}
                      <div className="mono muted">{r.job.contractorId}</div>
                    </td>
                    <td style={{ verticalAlign: "top" }}>
                      <span className={`pill ${JOB_TONE[r.job.status]}`}>{JOB_STATUS_LABELS[r.job.status]}</span>
                      {r.job.status === "completed" && (
                        <div className="small muted" style={{ marginTop: 4 }}>
                          {r.job.completionDate ? formatDate(r.job.completionDate) : "date not recorded"}
                        </div>
                      )}
                      <div className="tiny muted" style={{ marginTop: 2 }}>
                        {r.job.history.length} change{r.job.history.length === 1 ? "" : "s"} recorded
                      </div>
                    </td>
                    <td style={{ verticalAlign: "top" }}>
                      {r.job.status !== "completed"
                        ? "Not applicable"
                        : r.invite.state === "none"
                          ? "None created yet"
                          : INVITE_STATE_TEXT[r.invite.state]}
                      {r.awaitingInvitation && (
                        <div style={{ marginTop: 6 }}>
                          <span className="pill pill-warn">Needs an invitation</span>
                        </div>
                      )}
                    </td>
                    <td style={{ verticalAlign: "top" }}>
                      {r.review ? (
                        <details>
                          <summary className="cursor-pointer" style={{ fontWeight: 600 }}>
                            Received: {r.review.overall} / 5
                          </summary>
                          <div className="quote stack" style={{ ["--gap" as string]: "4px", marginTop: 6 }}>
                            <p style={{ margin: 0 }}>
                              Workmanship {score(r.review.workmanship)}, punctuality {score(r.review.punctuality)}, communication {score(r.review.communication)}.
                            </p>
                            {r.review.comment && (
                              <p className="whitespace-pre-wrap" style={{ margin: 0 }}>
                                <span style={{ fontWeight: 600 }}>Feedback ({languageName(r.review.commentLanguage)}, as written):</span> {r.review.comment}
                              </p>
                            )}
                            {r.review.comment && r.review.commentEnglish && (
                              <p className="whitespace-pre-wrap" style={{ margin: 0 }}>
                                <span style={{ fontWeight: 600 }}>English version:</span> {r.review.commentEnglish}
                              </p>
                            )}
                            {r.review.comment && !r.review.commentEnglish && (
                              <p className="muted" style={{ margin: 0 }}>
                                English version pending.
                              </p>
                            )}
                            <p className="tiny muted" style={{ margin: 0 }}>
                              Submitted {formatDate(r.review.submittedAt)}
                            </p>
                          </div>
                        </details>
                      ) : r.job.status === "completed" ? (
                        "Awaiting"
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card flat" style={{ padding: "20px 8px 0", marginTop: 16 }}>
        <div style={{ padding: "0 12px 8px" }}>
          <h2 className="h2">Contractor ratings</h2>
          <p className="small muted" style={{ margin: "4px 0 0", maxWidth: 760 }}>
            Plain averages of real reviews of completed jobs, always shown with the number of reviews. Fewer than three reviews is
            marked &ldquo;too few to judge&rdquo;. A contractor with no reviews is &ldquo;Not yet rated&rdquo;, not a low score.
          </p>
        </div>
        {ratings.length === 0 ? (
          <p className="notice notice-muted" style={{ margin: "4px 12px 20px" }}>
            No contractor has a review yet.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ minWidth: "34rem" }}>
              <thead>
                <tr>
                  <th>Contractor</th>
                  <th>Rating</th>
                  <th>Workmanship</th>
                  <th>Punctuality</th>
                  <th>Communication</th>
                </tr>
              </thead>
              <tbody>
                {ratings.map((r) => (
                  <tr key={r.contractorId} style={{ cursor: "default" }}>
                    <td>
                      <span className="h3 block">{r.contractorName || "Name not given"}</span>
                      <div className="mono muted">{r.contractorId}</div>
                    </td>
                    <td>{ratingText(r.summary)}</td>
                    {(["workmanship", "punctuality", "communication"] as const).map((k) => (
                      <td key={k}>
                        {r.summary.criteria[k].average === null ? "—" : `${r.summary.criteria[k].average!.toFixed(1)} (${r.summary.criteria[k].count})`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
