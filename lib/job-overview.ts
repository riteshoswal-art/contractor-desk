// What the admin "Jobs and reviews" screen shows, worked out from the stored
// records. Pure: no Sheet access and no phone numbers (the contractor loader
// never reads them).
import { evaluateInvite, type Invite, type InviteState } from "./invite";
import type { Job } from "./job";
import type { ContractorRecord, RequestRecord } from "./match";
import { summarize, validReviews, type Review, type ReviewSummary } from "./review";

// The current time, read in one place. (Pages call this instead of reading the
// clock inside a component.)
export function currentTimeMs(): number {
  return Date.now();
}

export type InviteView =
  | { state: "none" }
  | { state: InviteState; createdAt: string; expiresAt: string; count: number };

export type JobRowView = {
  job: Job;
  trade: string;
  area: string;
  contractorName: string;
  invite: InviteView;
  review: Review | null;
  // completed, and no review has been received yet
  eligibleForFeedback: boolean;
  // eligible, but there is no working invitation (none made, or it expired / was replaced)
  awaitingInvitation: boolean;
};

export function buildJobRows(args: {
  jobs: Job[];
  invites: Invite[];
  reviews: Review[];
  requests: RequestRecord[];
  contractors: ContractorRecord[];
  nowMs: number;
}): JobRowView[] {
  const valid = validReviews(args.reviews, args.jobs);
  return args.jobs
    .map((job) => {
      const request = args.requests.find((r) => r.id === job.requestId);
      const contractor = args.contractors.find((c) => c.id === job.contractorId);
      const review = valid.find((r) => r.jobId === job.id) ?? null;
      const invites = args.invites.filter((i) => i.jobId === job.id);
      const latest = invites[invites.length - 1];
      const invite: InviteView = latest
        ? {
            state: evaluateInvite(latest, { nowMs: args.nowMs, job, invitesForJob: invites, reviewExistsForJob: review !== null }),
            createdAt: latest.createdAt,
            expiresAt: latest.expiresAt,
            count: invites.length,
          }
        : { state: "none" };
      const eligibleForFeedback = job.status === "completed" && review === null;
      return {
        job,
        trade: request?.trade ?? "",
        area: request?.area ?? "",
        contractorName: contractor?.name ?? "",
        invite,
        review,
        eligibleForFeedback,
        awaitingInvitation: eligibleForFeedback && (invite.state === "none" || invite.state !== "active"),
      };
    })
    .sort((a, b) => b.job.updatedAt.localeCompare(a.job.updatedAt));
}

export type ContractorRatingRow = {
  contractorId: string;
  contractorName: string;
  summary: ReviewSummary;
};

// Every contractor with at least one valid review, most reviews first, then
// highest average. Contractors with no reviews are not listed (they are simply
// "Not yet rated" wherever they appear).
export function contractorRatings(
  summaries: Map<string, ReviewSummary>,
  contractors: ContractorRecord[],
): ContractorRatingRow[] {
  return [...summaries]
    .map(([contractorId, summary]) => ({
      contractorId,
      contractorName: contractors.find((c) => c.id === contractorId)?.name ?? "",
      summary,
    }))
    .sort((a, b) => b.summary.count - a.summary.count || (b.summary.average ?? 0) - (a.summary.average ?? 0) || a.contractorId.localeCompare(b.contractorId));
}

export { summarize };
