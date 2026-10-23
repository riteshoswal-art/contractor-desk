// Server-only: works out what the operator overview shows from the stored
// records. Every number comes from the Sheet (or the local records); nothing is
// estimated. The Bids, Jobs, Confirmations, ReviewInvites and Reviews tabs are
// optional: when one has not been set up, the figures that need it show "—"
// and the page names the missing tab. Phone numbers are never loaded here.
import { biddingState, BID_TABLE, foldBids, foldRound, standing, type BiddingState, type BidRow } from "@/lib/bid";
import { loadBidRows } from "@/lib/bid-store";
import { CONFIRMATION_TABLE, latestByPair, pairKey, type Confirmation } from "@/lib/confirmation";
import { loadConfirmations } from "@/lib/confirmation-store";
import { SheetSetupError, type ContractorSheet } from "@/lib/contractor-store";
import { INVITE_TABLE, type Invite } from "@/lib/invite";
import { JOB_TABLE, type Job } from "@/lib/job";
import { buildJobRows } from "@/lib/job-overview";
import { loadJobs } from "@/lib/job-store";
import { formatDate, matchContractors, type RequestRecord } from "@/lib/match";
import { loadContractors } from "@/lib/records";
import type { RecordType } from "@/lib/registration";
import { REVIEW_TABLE, type Review } from "@/lib/review";
import { loadInvites, loadReviews } from "@/lib/review-store";

export type PillTone = "pill-ok" | "pill-warn" | "pill-info" | "pill-muted" | "pill-dark";

export type RequestRowView = {
  request: RequestRecord;
  matches: number | null; // null: could not be worked out
  bids: number | null; // null: the Bids tab is not set up
  status: string;
  tone: PillTone;
};

export type AttentionItem = { key: string; icon: "cal" | "users" | "star" | "check"; title: string; sub: string; href: string };

export type Overview = {
  rows: RequestRowView[];
  facts: { openRequests: number; biddingOpen: number | null; startDatesToConfirm: number | null; reviewsReceived: number | null };
  attention: AttentionItem[];
  missingTabs: string[];
};

function statusOf(job: Job | undefined, state: BiddingState | null, matches: number | null, stored: string): [string, PillTone] {
  if (job?.status === "completed") return ["Job completed", "pill-ok"];
  if (job?.status === "cancelled") return ["Job cancelled", "pill-muted"];
  if (job) return ["Contractor selected", "pill-dark"];
  if (state === "open") return ["Bidding open", "pill-info"];
  if (state === "closed") return ["Bidding closed", "pill-warn"];
  if (state === "cancelled") return ["Bidding cancelled", "pill-muted"];
  if (matches === 0) return ["Awaiting matches", "pill-warn"];
  return [stored || "New requirement", "pill-muted"];
}

export async function loadOverview(
  sheet: ContractorSheet,
  recordType: RecordType,
  requests: RequestRecord[],
  nowMs: number,
): Promise<Overview> {
  const missing: string[] = [];
  const optional = async <T>(tab: string, work: Promise<T[]>): Promise<T[] | null> => {
    try {
      return await work;
    } catch (error) {
      if (!(error instanceof SheetSetupError)) throw error;
      missing.push(tab);
      console.error(`[admin/requests] ${tab.toLowerCase()}_tab_not_set_up`);
      return null;
    }
  };

  const contractors = (await loadContractors(sheet)).filter((c) => c.recordType === recordType);
  const bidRows: BidRow[] | null = await optional(BID_TABLE.tab, loadBidRows(sheet));
  const jobs: Job[] | null = await optional(JOB_TABLE.tab, loadJobs(sheet, recordType));
  const confirmations: Confirmation[] | null = await optional(CONFIRMATION_TABLE.tab, loadConfirmations(sheet, recordType));
  const invites: Invite[] | null = await optional(INVITE_TABLE.tab, loadInvites(sheet, recordType));
  const reviews: Review[] | null = await optional(REVIEW_TABLE.tab, loadReviews(sheet, recordType));

  const bids = bidRows ? foldBids(bidRows, recordType) : null;
  const latest = confirmations ? latestByPair(confirmations) : null;
  const names = new Map(contractors.map((c) => [c.id, c.name]));
  const attention: AttentionItem[] = [];
  let biddingOpen = 0;
  let startDatesToConfirm = 0;

  const rows = requests.map((request): RequestRowView => {
    const result = matchContractors(request, contractors, { envType: recordType, max: Number.MAX_SAFE_INTEGER });
    const matches = result.requestIncomplete ? null : result.eligibleCount;
    const job = jobs?.find((j) => j.requestId === request.id);
    const state = bidRows && jobs ? biddingState(foldRound(bidRows, recordType, request.id), job, nowMs) : null;
    const live = bids ? bids.filter((b) => b.requestId === request.id && !b.voided) : null;
    if (state === "open") biddingOpen += 1;

    // Bids that cannot be chosen until the contractor's start date is
    // confirmed for this request (the same rule the request page uses).
    if (live && latest && !job) {
      for (const b of live) {
        const candidate = result.candidates.find((c) => c.contractorId === b.contractorId);
        const verdict = standing(candidate, latest.get(pairKey(request.id, b.contractorId)), request);
        if (!verdict.ok && verdict.reason === "not_confirmed") {
          startDatesToConfirm += 1;
          attention.push({
            key: `confirm-${b.id}`,
            icon: "cal",
            title: `Confirm ${names.get(b.contractorId) || b.contractorId}’s start date`,
            sub: `${request.id} · bid is provisional until then`,
            href: `/admin/requests/${request.id}`,
          });
        }
      }
    }
    if (state === "closed") {
      attention.push({
        key: `choose-${request.id}`,
        icon: "check",
        title: `Record the choice for ${request.trade} in ${request.area}`,
        sub: `${request.id} · bidding closed · ${live?.length ?? 0} bid${live?.length === 1 ? "" : "s"}`,
        href: `/admin/requests/${request.id}`,
      });
    }
    if (matches === 0 && !job && (state === null || state === "not_opened")) {
      attention.push({
        key: `matches-${request.id}`,
        icon: "users",
        title: `No potential matches for ${request.trade} in ${request.area}`,
        sub: `${request.id} · consider registering more contractors`,
        href: `/admin/requests/${request.id}`,
      });
    }

    const [status, tone] = statusOf(job, state, matches, request.status);
    return { request, matches, bids: live ? live.length : null, status, tone };
  });

  let reviewsReceived: number | null = null;
  if (jobs && invites && reviews) {
    const jobRows = buildJobRows({ jobs, invites, reviews, requests, contractors, nowMs });
    reviewsReceived = jobRows.filter((r) => r.review !== null).length;
    for (const r of jobRows.filter((j) => j.awaitingInvitation)) {
      attention.push({
        key: `review-${r.job.id}`,
        icon: "star",
        title: "Send a review link",
        sub: `${r.job.requestId} · job completed${r.job.completionDate ? ` ${formatDate(r.job.completionDate)}` : ""}`,
        href: `/admin/requests/${r.job.requestId}`,
      });
    }
  }

  const openRequests = requests.filter((r) => {
    const job = jobs?.find((j) => j.requestId === r.id);
    return !job || job.status === "selected";
  }).length;

  return {
    rows,
    facts: {
      openRequests,
      biddingOpen: bidRows && jobs ? biddingOpen : null,
      startDatesToConfirm: bids && latest ? startDatesToConfirm : null,
      reviewsReceived,
    },
    attention,
    missingTabs: missing,
  };
}
