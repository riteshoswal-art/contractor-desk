// Server-only: review invitations and reviews. Takes the Sheet as an argument so
// it can be tested without Google. No phone numbers are ever read or written here.
//
// Who may review: only someone holding a valid invitation token. Nothing the
// reviewer sends (a request ID, a contractor ID) is believed: the job and the
// contractor are taken from the stored Job record the invitation points to.
import type { ContractorSheet } from "./contractor-store";
import { SheetSetupError } from "./contractor-store";
import {
  INVITE_TABLE,
  TOKEN_PATTERN,
  evaluateInvite,
  expiryFor,
  generateToken,
  hashToken,
  hashesMatch,
  parseInviteRow,
  type Invite,
  type InviteState,
} from "./invite";
import { loadJobs } from "./job-store";
import type { Job } from "./job";
import { latestLanguageByEntity, loadLanguageRecords } from "./language-store";
import { DEFAULT_LANGUAGE, parseLanguage, type LanguageCode } from "./language";
import { loadRequests } from "./records";
import type { RecordType } from "./registration";
import {
  REVIEW_TABLE,
  buildReviewRow,
  parseReviewRow,
  summariesByContractor,
  validReviews,
  validateReview,
  type Review,
  type ReviewErrors,
  type ReviewInput,
  type ReviewSummary,
} from "./review";
import { appendTableRow, readTable, withLock } from "./tables";
import { getTranslationProvider, normalizeToEnglish, type TranslationProvider } from "./translation";

const RECORDED_BY = "founder (admin login)";

export async function loadInvites(sheet: ContractorSheet, recordType: RecordType): Promise<Invite[]> {
  const rows = await readTable(sheet, INVITE_TABLE);
  return rows.flatMap((r) => {
    const invite = parseInviteRow(r);
    return invite && invite.recordType === recordType ? [invite] : [];
  });
}

export async function loadReviews(sheet: ContractorSheet, recordType: RecordType): Promise<Review[]> {
  const rows = await readTable(sheet, REVIEW_TABLE);
  return rows.flatMap((r) => {
    const review = parseReviewRow(r);
    return review && review.recordType === recordType ? [review] : [];
  });
}

// What the pages need to show quality: valid reviews only, summarised per
// contractor. A contractor with no entry has no reviews.
export async function loadSummaries(
  sheet: ContractorSheet,
  recordType: RecordType,
): Promise<Map<string, ReviewSummary>> {
  const [reviews, jobs] = await Promise.all([loadReviews(sheet, recordType), loadJobs(sheet, recordType)]);
  return summariesByContractor(reviews, jobs);
}

function stateOf(invite: Invite, jobs: Job[], invites: Invite[], reviews: Review[], nowMs: number): InviteState {
  const job = jobs.find((j) => j.requestId === invite.requestId);
  const reviewExistsForJob = job ? validReviews(reviews, jobs).some((r) => r.jobId === job.id) : false;
  const invitesForJob = invites.filter((i) => i.jobId === invite.jobId);
  return evaluateInvite(invite, { nowMs, job, invitesForJob, reviewExistsForJob });
}

// ---------------------------------------------------------------------------
// Creating an invitation (founder only: the caller must already have checked
// the admin session)
// ---------------------------------------------------------------------------

export type CreateInviteResult =
  | { ok: true; token: string; inviteId: string; expiresAt: string }
  | { ok: false; error: "invalid" | "no_job" | "not_completed" | "already_reviewed" };

// The returned token is the ONLY copy of the link: the Sheet keeps just its
// digest. Nothing is sent to the developer by this function.
export async function createInvite(
  sheet: ContractorSheet,
  args: { requestId: unknown },
  env: { recordType: RecordType; now?: Date },
  newId: () => string,
): Promise<CreateInviteResult> {
  if (typeof args.requestId !== "string" || !/^R-[A-Z2-9]{8}$/.test(args.requestId)) return { ok: false, error: "invalid" };
  const requestId = args.requestId;

  return withLock(`review:${requestId}`, async () => {
    const jobs = await loadJobs(sheet, env.recordType);
    const job = jobs.find((j) => j.requestId === requestId);
    if (!job) return { ok: false as const, error: "no_job" as const };
    if (job.status !== "completed") return { ok: false as const, error: "not_completed" as const };
    if (validReviews(await loadReviews(sheet, env.recordType), jobs).some((r) => r.jobId === job.id)) {
      return { ok: false as const, error: "already_reviewed" as const };
    }

    const nowMs = (env.now ?? new Date()).getTime();
    const token = generateToken();
    const inviteId = newId();
    const expiresAt = expiryFor(nowMs);
    await appendTableRow(sheet, INVITE_TABLE, {
      invite_id: inviteId,
      record_type: env.recordType,
      job_id: job.id,
      request_id: job.requestId,
      contractor_id: job.contractorId,
      token_hash: hashToken(token),
      created_at: new Date(nowMs).toISOString(),
      expires_at: expiresAt,
      created_by: RECORDED_BY,
    });
    return { ok: true as const, token, inviteId, expiresAt };
  });
}

// ---------------------------------------------------------------------------
// Using an invitation
// ---------------------------------------------------------------------------

async function findInvite(sheet: ContractorSheet, token: unknown, recordType: RecordType): Promise<Invite | null> {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  const digest = hashToken(token);
  let found: Invite | null = null;
  for (const invite of await loadInvites(sheet, recordType)) {
    if (hashesMatch(invite.tokenHash, digest)) found = invite; // keeps comparing every row: no early exit
  }
  return found;
}

export type InviteInfo = {
  // Enough to recognise the job, and nothing private: no names, no phone
  // numbers, no contractor identity, no other reviews.
  trade: string;
  area: string;
  startDate: string;
  completionDate: string;
  preferredLanguage: LanguageCode;
};

export type DescribeInviteResult =
  | { ok: true; info: InviteInfo }
  | { ok: false; reason: "invalid" | "expired" | "used" | "unavailable" };

export async function describeInvite(
  sheet: ContractorSheet,
  token: unknown,
  env: { recordType: RecordType; now?: Date },
): Promise<DescribeInviteResult> {
  const invite = await findInvite(sheet, token, env.recordType);
  if (!invite) return { ok: false, reason: "invalid" };

  const jobs = await loadJobs(sheet, env.recordType);
  const state = stateOf(invite, jobs, await loadInvites(sheet, env.recordType), await loadReviews(sheet, env.recordType), (env.now ?? new Date()).getTime());
  if (state === "expired") return { ok: false, reason: "expired" };
  if (state === "used") return { ok: false, reason: "used" };
  if (state !== "active") return { ok: false, reason: "unavailable" };

  const job = jobs.find((j) => j.requestId === invite.requestId)!;
  const request = (await loadRequests(sheet)).find((r) => r.id === job.requestId && r.recordType === env.recordType);
  if (!request) return { ok: false, reason: "unavailable" };

  let preferredLanguage: LanguageCode = DEFAULT_LANGUAGE;
  try {
    const record = latestLanguageByEntity(await loadLanguageRecords(sheet, env.recordType)).get(`request|${request.id}`);
    if (record) preferredLanguage = record.preferredLanguage;
  } catch (error) {
    if (!(error instanceof SheetSetupError)) throw error; // the Languages tab may not exist yet
  }
  return {
    ok: true,
    info: { trade: request.trade, area: request.area, startDate: request.startDate, completionDate: job.completionDate, preferredLanguage },
  };
}

export type SubmitReviewResult =
  | { ok: true; reviewId: string; translation: string }
  | { ok: false; error: "invalid_link" | "expired" | "unavailable" | "already_reviewed" | "invalid" }
  | { ok: false; error: "validation"; errors: ReviewErrors };

// Saves one review. Every check runs here, on the server, on every submission:
//   1. the token is well formed and matches a stored digest;
//   2. the invitation is active (job still completed and unchanged, not
//      expired, not replaced, no review for the job yet);
//   3. the scores and comment are valid;
//   4. the contractor and request come from the stored job, never from the form;
//   5. only the first review per job is kept, even if two arrive at once.
export async function submitReview(
  sheet: ContractorSheet,
  args: { token: unknown; input: unknown; language: unknown },
  env: { recordType: RecordType; now?: Date; provider?: TranslationProvider },
  newId: () => string,
): Promise<SubmitReviewResult> {
  const invite = await findInvite(sheet, args.token, env.recordType);
  if (!invite) return { ok: false, error: "invalid_link" };
  if (typeof args.input !== "object" || args.input === null || Array.isArray(args.input)) return { ok: false, error: "invalid" };
  const language = args.language === undefined ? DEFAULT_LANGUAGE : parseLanguage(args.language);
  if (!language) return { ok: false, error: "invalid" };

  return withLock(`review:${invite.jobId}`, async () => {
    const jobs = await loadJobs(sheet, env.recordType);
    const invites = await loadInvites(sheet, env.recordType);
    const reviews = await loadReviews(sheet, env.recordType);
    const nowMs = (env.now ?? new Date()).getTime();
    const state = stateOf(invite, jobs, invites, reviews, nowMs);
    if (state === "used") return { ok: false as const, error: "already_reviewed" as const };
    if (state === "expired") return { ok: false as const, error: "expired" as const };
    if (state !== "active") return { ok: false as const, error: "unavailable" as const };

    const verdict = validateReview(args.input as ReviewInput);
    if (!verdict.ok) return { ok: false as const, error: "validation" as const, errors: verdict.errors };

    // The contractor and the job come from the stored record, not from the reviewer.
    const job = jobs.find((j) => j.requestId === invite.requestId)!;

    // The original wording is kept as written. An English version exists only if
    // a real translation provider produced it (none is connected, so it is
    // "pending"). The text is never sent to Gemini or any AI service.
    const normalized = await normalizeToEnglish(verdict.value.comment, language, env.provider ?? getTranslationProvider());

    const id = newId();
    await appendTableRow(
      sheet,
      REVIEW_TABLE,
      buildReviewRow(verdict.value, {
        id,
        recordType: env.recordType,
        job,
        inviteId: invite.id,
        submittedAt: new Date(nowMs).toISOString(),
        commentLanguage: language,
        commentEnglish: normalized.englishText,
        translationStatus: normalized.status,
        translationMethod: normalized.method,
      }),
    );

    // If two servers wrote at the same moment, the first row in the Sheet is the
    // real review and the other is ignored.
    const first = validReviews(await loadReviews(sheet, env.recordType), jobs).find((r) => r.jobId === job.id);
    if (!first || first.id !== id) return { ok: false as const, error: "already_reviewed" as const };
    return { ok: true as const, reviewId: id, translation: normalized.status };
  });
}
