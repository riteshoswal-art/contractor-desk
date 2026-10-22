// Builds what the administrator's comparison panel shows. Pure: it takes
// already-loaded records and returns plain data for the page.
//
// Privacy: this module never receives phone numbers (it is given names and IDs
// only), and it never receives invitation tokens or token digests. Nothing it
// returns can leak either.
import {
  BIDDING_STATE_TEXT,
  RATE_UNITS,
  formatBidPrice,
  groupByUnit,
  standing,
  type Bid,
  type BiddingState,
  type Round,
} from "./bid";
import { BID_INVITE_STATE_TEXT, evaluateBidInvite, type BidInvite, type BidInviteState } from "./bid-invite";
import { NOT_CONFIRMED_TEXT, confirmedStart, latestByPair, pairKey, type Confirmation } from "./confirmation";
import type { Job } from "./job";
import { formatDate, type Candidate, type RequestRecord } from "./match";
import { CRITERIA, ratingText, type ReviewComment, type ReviewSummary } from "./review";

export type BidStanding = "eligible" | "provisional" | "unavailable" | "not_candidate" | "voided";

export const STANDING_TEXT: Record<BidStanding, string> = {
  eligible: "Can be selected",
  provisional: "Provisional: start date not confirmed yet",
  unavailable: "Said unavailable for this request",
  not_candidate: "No longer a potential match for this request",
  voided: "Withdrawn by the administrator",
};

export type BidView = {
  bidId: string;
  contractorId: string;
  contractorName: string;
  price: string;
  amount: string;
  unit: string;
  notes: string;
  notesLanguage: string;
  submittedAt: string;
  corrected: boolean;
  chosen: boolean;
  standing: BidStanding;
  standingText: string;
  startText: string; // what is actually known about their start date
  rating: string;
  reviewCount: number;
  criteria: string[]; // e.g. "Workmanship 4.0 (2)"; only where there is data
  recentComments: ReviewComment[]; // latest written feedback from valid reviews, newest first
  canSelect: boolean;
  history: { event: string; price: string; recordedAt: string; reason: string }[];
};

export type PriceGroupView = { unit: string; label: string; fixedScope: boolean; bids: BidView[] };

export type InvitedView = { contractorId: string; contractorName: string; stateText: string; state: BidInviteState };

export type BidPanelData = {
  requestId: string;
  state: BiddingState;
  stateText: string;
  closesAt: string;
  requestedStart: string;
  canSelect: boolean; // bidding is open or closed, and nobody has been selected
  groups: PriceGroupView[];
  withdrawn: BidView[];
  invited: InvitedView[]; // invited, no bid yet
  inviteOptions: { id: string; label: string; disabled: boolean; why?: string }[];
  roundHistory: { event: string; recordedAt: string; reason: string }[];
  selectedContractorId: string;
  selectedBidId: string; // "" when the contractor was recorded without a bid
  ratingsAvailable: boolean;
};

export function buildBidPanel(args: {
  request: RequestRecord;
  round: Round;
  state: BiddingState;
  job: Job | undefined;
  bids: Bid[]; // this request's bids only
  invites: BidInvite[]; // this request's invitations only, oldest first
  candidates: Candidate[]; // every CURRENT potential match
  contractorNames: Map<string, string>;
  confirmations: Confirmation[];
  summaries: Map<string, ReviewSummary> | null; // null: ratings could not be read
  reviewComments?: Map<string, ReviewComment[]>; // per contractor; missing means none to show
  nowMs: number;
}): BidPanelData {
  const { request, job } = args;
  const latest = latestByPair(args.confirmations);
  const nameOf = (id: string) => args.contractorNames.get(id) || "Name not given";
  const candidateOf = (id: string) => args.candidates.find((c) => c.contractorId === id);
  const chosenBid = job ? args.bids.find((b) => b.contractorId === job.contractorId && !b.voided) : undefined;
  const selectionOpen = !job && (args.state === "open" || args.state === "closed");

  function view(b: Bid): BidView {
    const confirmation = latest.get(pairKey(request.id, b.contractorId));
    const candidate = candidateOf(b.contractorId);
    const verdict = b.voided ? null : standing(candidate, confirmation, request);
    const st: BidStanding = b.voided
      ? "voided"
      : verdict!.ok
        ? "eligible"
        : verdict!.reason === "not_candidate"
          ? "not_candidate"
          : verdict!.reason === "unavailable"
            ? "unavailable"
            : "provisional";

    const state = confirmedStart(confirmation, request);
    const startText = state.confirmed
      ? `Confirmed for ${formatDate(state.startDate)}${state.exactDate ? " (the requested date)" : " (not the requested date)"}.`
      : candidate && candidate.startFit.label === null
        ? "Said they are available from the requested date (their own statement, not confirmed for this request)."
        : candidate
          ? `Not confirmed. ${NOT_CONFIRMED_TEXT[state.reason]} ${candidate.startFit.label ?? ""}`.trim()
          : `Not confirmed. ${NOT_CONFIRMED_TEXT[state.reason]}`;

    const summary = args.summaries?.get(b.contractorId);
    const criteria = summary
      ? CRITERIA.flatMap(({ key, label }) => {
          const c = summary.criteria[key];
          return c.average === null ? [] : [`${label} ${c.average.toFixed(1)} (${c.count})`];
        })
      : [];

    return {
      bidId: b.id,
      contractorId: b.contractorId,
      contractorName: nameOf(b.contractorId),
      price: formatBidPrice(b.amount, b.unit),
      amount: b.amount,
      unit: b.unit,
      notes: b.notes,
      notesLanguage: b.notesLanguage,
      submittedAt: b.submittedAt,
      corrected: b.corrected,
      chosen: chosenBid?.id === b.id,
      standing: st,
      standingText: chosenBid?.id === b.id ? "Selected for this job" : STANDING_TEXT[st],
      startText,
      rating: args.summaries ? ratingText(summary) : "Ratings could not be read",
      reviewCount: summary?.count ?? 0,
      criteria,
      recentComments: args.reviewComments?.get(b.contractorId) ?? [],
      canSelect: selectionOpen && st === "eligible",
      history: b.history.map((h) => ({
        event: h.event,
        price: formatBidPrice(h.amount, h.unit),
        recordedAt: h.recordedAt,
        reason: h.reason,
      })),
    };
  }

  const live = args.bids.filter((b) => !b.voided).map(view);
  const withdrawn = args.bids.filter((b) => b.voided).map(view);
  const groups = groupByUnit(live).map((g) => ({ unit: g.unit, label: g.label, fixedScope: g.fixedScope, bids: g.bids }));

  // Invited contractors who have not bid, with the state of their newest link.
  const invited: InvitedView[] = [];
  const pairs = new Set(args.invites.map((i) => i.contractorId));
  for (const contractorId of pairs) {
    if (args.bids.some((b) => b.contractorId === contractorId)) continue;
    const forPair = args.invites.filter((i) => i.contractorId === contractorId);
    const newest = forPair[forPair.length - 1];
    const state = evaluateBidInvite(newest, { nowMs: args.nowMs, state: args.state, invitesForPair: forPair, bidExists: false });
    invited.push({ contractorId, contractorName: nameOf(contractorId), state, stateText: BID_INVITE_STATE_TEXT[state] });
  }

  const inviteOptions = args.candidates.map((c) => {
    const bid = args.bids.find((b) => b.contractorId === c.contractorId);
    const said = latest.get(pairKey(request.id, c.contractorId))?.status === "unavailable";
    const why = bid ? "already bid" : said ? "said unavailable" : undefined;
    return { id: c.contractorId, label: `${nameOf(c.contractorId)} (${c.contractorId})`, disabled: Boolean(why), why };
  });

  return {
    requestId: request.id,
    state: args.state,
    stateText: BIDDING_STATE_TEXT[args.state],
    closesAt: args.state === "open" ? args.round.closesAt : "",
    requestedStart: request.startDate,
    canSelect: selectionOpen,
    groups,
    withdrawn,
    invited,
    inviteOptions,
    roundHistory: args.round.history.map((h) => ({ event: h.event, recordedAt: h.recordedAt, reason: h.reason })),
    selectedContractorId: job?.contractorId ?? "",
    selectedBidId: chosenBid?.id ?? "",
    ratingsAvailable: args.summaries !== null,
  };
}

export { RATE_UNITS };
