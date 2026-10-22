// Server-only: bidding rounds, bid invitations, bids and choosing a bidder.
// Every function takes the Sheet as an argument so it can be tested without
// Google. No phone numbers are ever read or written here, and nothing is sent to
// anyone.
//
// Who may do what:
//   - the administrator (the caller must already have checked the admin
//     session) opens and closes bidding, creates invitations, corrects or
//     voids a bid, and chooses the bidder;
//   - a contractor can only submit ONE bid, through a private invitation link.
//     The contractor and the request come from the stored invitation, never
//     from anything the browser sends.
//
// Google Sheets has no cross-tab transaction. Choosing a bidder writes the
// Jobs tab first (the one source of truth for who was selected) and then an
// audit marker in the Bids tab. If the second write fails, the job is still
// correctly recorded and repeating the same choice completes the marker
// (it is idempotent); nothing is rolled back or hidden.
import { latestByPair, pairKey } from "./confirmation";
import { findRequestAndCandidate, loadConfirmations } from "./confirmation-store";
import { SheetSetupError, type ContractorSheet } from "./contractor-store";
import {
  BID_TABLE,
  biddingState,
  cleanDeadline,
  foldBids,
  foldRound,
  selectedBidMarker,
  standing,
  validateBid,
  CURRENCY,
  type Bid,
  type BidErrors,
  type BidRow,
  type BiddingState,
  type Round,
} from "./bid";
import {
  BID_INVITE_TABLE,
  TOKEN_PATTERN,
  bidInviteExpiry,
  evaluateBidInvite,
  generateToken,
  hashToken,
  hashesMatch,
  parseBidInviteRow,
  type BidInvite,
} from "./bid-invite";
import type { Job } from "./job";
import { cleanReason } from "./job";
import { loadJobs, selectContractor, type JobEnv, type JobResult } from "./job-store";
import { DEFAULT_LANGUAGE, parseLanguage, type LanguageCode } from "./language";
import { latestLanguageByEntity, loadLanguageRecords } from "./language-store";
import { loadRequests } from "./records";
import type { RecordType } from "./registration";
import { appendTableRow, readTable, withLock } from "./tables";

const RECORDED_BY = "founder (admin login)";
const ID = { request: /^R-[A-Z2-9]{8}$/, contractor: /^C-[A-Z2-9]{8}$/, bid: /^B-[A-Z2-9]{8}$/ };

export type BidEnv = JobEnv; // { recordType, today, now? }
const nowOf = (env: { now?: Date }) => (env.now ?? new Date()).getTime();

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function loadBidRows(sheet: ContractorSheet): Promise<BidRow[]> {
  return (await readTable(sheet, BID_TABLE)) as BidRow[];
}

export async function loadBids(sheet: ContractorSheet, recordType: RecordType): Promise<Bid[]> {
  return foldBids(await loadBidRows(sheet), recordType);
}

export async function loadBidInvites(sheet: ContractorSheet, recordType: RecordType): Promise<BidInvite[]> {
  const rows = await readTable(sheet, BID_INVITE_TABLE);
  return rows.flatMap((r) => {
    const invite = parseBidInviteRow(r);
    return invite && invite.recordType === recordType ? [invite] : [];
  });
}

async function orEmpty<T>(work: Promise<T[]>): Promise<T[]> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof SheetSetupError) return []; // an optional tab that does not exist yet
    throw error;
  }
}

async function requestFor(sheet: ContractorSheet, requestId: unknown, recordType: RecordType) {
  if (typeof requestId !== "string" || !ID.request.test(requestId)) return null;
  return (await loadRequests(sheet)).find((r) => r.id === requestId && r.recordType === recordType) ?? null;
}

type Snapshot = { rows: BidRow[]; round: Round; bids: Bid[]; job: Job | undefined; state: BiddingState };

// Everything about one request's bidding, read fresh from the Sheet.
async function snapshot(sheet: ContractorSheet, requestId: string, env: BidEnv): Promise<Snapshot> {
  const rows = await loadBidRows(sheet);
  const round = foldRound(rows, env.recordType, requestId);
  const bids = foldBids(rows, env.recordType).filter((b) => b.requestId === requestId);
  const job = (await loadJobs(sheet, env.recordType)).find((j) => j.requestId === requestId);
  return { rows, round, bids, job, state: biddingState(round, job, nowOf(env)) };
}

async function writeRow(
  sheet: ContractorSheet,
  env: BidEnv,
  row: Partial<BidRow> & Pick<BidRow, "bid_id" | "request_id" | "event">,
) {
  await appendTableRow(sheet, BID_TABLE, {
    bid_id: row.bid_id,
    record_type: env.recordType,
    request_id: row.request_id,
    contractor_id: row.contractor_id ?? "",
    event: row.event,
    rate_amount: row.rate_amount ?? "",
    currency: row.rate_amount ? CURRENCY : "",
    rate_unit: row.rate_unit ?? "",
    notes: row.notes ?? "",
    notes_language: row.notes_language ?? "",
    closes_at: row.closes_at ?? "",
    invite_id: row.invite_id ?? "",
    recorded_at: (env.now ?? new Date()).toISOString(), // trusted server time, never from the browser
    recorded_by: row.recorded_by ?? RECORDED_BY,
    reason: row.reason ?? "",
  });
}

// ---------------------------------------------------------------------------
// The bidding round (administrator)
// ---------------------------------------------------------------------------

export type RoundResult =
  | { ok: true; state: BiddingState }
  | { ok: false; error: "invalid" | "not_found" | "wrong_state" | "already_selected" }
  | { ok: false; error: "validation"; errors: Record<string, string> };

async function changeRound(
  sheet: ContractorSheet,
  args: { requestId: unknown; reason?: unknown; deadline?: unknown },
  env: BidEnv,
  event: "opened" | "closed" | "reopened" | "cancelled",
  newId: () => string,
): Promise<RoundResult> {
  const request = await requestFor(sheet, args.requestId, env.recordType);
  if (!request) return { ok: false, error: "not_found" };
  const needsReason = event === "reopened" || event === "cancelled";
  const reason = cleanReason(args.reason, needsReason);
  if (!reason.ok) return { ok: false, error: "validation", errors: { reason: reason.error } };
  const deadline = event === "opened" || event === "reopened" ? cleanDeadline(args.deadline, env.today) : ({ ok: true, value: "" } as const);
  if (!deadline.ok) return { ok: false, error: "validation", errors: { deadline: deadline.error } };

  return withLock(`bids:${request.id}`, async () => {
    const snap = await snapshot(sheet, request.id, env);
    if (snap.job) return { ok: false as const, error: "already_selected" as const };
    const from = snap.round.state;
    const allowed =
      (event === "opened" && from === "not_opened") ||
      (event === "closed" && from === "open") ||
      (event === "cancelled" && (from === "open" || from === "closed")) ||
      (event === "reopened" && (from === "closed" || from === "cancelled"));
    if (!allowed) return { ok: false as const, error: "wrong_state" as const };
    await writeRow(sheet, env, { bid_id: newId(), request_id: request.id, event, closes_at: deadline.value, reason: reason.value });
    return { ok: true as const, state: (await snapshot(sheet, request.id, env)).state };
  });
}

export const openBidding = (sheet: ContractorSheet, args: { requestId: unknown; deadline?: unknown }, env: BidEnv, newId: () => string) =>
  changeRound(sheet, args, env, "opened", newId);
export const closeBidding = (sheet: ContractorSheet, args: { requestId: unknown }, env: BidEnv, newId: () => string) =>
  changeRound(sheet, args, env, "closed", newId);
export const cancelBidding = (sheet: ContractorSheet, args: { requestId: unknown; reason: unknown }, env: BidEnv, newId: () => string) =>
  changeRound(sheet, args, env, "cancelled", newId);
// The explicit, reasoned administrative reopening.
export const reopenBidding = (
  sheet: ContractorSheet,
  args: { requestId: unknown; reason: unknown; deadline?: unknown },
  env: BidEnv,
  newId: () => string,
) => changeRound(sheet, args, env, "reopened", newId);

// ---------------------------------------------------------------------------
// Invitations (administrator)
// ---------------------------------------------------------------------------

export type CreateBidInviteResult =
  | { ok: true; token: string; inviteId: string; expiresAt: string }
  | { ok: false; error: "invalid" | "not_found" | "bidding_not_open" | "not_candidate" | "unavailable" | "already_bid" };

// The returned token is the ONLY copy of the link: the Sheet keeps just its
// digest. The contractor must be a CURRENT potential match for the request
// (trade and locality), so a link can never make an ineligible contractor
// eligible. Nothing is sent to the contractor by this function.
export async function createBidInvite(
  sheet: ContractorSheet,
  args: { requestId: unknown; contractorId: unknown },
  env: BidEnv,
  newId: () => string,
): Promise<CreateBidInviteResult> {
  if (typeof args.requestId !== "string" || typeof args.contractorId !== "string") return { ok: false, error: "invalid" };
  if (!ID.request.test(args.requestId) || !ID.contractor.test(args.contractorId)) return { ok: false, error: "invalid" };
  const request = await requestFor(sheet, args.requestId, env.recordType);
  if (!request) return { ok: false, error: "not_found" };
  const contractorId = args.contractorId;

  return withLock(`bids:${request.id}`, async () => {
    const snap = await snapshot(sheet, request.id, env);
    if (snap.state !== "open") return { ok: false as const, error: "bidding_not_open" as const };
    if (snap.bids.some((b) => b.contractorId === contractorId)) return { ok: false as const, error: "already_bid" as const };
    const found = await findRequestAndCandidate(sheet, request.id, contractorId, env.recordType, env.now);
    if (!found) return { ok: false as const, error: "not_candidate" as const };
    const latest = latestByPair(await orEmpty(loadConfirmations(sheet, env.recordType))).get(pairKey(request.id, contractorId));
    if (latest?.status === "unavailable") return { ok: false as const, error: "unavailable" as const };

    const nowMs = nowOf(env);
    const token = generateToken();
    const inviteId = newId();
    const expiresAt = bidInviteExpiry(nowMs);
    await appendTableRow(sheet, BID_INVITE_TABLE, {
      invite_id: inviteId,
      record_type: env.recordType,
      request_id: request.id,
      contractor_id: contractorId,
      token_hash: hashToken(token),
      created_at: new Date(nowMs).toISOString(),
      expires_at: expiresAt,
      created_by: RECORDED_BY,
    });
    return { ok: true as const, token, inviteId, expiresAt };
  });
}

// ---------------------------------------------------------------------------
// Using an invitation (contractor)
// ---------------------------------------------------------------------------

async function findInvite(sheet: ContractorSheet, token: unknown, recordType: RecordType): Promise<BidInvite | null> {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  const digest = hashToken(token);
  let found: BidInvite | null = null;
  for (const invite of await loadBidInvites(sheet, recordType)) {
    if (hashesMatch(invite.tokenHash, digest)) found = invite; // keeps comparing every row: no early exit
  }
  return found;
}

export type BidFormInfo = {
  // Enough to recognise the job and nothing private: no developer name or
  // phone, no description, no other contractor, no other bid.
  trade: string;
  area: string;
  startDate: string;
  durationDays: number | null;
  provisional: boolean; // the start date still needs confirming: the bid is provisional
  preferredLanguage: LanguageCode;
};

export type DescribeBidInviteResult =
  | { ok: true; info: BidFormInfo }
  | { ok: false; reason: "invalid" | "expired" | "used" | "closed" | "unavailable" };

async function contractorLanguage(sheet: ContractorSheet, recordType: RecordType, contractorId: string): Promise<LanguageCode> {
  try {
    const record = latestLanguageByEntity(await loadLanguageRecords(sheet, recordType)).get(`contractor|${contractorId}`);
    if (record) return record.preferredLanguage;
  } catch (error) {
    if (!(error instanceof SheetSetupError)) throw error; // the Languages tab may not exist yet
  }
  return DEFAULT_LANGUAGE;
}

export async function describeBidInvite(
  sheet: ContractorSheet,
  token: unknown,
  env: { recordType: RecordType; now?: Date },
): Promise<DescribeBidInviteResult> {
  const invite = await findInvite(sheet, token, env.recordType);
  if (!invite) return { ok: false, reason: "invalid" };
  const benv: BidEnv = { ...env, today: "" };
  const snap = await snapshot(sheet, invite.requestId, benv);
  const invites = (await loadBidInvites(sheet, env.recordType)).filter((i) => i.requestId === invite.requestId && i.contractorId === invite.contractorId);
  const state = evaluateBidInvite(invite, {
    nowMs: nowOf(env),
    state: snap.state,
    invitesForPair: invites,
    bidExists: snap.bids.some((b) => b.contractorId === invite.contractorId),
  });
  if (state === "used") return { ok: false, reason: "used" };
  if (state === "closed") return { ok: false, reason: "closed" };
  if (state === "expired") return { ok: false, reason: "expired" };
  if (state !== "active") return { ok: false, reason: "unavailable" };

  const found = await findRequestAndCandidate(sheet, invite.requestId, invite.contractorId, env.recordType, env.now);
  if (!found) return { ok: false, reason: "unavailable" };
  const latest = latestByPair(await orEmpty(loadConfirmations(sheet, env.recordType))).get(pairKey(invite.requestId, invite.contractorId));
  if (latest?.status === "unavailable") return { ok: false, reason: "unavailable" };
  const ok = standing(found.candidate, latest, found.request).ok;
  return {
    ok: true,
    info: {
      trade: found.request.trade,
      area: found.request.area,
      startDate: found.request.startDate,
      durationDays: found.request.durationDays,
      provisional: !ok,
      preferredLanguage: await contractorLanguage(sheet, env.recordType, invite.contractorId),
    },
  };
}

export type SubmitBidResult =
  | { ok: true; bidId: string; provisional: boolean }
  | { ok: false; error: "invalid_link" | "expired" | "closed" | "unavailable" | "already_bid" | "not_eligible" | "invalid" }
  | { ok: false; error: "validation"; errors: BidErrors };

// Saves ONE bid. Every check runs here, on the server, on every submission:
//   1. the token is well formed and matches a stored digest;
//   2. this contractor has not already bid on this request (first row wins,
//      even if two submissions or two servers race);
//   3. bidding is open and the invitation is current (not expired or replaced);
//   4. the contractor is still a current match for the request, and has not
//      said they are unavailable;
//   5. the price, unit and notes are valid;
//   6. the contractor and request come from the stored invitation.
// A bid never confirms the contractor's start date: if the date needs
// confirming, the bid is saved as provisional (see lib/bid.ts, standing()).
export async function submitBid(
  sheet: ContractorSheet,
  args: { token: unknown; input: unknown; language: unknown },
  env: { recordType: RecordType; now?: Date },
  newId: () => string,
): Promise<SubmitBidResult> {
  const invite = await findInvite(sheet, args.token, env.recordType);
  if (!invite) return { ok: false, error: "invalid_link" };
  if (typeof args.input !== "object" || args.input === null || Array.isArray(args.input)) return { ok: false, error: "invalid" };
  const language = args.language === undefined ? DEFAULT_LANGUAGE : parseLanguage(args.language);
  if (!language) return { ok: false, error: "invalid" };
  const benv: BidEnv = { ...env, today: "" };

  return withLock(`bids:${invite.requestId}`, async () => {
    const snap = await snapshot(sheet, invite.requestId, benv);
    const invites = (await loadBidInvites(sheet, env.recordType)).filter((i) => i.requestId === invite.requestId && i.contractorId === invite.contractorId);
    const state = evaluateBidInvite(invite, {
      nowMs: nowOf(env),
      state: snap.state,
      invitesForPair: invites,
      bidExists: snap.bids.some((b) => b.contractorId === invite.contractorId),
    });
    if (state === "used") return { ok: false as const, error: "already_bid" as const };
    if (state === "closed") return { ok: false as const, error: "closed" as const };
    if (state === "expired") return { ok: false as const, error: "expired" as const };
    if (state !== "active") return { ok: false as const, error: "unavailable" as const };

    const found = await findRequestAndCandidate(sheet, invite.requestId, invite.contractorId, env.recordType, env.now);
    const latest = latestByPair(await orEmpty(loadConfirmations(sheet, env.recordType))).get(pairKey(invite.requestId, invite.contractorId));
    if (!found || latest?.status === "unavailable") return { ok: false as const, error: "not_eligible" as const };

    const verdict = validateBid(args.input as { amount: unknown; unit: unknown; notes?: unknown });
    if (!verdict.ok) return { ok: false as const, error: "validation" as const, errors: verdict.errors };

    const id = newId();
    await writeRow(sheet, benv, {
      bid_id: id,
      request_id: invite.requestId,
      contractor_id: invite.contractorId, // from the stored invitation, never from the form
      event: "submitted",
      rate_amount: verdict.value.amount,
      rate_unit: verdict.value.unit,
      notes: verdict.value.notes,
      notes_language: language,
      invite_id: invite.id,
      recorded_by: "contractor (invitation link)",
    });

    // If another server wrote at the same moment, the first row in the Sheet is
    // the real bid and this one is ignored.
    const mine = (await loadBids(sheet, env.recordType)).find((b) => b.requestId === invite.requestId && b.contractorId === invite.contractorId);
    if (!mine || mine.id !== id) return { ok: false as const, error: "already_bid" as const };
    return { ok: true as const, bidId: id, provisional: !standing(found.candidate, latest, found.request).ok };
  });
}

// ---------------------------------------------------------------------------
// Administrative correction (never a second bid)
// ---------------------------------------------------------------------------

export type CorrectBidResult =
  | { ok: true; bid: Bid }
  | { ok: false; error: "invalid" | "not_found" | "job_selected" | "voided" | "nothing_changed" }
  | { ok: false; error: "validation"; errors: Record<string, string> };

async function findBid(snap: Snapshot, bidId: unknown): Promise<Bid | null> {
  if (typeof bidId !== "string" || !ID.bid.test(bidId)) return null;
  return snap.bids.find((b) => b.id === bidId) ?? null;
}

// Corrects the amount, unit or notes of an EXISTING bid, with a reason, as a new
// row on the same bid. The contractor still has exactly one bid, the earlier
// values stay in the history, and nothing can be corrected after a contractor
// has been selected.
export async function correctBid(
  sheet: ContractorSheet,
  args: { requestId: unknown; bidId: unknown; input: unknown; reason: unknown },
  env: BidEnv,
): Promise<CorrectBidResult> {
  const reason = cleanReason(args.reason, true);
  if (!reason.ok) return { ok: false, error: "validation", errors: { reason: reason.error } };
  if (typeof args.input !== "object" || args.input === null || Array.isArray(args.input)) return { ok: false, error: "invalid" };
  const verdict = validateBid(args.input as { amount: unknown; unit: unknown; notes?: unknown });
  if (!verdict.ok) return { ok: false, error: "validation", errors: verdict.errors as Record<string, string> };
  const request = await requestFor(sheet, args.requestId, env.recordType);
  if (!request) return { ok: false, error: "not_found" };

  return withLock(`bids:${request.id}`, async () => {
    const snap = await snapshot(sheet, request.id, env);
    const bid = await findBid(snap, args.bidId);
    if (!bid) return { ok: false as const, error: "not_found" as const };
    if (snap.job) return { ok: false as const, error: "job_selected" as const };
    if (bid.voided) return { ok: false as const, error: "voided" as const };
    const v = verdict.value;
    if (v.amount === bid.amount && v.unit === bid.unit && v.notes === bid.notes) return { ok: false as const, error: "nothing_changed" as const };
    await writeRow(sheet, env, {
      bid_id: bid.id,
      request_id: request.id,
      contractor_id: bid.contractorId,
      event: "corrected",
      rate_amount: v.amount,
      rate_unit: v.unit,
      notes: v.notes,
      notes_language: bid.notesLanguage,
      reason: reason.value,
    });
    return { ok: true as const, bid: (await findBid(await snapshot(sheet, request.id, env), bid.id))! };
  });
}

// Withdraws a bid from consideration, with a reason. The contractor cannot then
// submit a different bid: the one-bid rule still holds.
export async function voidBid(
  sheet: ContractorSheet,
  args: { requestId: unknown; bidId: unknown; reason: unknown },
  env: BidEnv,
): Promise<CorrectBidResult> {
  const reason = cleanReason(args.reason, true);
  if (!reason.ok) return { ok: false, error: "validation", errors: { reason: reason.error } };
  const request = await requestFor(sheet, args.requestId, env.recordType);
  if (!request) return { ok: false, error: "not_found" };

  return withLock(`bids:${request.id}`, async () => {
    const snap = await snapshot(sheet, request.id, env);
    const bid = await findBid(snap, args.bidId);
    if (!bid) return { ok: false as const, error: "not_found" as const };
    if (snap.job) return { ok: false as const, error: "job_selected" as const };
    if (bid.voided) return { ok: false as const, error: "voided" as const };
    await writeRow(sheet, env, { bid_id: bid.id, request_id: request.id, contractor_id: bid.contractorId, event: "voided", reason: reason.value });
    return { ok: true as const, bid: (await findBid(await snapshot(sheet, request.id, env), bid.id))! };
  });
}

// ---------------------------------------------------------------------------
// Choosing the bidder (administrator)
// ---------------------------------------------------------------------------

export type SelectBidderResult =
  | { ok: true; job: Job; bidId: string; completedMarker: boolean }
  | { ok: false; error: "no_bid" | "bidding_not_open" | "not_candidate" }
  | Exclude<JobResult, { ok: true }>;

// Records the contractor behind a bid as the job's contractor, through the same
// code as Phase 4 (selectContractor), so a contractor whose start date is not
// confirmed for THIS request, or who said "unavailable", is refused exactly as
// before. The Jobs row is the one source of truth; the "selected" row in the
// Bids tab only records which bid it was.
export async function selectBidder(
  sheet: ContractorSheet,
  args: { requestId: unknown; bidId: unknown },
  env: BidEnv,
  newJobId: () => string,
): Promise<SelectBidderResult> {
  const request = await requestFor(sheet, args.requestId, env.recordType);
  if (!request) return { ok: false, error: "not_found" };

  return withLock(`bids:${request.id}`, async () => {
    const snap = await snapshot(sheet, request.id, env);
    const bid = await findBid(snap, args.bidId);
    if (!bid || bid.voided) return { ok: false as const, error: "no_bid" as const };

    // Repeating the same choice (a retry, a double click, or finishing after a
    // failure between the two writes) is safe.
    if (snap.job) {
      if (snap.job.contractorId !== bid.contractorId || snap.job.status === "cancelled") return { ok: false as const, error: "already_selected" as const };
      const marker = selectedBidMarker(snap.rows, env.recordType, request.id, snap.bids);
      if (marker && marker.bidId === bid.id) return { ok: true as const, job: snap.job, bidId: bid.id, completedMarker: false };
      // No marker yet, or the latest one names a different bidder (the contractor
      // was changed since): this bid's contractor IS on the job, so record it.
      await writeRow(sheet, env, { bid_id: bid.id, request_id: request.id, contractor_id: bid.contractorId, event: "selected" });
      return { ok: true as const, job: snap.job, bidId: bid.id, completedMarker: true };
    }

    if (snap.state !== "open" && snap.state !== "closed") return { ok: false as const, error: "bidding_not_open" as const };

    const found = await findRequestAndCandidate(sheet, request.id, bid.contractorId, env.recordType, env.now);
    const latest = latestByPair(await orEmpty(loadConfirmations(sheet, env.recordType))).get(pairKey(request.id, bid.contractorId));
    const verdict = standing(found?.candidate, latest, request);
    if (!verdict.ok) {
      if (verdict.reason === "not_candidate") return { ok: false as const, error: "not_candidate" as const };
      if (verdict.reason === "unavailable") return { ok: false as const, error: "unavailable" as const };
      return { ok: false as const, error: "not_confirmed" as const, reason: verdict.why };
    }

    const result = await selectContractor(sheet, { requestId: request.id, contractorId: bid.contractorId }, env, newJobId);
    if (!result.ok) return result;
    await writeRow(sheet, env, { bid_id: bid.id, request_id: request.id, contractor_id: bid.contractorId, event: "selected" });
    return { ok: true as const, job: result.job, bidId: bid.id, completedMarker: true };
  });
}

// ---------------------------------------------------------------------------
// Keeping the audit marker in step with the Jobs tab
// ---------------------------------------------------------------------------

export type ChosenBidMarker = "recorded" | "none" | "failed";

// After a contractor is recorded on a job by ANY route (choosing a bid, the Phase
// 4 "record this contractor" box, or changing the contractor), makes sure the Bids
// tab names the contractor's bid as chosen, if they have a live one. The Jobs tab
// stays the source of truth: this only completes the audit trail.
//   recorded  a "selected" row was added
//   none      nothing to do (no bid, no bid tabs yet, or already recorded)
//   failed    the job is correct but the marker could not be written; choosing
//             that bidder again (or any later change) completes it
export async function recordChosenBid(
  sheet: ContractorSheet,
  args: { requestId: unknown },
  env: BidEnv,
): Promise<ChosenBidMarker> {
  if (typeof args.requestId !== "string" || !ID.request.test(args.requestId)) return "none";
  const requestId = args.requestId;
  try {
    return await withLock(`bids:${requestId}`, async () => {
      const snap = await snapshot(sheet, requestId, env);
      if (!snap.job || snap.job.status === "cancelled") return "none" as const;
      const bid = snap.bids.find((b) => b.contractorId === snap.job!.contractorId && !b.voided);
      if (!bid) return "none" as const;
      if (selectedBidMarker(snap.rows, env.recordType, requestId, snap.bids)?.bidId === bid.id) return "none" as const;
      await writeRow(sheet, env, { bid_id: bid.id, request_id: requestId, contractor_id: bid.contractorId, event: "selected" });
      return "recorded" as const;
    });
  } catch (error) {
    if (error instanceof SheetSetupError) return "none"; // no bid tabs yet, so there are no bids
    return "failed";
  }
}
