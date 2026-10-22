// Review invitations. Developers have no accounts, so the ONLY way someone may
// review a job is through a private link the founder creates after the job is
// completed. The link carries a random token:
//
//   - 32 random bytes from the operating system's secure generator (256 bits),
//     so it cannot be guessed;
//   - only a SHA-256 digest is stored in the Sheet, never the token itself, so
//     reading the Sheet does not reveal a usable link;
//   - it is tied to ONE job and the contractor on that job, taken from the
//     stored job record, never from anything the reviewer types;
//   - it works once (a review for the job uses it up) and expires after
//     INVITE_DAYS days;
//   - creating a newer invitation for the same job replaces the older one.
//
// The raw token exists only in the link shown to the founder at the moment of
// creation. The app does not send it anywhere.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Job } from "./job";
import type { RecordType } from "./registration";
import { defineTable } from "./tables";

export const INVITE_TABLE = defineTable("ReviewInvites", [
  "invite_id",
  "record_type",
  "job_id",
  "request_id",
  "contractor_id",
  "token_hash",
  "created_at",
  "expires_at",
  "created_by",
] as const);

export const INVITE_DAYS = 14;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// Constant-time comparison of two hex digests.
export function hashesMatch(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

export type Invite = {
  id: string;
  recordType: RecordType;
  jobId: string;
  requestId: string;
  contractorId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
};

export function parseInviteRow(r: Record<string, string>): Invite | null {
  if (r.record_type !== "TEST" && r.record_type !== "REAL") return null;
  if (!r.invite_id || !r.job_id || !r.request_id || !r.contractor_id) return null;
  if (!/^[0-9a-f]{64}$/.test(r.token_hash)) return null; // not a SHA-256 digest: ignored
  if (Number.isNaN(Date.parse(r.expires_at)) || Number.isNaN(Date.parse(r.created_at))) return null;
  return {
    id: r.invite_id,
    recordType: r.record_type,
    jobId: r.job_id,
    requestId: r.request_id,
    contractorId: r.contractor_id,
    tokenHash: r.token_hash,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  };
}

export type InviteState =
  | "active"
  | "expired"
  | "superseded" // a newer invitation exists for the same job
  | "used" // feedback for this job has already been received
  | "job_not_completed" // unfinished, cancelled, or no contractor selected
  | "job_changed"; // the job no longer matches what the invitation was made for

export const INVITE_STATE_TEXT: Record<InviteState, string> = {
  active: "Active",
  expired: "Expired",
  superseded: "Replaced by a newer invitation",
  used: "Used (feedback received)",
  job_not_completed: "Job is not completed",
  job_changed: "Job changed since it was made",
};

// Whether an invitation may be used right now. `invitesForJob` are all
// invitations ever created for that job, oldest first.
export function evaluateInvite(
  invite: Invite,
  ctx: { nowMs: number; job: Job | undefined; invitesForJob: Invite[]; reviewExistsForJob: boolean },
): InviteState {
  const { job } = ctx;
  if (!job || job.status !== "completed") return "job_not_completed";
  if (
    job.id !== invite.jobId ||
    job.requestId !== invite.requestId ||
    job.contractorId !== invite.contractorId
  ) {
    return "job_changed";
  }
  if (ctx.reviewExistsForJob) return "used";
  const newest = ctx.invitesForJob[ctx.invitesForJob.length - 1];
  if (newest && newest.id !== invite.id) return "superseded";
  if (Date.parse(invite.expiresAt) <= ctx.nowMs) return "expired";
  return "active";
}

export function expiryFor(nowMs: number): string {
  return new Date(nowMs + INVITE_DAYS * 86400_000).toISOString();
}
