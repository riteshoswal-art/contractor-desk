// Server-only: gathers what the request page needs about bidding. The two bid
// tabs (Bids, BidInvites) and the Jobs tab are optional: if one has not been
// created yet the page still works and says which tab is missing; nothing is
// guessed. Phone numbers are never loaded here.
import { connection } from "next/server";
import { biddingState, BID_TABLE, foldBids, foldRound } from "@/lib/bid";
import { BID_INVITE_TABLE } from "@/lib/bid-invite";
import { buildBidPanel, type BidPanelData } from "@/lib/bid-overview";
import { loadBidInvites, loadBidRows } from "@/lib/bid-store";
import type { Confirmation } from "@/lib/confirmation";
import { SheetSetupError, type ContractorSheet } from "@/lib/contractor-store";
import { JOB_TABLE } from "@/lib/job";
import { loadJobs } from "@/lib/job-store";
import { loadReviews } from "@/lib/review-store";
import { recentComments, type ReviewComment, type ReviewSummary } from "@/lib/review";
import { matchContractors, type ContractorRecord, type RequestRecord } from "@/lib/match";
import type { RecordType } from "@/lib/registration";


export type BidWorkspace = { missingTabs: string[]; panel: BidPanelData | null };

export async function loadBidWorkspace(
  sheet: ContractorSheet,
  recordType: RecordType,
  request: RequestRecord,
  contractors: ContractorRecord[],
  confirmations: Confirmation[],
  summaries: Map<string, ReviewSummary> | null,
): Promise<BidWorkspace> {
  await connection(); // bidding states and link states depend on the current time
  const missing: string[] = [];
  const need = async <T>(tab: string, work: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await work;
    } catch (error) {
      if (!(error instanceof SheetSetupError)) throw error;
      missing.push(tab);
      console.error(`[admin/bid] ${tab.toLowerCase()}_tab_not_set_up`);
      return fallback;
    }
  };

  const rows = await need(BID_TABLE.tab, loadBidRows(sheet), []);
  const invites = await need(BID_INVITE_TABLE.tab, loadBidInvites(sheet, recordType), []);
  const jobs = await need(JOB_TABLE.tab, loadJobs(sheet, recordType), []);
  if (missing.length > 0) return { missingTabs: missing, panel: null };


  // Written feedback to show beside each bid. The Reviews tab is optional here:
  // if it does not exist yet there is simply nothing to show (the panel already
  // says ratings could not be read when the summaries are unavailable).
  const reviewComments = new Map<string, ReviewComment[]>();
  try {
    const reviews = await loadReviews(sheet, recordType);
    for (const bid of foldBids(rows, recordType).filter((b) => b.requestId === request.id)) {
      const list = recentComments(reviews, jobs, bid.contractorId);
      if (list.length > 0) reviewComments.set(bid.contractorId, list);
    }
  } catch (error) {
    if (!(error instanceof SheetSetupError)) throw error;
  }
  const nowMs = Date.now();
  const round = foldRound(rows, recordType, request.id);
  const job = jobs.find((j) => j.requestId === request.id);
  const candidates = matchContractors(request, contractors, { envType: recordType, max: Number.MAX_SAFE_INTEGER }).candidates;
  const panel = buildBidPanel({
    request,
    round,
    state: biddingState(round, job, nowMs),
    job,
    bids: foldBids(rows, recordType).filter((b) => b.requestId === request.id),
    invites: invites.filter((i) => i.requestId === request.id),
    candidates,
    contractorNames: new Map(contractors.map((c) => [c.id, c.name])),
    confirmations,
    summaries,
    reviewComments,
    nowMs,
  });
  return { missingTabs: [], panel };
}
