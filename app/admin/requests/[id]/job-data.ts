// Server-only: gathers what the request page needs about the job and reviews.
// Each of the three newer tabs is optional: if one has not been created yet the
// page still works and says which tab is missing; nothing is guessed.
import { connection } from "next/server";
import { confirmedStart, latestByPair, pairKey, type Confirmation } from "@/lib/confirmation";
import { SheetSetupError, type ContractorSheet } from "@/lib/contractor-store";
import { INVITE_TABLE, type Invite } from "@/lib/invite";
import { buildJobRows } from "@/lib/job-overview";
import { loadJobs } from "@/lib/job-store";
import { JOB_TABLE, type Job } from "@/lib/job";
import { matchContractors, type ContractorRecord, type RequestRecord } from "@/lib/match";
import type { RecordType } from "@/lib/registration";
import { REVIEW_TABLE, summariesByContractor, type Review, type ReviewSummary } from "@/lib/review";
import { loadInvites, loadReviews } from "@/lib/review-store";
import { todayInIndia } from "@/lib/registration";
import type { JobPanelProps } from "./JobPanel";

export type JobWorkspace = {
  missingTabs: string[]; // names of newer tabs that do not exist yet
  panel: JobPanelProps | null; // null when the Jobs tab is missing
  summaries: Map<string, ReviewSummary> | null; // null when ratings cannot be read
};

async function optional<T>(tab: string, missing: string[], work: Promise<T>, fallback: T): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (!(error instanceof SheetSetupError)) throw error;
    missing.push(tab);
    console.error(`[admin/job] ${tab.toLowerCase()}_tab_not_set_up`);
    return fallback;
  }
}

const label = (c: ContractorRecord | undefined, id: string) => `${c?.name || "Name not given"} (${id})`;

export async function loadJobWorkspace(
  sheet: ContractorSheet,
  recordType: RecordType,
  request: RequestRecord,
  contractors: ContractorRecord[],
  confirmations: Confirmation[],
): Promise<JobWorkspace> {
  await connection(); // the invitation states below depend on the current time
  const missing: string[] = [];
  const jobs = await optional<Job[]>(JOB_TABLE.tab, missing, loadJobs(sheet, recordType), []);
  const jobsMissing = missing.includes(JOB_TABLE.tab);
  const invites = await optional<Invite[]>(INVITE_TABLE.tab, missing, loadInvites(sheet, recordType), []);
  const reviews = await optional<Review[]>(REVIEW_TABLE.tab, missing, loadReviews(sheet, recordType), []);

  // Ratings need both jobs and reviews; without either they are "unavailable",
  // which is different from "no reviews yet".
  const summaries = jobsMissing || missing.includes(REVIEW_TABLE.tab) ? null : summariesByContractor(reviews, jobs);
  if (jobsMissing) return { missingTabs: missing, panel: null, summaries };

  const all = matchContractors(request, contractors, { envType: recordType, max: Number.MAX_SAFE_INTEGER });
  const latest = latestByPair(confirmations);
  const options = all.candidates.map((c) => {
    const state = confirmedStart(latest.get(pairKey(request.id, c.contractorId)), request);
    const said = latest.get(pairKey(request.id, c.contractorId))?.status;
    const unavailable = said === "unavailable";
    const needs = c.startFit.label !== null && !state.confirmed;
    return {
      id: c.contractorId,
      label: label(contractors.find((x) => x.id === c.contractorId), c.contractorId),
      selectable: !unavailable && !needs,
      why: unavailable ? "said unavailable" : needs ? "start date not confirmed yet" : undefined,
    };
  });

  const job = jobs.find((j) => j.requestId === request.id) ?? null;
  const row = job
    ? buildJobRows({ jobs, invites, reviews, requests: [request], contractors, nowMs: Date.now() }).find((r) => r.job.id === job.id)
    : undefined;

  return {
    missingTabs: missing,
    summaries,
    panel: {
      requestId: request.id,
      today: todayInIndia(),
      options,
      job: job
        ? {
            contractorId: job.contractorId,
            contractorLabel: label(contractors.find((c) => c.id === job.contractorId), job.contractorId),
            status: job.status,
            completionDate: job.completionDate,
            contactShareCount: job.contactShares.length,
            lastContactShareAt: job.contactShares[job.contactShares.length - 1]?.recordedAt ?? "",
            history: job.history.map((h) => ({
              event: h.event,
              status: h.status,
              contractorLabel: label(contractors.find((c) => c.id === h.contractorId), h.contractorId),
              completionDate: h.completionDate,
              recordedAt: h.recordedAt,
              reason: h.reason,
            })),
          }
        : null,
      invite: row?.invite ?? { state: "none" },
      review: row?.review
        ? {
            submittedAt: row.review.submittedAt,
            overall: row.review.overall,
            workmanship: row.review.workmanship,
            punctuality: row.review.punctuality,
            communication: row.review.communication,
            comment: row.review.comment,
            commentLanguage: row.review.commentLanguage,
            commentEnglish: row.review.commentEnglish,
            translationStatus: row.review.translationStatus,
          }
        : null,
    },
  };
}
