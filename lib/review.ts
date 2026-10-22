// Reviews and rating arithmetic. A review exists only for a COMPLETED job, comes
// from the developer who was invited for that job, and there is at most one per
// job. The ratings below are plain averages of real reviews and always come with
// the number of reviews behind them. There is deliberately no "Excellent" or
// "Poor" label: with few reviews such a label would claim more than the data
// shows, and "no reviews" is never shown as a low rating.
import type { Job } from "./job";
import type { LanguageCode } from "./language";
import type { RecordType } from "./registration";
import { defineTable } from "./tables";
import type { TranslationStatus } from "./translation";

export const REVIEW_TABLE = defineTable("Reviews", [
  "review_id",
  "record_type",
  "job_id",
  "request_id",
  "contractor_id",
  "invite_id",
  "submitted_at",
  "overall",
  "workmanship",
  "punctuality",
  "communication",
  "comment",
  "comment_language",
  "comment_english",
  "translation_status",
  "translation_method",
  "status",
] as const);

export const CRITERIA = [
  { key: "workmanship", label: "Workmanship" },
  { key: "punctuality", label: "Punctuality" },
  { key: "communication", label: "Communication" },
] as const;
export type CriterionKey = (typeof CRITERIA)[number]["key"];

export const COMMENT_MAX = 600;
// Fewer reviews than this is shown as "early", not as a settled picture.
export const MIN_REVIEWS_FOR_CONFIDENCE = 3;

export type ReviewInput = {
  overall?: unknown;
  workmanship?: unknown;
  punctuality?: unknown;
  communication?: unknown;
  comment?: unknown;
};
export type ReviewErrors = Partial<Record<keyof ReviewInput, string>>;

export type ValidReview = {
  overall: number;
  workmanship: number | null;
  punctuality: number | null;
  communication: number | null;
  comment: string;
};

// Whole numbers 1 to 5 only. The digit "4" typed or sent by a form is accepted;
// "4.5", "five", 0, 6, NaN, booleans and arrays are not.
function rating(value: unknown): number | null | "bad" {
  if (value === undefined || value === null || value === "") return null;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : "bad";
}

// These messages are translated by lib/i18n.ts, so their wording is fixed.
export function validateReview(
  input: ReviewInput,
): { ok: true; value: ValidReview } | { ok: false; errors: ReviewErrors } {
  const errors: ReviewErrors = {};

  const overall = rating(input.overall);
  if (overall === null) errors.overall = "Please give an overall score from 1 to 5.";
  else if (overall === "bad") errors.overall = "The overall score must be a whole number from 1 to 5.";

  const parts: Record<CriterionKey, number | null> = { workmanship: null, punctuality: null, communication: null };
  for (const { key } of CRITERIA) {
    const r = rating(input[key]);
    if (r === "bad") errors[key] = "Each optional score must be a whole number from 1 to 5, or left empty.";
    else parts[key] = r;
  }

  let comment = "";
  if (input.comment !== undefined && input.comment !== null && input.comment !== "") {
    if (typeof input.comment !== "string") {
      errors.comment = "The comment must be text.";
    } else {
      comment = input.comment.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
      if (comment.length > COMMENT_MAX) errors.comment = `Keep the comment to ${COMMENT_MAX} characters or fewer.`;
      else if (/\d{10}/.test(comment.replace(/[\s-]/g, ""))) errors.comment = "Please do not put phone numbers in the comment.";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { overall: overall as number, ...parts, comment } };
}

export type Review = {
  id: string;
  recordType: RecordType;
  jobId: string;
  requestId: string;
  contractorId: string;
  inviteId: string;
  submittedAt: string;
  overall: number;
  workmanship: number | null;
  punctuality: number | null;
  communication: number | null;
  comment: string;
  commentLanguage: LanguageCode | "";
  commentEnglish: string;
  translationStatus: TranslationStatus | "";
  translationMethod: string;
};

export function parseReviewRow(r: Record<string, string>): Review | null {
  if (r.record_type !== "TEST" && r.record_type !== "REAL") return null;
  if (!r.review_id || !r.job_id || !r.request_id || !r.contractor_id) return null;
  if (r.status !== "valid") return null; // reserved for later moderation: anything else does not count
  const overall = rating(r.overall);
  if (overall === null || overall === "bad") return null; // an unreadable score is not a review
  const opt = (v: string) => {
    const x = rating(v);
    return x === "bad" ? null : x;
  };
  const statuses = ["not_needed", "pending", "translated", "failed"];
  return {
    id: r.review_id,
    recordType: r.record_type,
    jobId: r.job_id,
    requestId: r.request_id,
    contractorId: r.contractor_id,
    inviteId: r.invite_id,
    submittedAt: r.submitted_at,
    overall,
    workmanship: opt(r.workmanship),
    punctuality: opt(r.punctuality),
    communication: opt(r.communication),
    comment: r.comment,
    commentLanguage: r.comment_language === "en" || r.comment_language === "hi" || r.comment_language === "mr" ? r.comment_language : "",
    commentEnglish: r.comment_english,
    translationStatus: statuses.includes(r.translation_status) ? (r.translation_status as TranslationStatus) : "",
    translationMethod: r.translation_method,
  };
}

// Only reviews that still make sense count. The job must exist, be completed NOW
// (a job later corrected to cancelled stops counting), and be the very job,
// request and contractor the review names. One review per job: the first row.
// Anything else in the tab, such as a hand-edited row, is ignored.
export function validReviews(reviews: Review[], jobs: Job[]): Review[] {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const seen = new Set<string>();
  const out: Review[] = [];
  for (const r of reviews) {
    const job = byId.get(r.jobId);
    if (!job || job.status !== "completed") continue;
    if (job.requestId !== r.requestId || job.contractorId !== r.contractorId) continue;
    if (seen.has(r.jobId)) continue;
    seen.add(r.jobId);
    out.push(r);
  }
  return out;
}

export type CriterionAverage = { average: number | null; count: number };
export type ReviewSummary = {
  count: number;
  average: number | null; // one decimal place
  criteria: Record<CriterionKey, CriterionAverage>;
  confidence: "none" | "early" | "established";
};

// Half rounds up. Integer arithmetic: the sum and the count are whole numbers,
// so the rounding does not depend on floating-point accumulation.
function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum * 10) / values.length) / 10;
}

// Each category is averaged over ONLY the reviews that scored it. A missing
// optional score is never counted as zero.
export function summarize(reviews: Review[]): ReviewSummary {
  const criteria = Object.fromEntries(
    CRITERIA.map(({ key }) => {
      const scores = reviews.flatMap((r) => (r[key] === null ? [] : [r[key] as number]));
      return [key, { average: mean(scores), count: scores.length }];
    }),
  ) as Record<CriterionKey, CriterionAverage>;
  const count = reviews.length;
  return {
    count,
    average: mean(reviews.map((r) => r.overall)),
    criteria,
    confidence: count === 0 ? "none" : count < MIN_REVIEWS_FOR_CONFIDENCE ? "early" : "established",
  };
}

// One summary per contractor, from valid reviews only.
export function summariesByContractor(reviews: Review[], jobs: Job[]): Map<string, ReviewSummary> {
  const grouped = new Map<string, Review[]>();
  for (const r of validReviews(reviews, jobs)) {
    const list = grouped.get(r.contractorId) ?? [];
    list.push(r);
    grouped.set(r.contractorId, list);
  }
  return new Map([...grouped].map(([id, list]) => [id, summarize(list)]));
}

// How a rating is worded on screen.
export function ratingText(summary: ReviewSummary | undefined): string {
  if (!summary || summary.count === 0) return "Not yet rated";
  const reviews = `${summary.count} review${summary.count === 1 ? "" : "s"}`;
  const base = `${summary.average!.toFixed(1)} out of 5 from ${reviews}`;
  return summary.confidence === "early" ? `${base} (too few to judge)` : base;
}

export function buildReviewRow(
  v: ValidReview,
  meta: {
    id: string;
    recordType: RecordType;
    job: Job;
    inviteId: string;
    submittedAt: string;
    commentLanguage: LanguageCode;
    commentEnglish: string;
    translationStatus: TranslationStatus;
    translationMethod: string;
  },
): Record<(typeof REVIEW_TABLE.headers)[number], string> {
  const opt = (n: number | null) => (n === null ? "" : String(n));
  return {
    review_id: meta.id,
    record_type: meta.recordType,
    job_id: meta.job.id,
    request_id: meta.job.requestId,
    contractor_id: meta.job.contractorId,
    invite_id: meta.inviteId,
    submitted_at: meta.submittedAt,
    overall: String(v.overall),
    workmanship: opt(v.workmanship),
    punctuality: opt(v.punctuality),
    communication: opt(v.communication),
    comment: v.comment,
    comment_language: meta.commentLanguage,
    comment_english: meta.commentEnglish,
    translation_status: meta.translationStatus,
    translation_method: meta.translationMethod,
    status: "valid",
  };
}

// ---------------------------------------------------------------------------
// Recent written feedback, for showing next to a contractor's bid
// ---------------------------------------------------------------------------

export const RECENT_COMMENTS = 3;

export type ReviewComment = {
  submittedAt: string;
  overall: number;
  comment: string; // exactly as written
  commentLanguage: LanguageCode | "";
  commentEnglish: string; // "" unless a real translation exists
  englishPending: boolean; // there is text but no real English version yet
};

// The latest written comments from VALID reviews of one contractor, newest
// first. Only reviews that count (the same rule as ratings) and only those with
// a comment. The original wording is never replaced, and an English version
// appears only if a translation provider really produced one.
export function recentComments(reviews: Review[], jobs: Job[], contractorId: string, limit = RECENT_COMMENTS): ReviewComment[] {
  return validReviews(reviews, jobs)
    .map((r, order) => ({ r, order }))
    .filter(({ r }) => r.contractorId === contractorId && r.comment.trim() !== "")
    .sort((a, b) => b.r.submittedAt.localeCompare(a.r.submittedAt) || b.order - a.order)
    .slice(0, limit)
    .map(({ r }) => ({
      submittedAt: r.submittedAt,
      overall: r.overall,
      comment: r.comment,
      commentLanguage: r.commentLanguage,
      commentEnglish: r.commentEnglish,
      englishPending: r.commentEnglish === "" && (r.commentLanguage === "hi" || r.commentLanguage === "mr"),
    }));
}
