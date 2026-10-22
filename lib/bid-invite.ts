// Bid invitations. Contractors have no accounts, so the ONLY way a contractor
// can bid is through a private link the administrator creates for ONE
// contractor and ONE request. It follows the same design as review links:
//
//   - a 256-bit random token (the same generator as review links);
//   - only its SHA-256 digest is stored, in its own tab (BidInvites), so a bid
//     link can never be used as a review link or the other way round;
//   - the contractor and the request come from the stored invitation, never
//     from anything the browser sends;
//   - it expires after BID_INVITE_DAYS days, is replaced when a newer one is
//     made for the same contractor and request, and is used up by the bid.
//
// Nothing is sent to the contractor by this app: the administrator passes the
// link on, and the app never claims it was delivered.
import { hashToken, hashesMatch, generateToken, TOKEN_PATTERN } from "./invite";
import type { BiddingState } from "./bid";
import type { RecordType } from "./registration";
import { defineTable } from "./tables";

export { generateToken, hashToken, hashesMatch, TOKEN_PATTERN };

export const BID_INVITE_TABLE = defineTable("BidInvites", [
  "invite_id",
  "record_type",
  "request_id",
  "contractor_id",
  "token_hash",
  "created_at",
  "expires_at",
  "created_by",
] as const);

export const BID_INVITE_DAYS = 14;

export type BidInvite = {
  id: string;
  recordType: RecordType;
  requestId: string;
  contractorId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
};

export function parseBidInviteRow(r: Record<string, string>): BidInvite | null {
  if (r.record_type !== "TEST" && r.record_type !== "REAL") return null;
  if (!r.invite_id || !/^R-[A-Z2-9]{8}$/.test(r.request_id) || !/^C-[A-Z2-9]{8}$/.test(r.contractor_id)) return null;
  if (!/^[0-9a-f]{64}$/.test(r.token_hash)) return null; // not a SHA-256 digest: ignored
  if (Number.isNaN(Date.parse(r.expires_at)) || Number.isNaN(Date.parse(r.created_at))) return null;
  return {
    id: r.invite_id,
    recordType: r.record_type,
    requestId: r.request_id,
    contractorId: r.contractor_id,
    tokenHash: r.token_hash,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  };
}

export type BidInviteState =
  | "active"
  | "expired"
  | "superseded" // a newer invitation exists for the same contractor and request
  | "used" // this contractor has already bid on this request
  | "closed"; // bidding is not open (not opened, closed, a contractor selected, or cancelled)

export const BID_INVITE_STATE_TEXT: Record<BidInviteState, string> = {
  active: "Active",
  expired: "Expired",
  superseded: "Replaced by a newer link",
  used: "Used (bid received)",
  closed: "Bidding is not open",
};

// `invitesForPair` are all invitations ever created for this contractor and
// request, oldest first.
export function evaluateBidInvite(
  invite: BidInvite,
  ctx: { nowMs: number; state: BiddingState; invitesForPair: BidInvite[]; bidExists: boolean },
): BidInviteState {
  if (ctx.bidExists) return "used";
  if (ctx.state !== "open") return "closed";
  const newest = ctx.invitesForPair[ctx.invitesForPair.length - 1];
  if (newest && newest.id !== invite.id) return "superseded";
  if (Date.parse(invite.expiresAt) <= ctx.nowMs) return "expired";
  return "active";
}

export const bidInviteExpiry = (nowMs: number) => new Date(nowMs + BID_INVITE_DAYS * 86400_000).toISOString();
