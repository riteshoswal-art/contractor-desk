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
    <Suspense fallback={<p className="p-6 text-sm">Loading…</p>}>
      <AdminShell>
        <Overview />
      </AdminShell>
    </Suspense>
  );
}

const th = "border-b border-zinc-300 px-2 py-2 text-left font-medium text-zinc-700";
const td = "border-b border-zinc-200 px-2 py-2 align-top";
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
      <p role="alert" className="mt-6 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        {error instanceof NotConfiguredError ? "Google Sheets is not set up on this server yet." : "Could not read the Sheet. Check the setup and try again."}
      </p>
    );
  }

  const rows = buildJobRows({ jobs, invites, reviews, requests, contractors, nowMs: currentTimeMs() });
  const ratings = contractorRatings(summariesByContractor(reviews, jobs), contractors);
  const count = (fn: (r: (typeof rows)[number]) => boolean) => rows.filter(fn).length;

  return (
    <>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Jobs and reviews</h1>
      <p className="mt-2 text-sm text-zinc-700">
        Jobs are created on a request&apos;s page, where you record the contractor the developer chose and later mark the job
        completed or cancelled. Reviews come only from developers you invite after a job is completed.
      </p>

      {missing.length > 0 && (
        <p role="status" className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          Not set up in the Sheet yet: {missing.map((t) => `"${t}"`).join(", ")}. Nothing below can be recorded or shown for{" "}
          {missing.length === 1 ? "this tab" : "these tabs"} until it exists. See the README, section &ldquo;One-time Sheet setup&rdquo;.
        </p>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        {[
          ["Jobs recorded", rows.length],
          ["In progress", count((r) => r.job.status === "selected")],
          ["Completed", count((r) => r.job.status === "completed")],
          ["Cancelled", count((r) => r.job.status === "cancelled")],
          ["Completed, awaiting an invitation", count((r) => r.awaitingInvitation)],
          ["Reviews received", count((r) => r.review !== null)],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-md border border-zinc-300 p-3">
            <dt className="text-zinc-600">{label}</dt>
            <dd className="text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-8 text-lg font-semibold">Jobs</h2>
      {rows.length === 0 ? (
        <p className="mt-2 rounded-md border border-zinc-300 bg-zinc-50 p-4 text-sm">
          No job has been recorded yet. Open a request and use &ldquo;Job and review&rdquo; to record the contractor the developer
          chose.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>Request</th>
                <th className={th}>Contractor</th>
                <th className={th}>Outcome</th>
                <th className={th}>Review invitation</th>
                <th className={th}>Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.job.id}>
                  <td className={td}>
                    <Link href={`/admin/requests/${r.job.requestId}`} className="font-mono text-blue-800 underline">
                      {r.job.requestId}
                    </Link>
                    <div className="text-zinc-600">{r.trade} in {r.area}</div>
                  </td>
                  <td className={td}>
                    {r.contractorName || "Name not given"}
                    <div className="font-mono text-zinc-600">{r.job.contractorId}</div>
                  </td>
                  <td className={td}>
                    {JOB_STATUS_LABELS[r.job.status]}
                    {r.job.status === "completed" && (
                      <div className="text-zinc-600">{r.job.completionDate ? formatDate(r.job.completionDate) : "date not recorded"}</div>
                    )}
                    <div className="text-zinc-600">{r.job.history.length} change{r.job.history.length === 1 ? "" : "s"} recorded</div>
                  </td>
                  <td className={td}>
                    {r.job.status !== "completed"
                      ? "Not applicable"
                      : r.invite.state === "none"
                        ? "None created yet"
                        : INVITE_STATE_TEXT[r.invite.state]}
                    {r.awaitingInvitation && <div className="font-medium text-amber-900">Needs an invitation</div>}
                  </td>
                  <td className={td}>
                    {r.review ? (
                      <details>
                        <summary className="cursor-pointer text-blue-800">Received: {r.review.overall} / 5</summary>
                        <div className="mt-1 space-y-1">
                          <p>
                            Workmanship {score(r.review.workmanship)}, punctuality {score(r.review.punctuality)}, communication {score(r.review.communication)}.
                          </p>
                          {r.review.comment && (
                            <p className="whitespace-pre-wrap">
                              <span className="font-medium">Feedback ({languageName(r.review.commentLanguage)}, as written):</span> {r.review.comment}
                            </p>
                          )}
                          {r.review.comment && r.review.commentEnglish && (
                            <p className="whitespace-pre-wrap">
                              <span className="font-medium">English version:</span> {r.review.commentEnglish}
                            </p>
                          )}
                          {r.review.comment && !r.review.commentEnglish && <p className="text-zinc-600">English version pending.</p>}
                          <p className="text-zinc-600">Submitted {formatDate(r.review.submittedAt)}</p>
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

      <h2 className="mt-8 text-lg font-semibold">Contractor ratings</h2>
      <p className="mt-1 text-sm text-zinc-700">
        Plain averages of real reviews of completed jobs, always shown with the number of reviews. Fewer than three reviews is
        marked &ldquo;too few to judge&rdquo;. A contractor with no reviews is &ldquo;Not yet rated&rdquo;, not a low score.
      </p>
      {ratings.length === 0 ? (
        <p className="mt-2 rounded-md border border-zinc-300 bg-zinc-50 p-4 text-sm">No contractor has a review yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr>
                <th className={th}>Contractor</th>
                <th className={th}>Rating</th>
                <th className={th}>Workmanship</th>
                <th className={th}>Punctuality</th>
                <th className={th}>Communication</th>
              </tr>
            </thead>
            <tbody>
              {ratings.map((r) => (
                <tr key={r.contractorId}>
                  <td className={td}>
                    {r.contractorName || "Name not given"}
                    <div className="font-mono text-zinc-600">{r.contractorId}</div>
                  </td>
                  <td className={td}>{ratingText(r.summary)}</td>
                  {(["workmanship", "punctuality", "communication"] as const).map((k) => (
                    <td key={k} className={td}>
                      {r.summary.criteria[k].average === null ? "—" : `${r.summary.criteria[k].average!.toFixed(1)} (${r.summary.criteria[k].count})`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
