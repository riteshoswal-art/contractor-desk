"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NOTES_MAX, RATE_UNITS, unitInfo } from "@/lib/bid";
import type { BidPanelData, BidView, PriceGroupView } from "@/lib/bid-overview";
import { REASON_MAX } from "@/lib/job";
import { languageName } from "@/lib/language";
import { formatDate } from "@/lib/match";
import type { NotifyItem } from "@/lib/notify";
import { SEND_ERROR_TEXT } from "@/lib/telegram";
import { Icon } from "../../../ui";
import { Avatar, Notice } from "./detail-ui";
import {
  cancelBiddingAction,
  closeBiddingAction,
  correctBidAction,
  createBidInviteAction,
  notifyViaTelegramAction,
  openBiddingAction,
  reopenBiddingAction,
  selectBidderAction,
  voidBidAction,
  type BidCorrectionActionResult,
  type BidInviteActionResult,
  type BidRoundActionResult,
  type SelectBidderActionResult,
} from "./bid-actions";

const PROBLEMS: Record<string, string> = {
  invalid: "Something was not valid. Nothing was saved.",
  not_found: "That request, bid or contractor could not be found. Nothing was saved.",
  wrong_state: "That is not possible in the current bidding state. Nothing was saved.",
  already_selected: "A contractor has already been recorded for this request. Nothing was changed.",
  bidding_not_open: "Bidding is not open for this request.",
  not_candidate: "That contractor is not a current potential match (trade or locality) for this request.",
  unavailable: "That contractor said they are unavailable for this request.",
  already_bid: "That contractor has already bid on this request.",
  no_bid: "That bid could not be found, or it was withdrawn.",
  not_confirmed:
    "Their start date has not been confirmed for this request yet, so this bid is provisional. Record a confirmation on their card first.",
  job_selected: "A contractor has been selected, so bids can no longer be changed.",
  voided: "That bid was already withdrawn.",
  nothing_changed: "That would change nothing.",
  setup: "A tab this needs (Bids, BidInvites or Jobs) is not set up in the Sheet yet. Nothing was saved.",
  too_many_requests: "Too many changes just now. Please wait a few minutes.",
  service_error: "Something went wrong. Nothing was saved. If you were choosing a bidder, press the button again: repeating the same choice is safe.",
};

type AnyResult = BidRoundActionResult | BidCorrectionActionResult | SelectBidderActionResult | BidInviteActionResult;
// Where the outcome of an action is shown: next to the control that was used.
type Where = "top" | "invited" | "card";
type Run = (action: () => Promise<AnyResult>, done: string, at?: Where) => Promise<void>;

export type TelegramStatus = { configured: boolean; testMode: boolean };

const NOTIFY_REASON: Record<string, string> = {
  recently_sent: "already notified in the last minute (a second click would replace their link)",
  already_bid: "already bid",
  not_candidate: "not a current match",
  unavailable: "said unavailable",
  bidding_not_open: "bidding is not open",
  invalid: "not valid",
  not_found: "not found",
};

// Short chip labels for the unit filter (the headings keep the full wording).
const UNIT_CHIP: Record<string, string> = {
  per_sqft: "Per sq ft",
  per_sqm: "Per sq m",
  per_day: "Per day",
  per_unit: "Per unit",
  fixed_scope: "Fixed",
};

const firstName = (name: string) => (name && name !== "Name not given" ? name.trim().split(/\s+/)[0] : "");

// "₹22 per square foot" -> ["₹22", "per square foot"], so the amount can be set
// large and the unit small, exactly as the formatted price reads.
function splitPrice(price: string, unit: string): [string, string] {
  const label = unitInfo(unit)?.label;
  if (label && price.endsWith(` ${label}`)) return [price.slice(0, -label.length - 1), label];
  return [price, ""];
}

export default function BidPanel({
  panel,
  today,
  telegram,
  confirmHref = "#matches-heading",
}: {
  panel: BidPanelData;
  today: string;
  telegram: TelegramStatus;
  confirmHref?: string; // where "Confirm start date first" leads (the contractor cards)
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deadline, setDeadline] = useState("");
  const [reason, setReason] = useState("");
  const [inviteFor, setInviteFor] = useState("");
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [notified, setNotified] = useState<NotifyItem[] | null>(null);
  const [unitFilter, setUnitFilter] = useState("all");
  const [where, setWhere] = useState<Where>("top");

  // DEMO: notify matched contractors through the founder's Telegram demo chat.
  async function notify(ids: string[]) {
    if (busy || ids.length === 0) return;
    setBusy(true);
    setMessage("");
    setNotified(null);
    setWhere("card");
    setLink(null);
    try {
      const result = await notifyViaTelegramAction(panel.requestId, ids);
      if (result.ok) {
        setNotified(result.items);
        router.refresh();
      } else {
        setMessage(
          result.error === "real_blocked" || result.error === "demo_only"
            ? "Telegram notifications work only in the local data mode (TEST data). Nothing was created or sent."
            : (PROBLEMS[result.error] ?? PROBLEMS.service_error),
        );
      }
    } catch {
      setMessage(PROBLEMS.service_error);
    }
    setBusy(false);
  }
  const eligible = panel.inviteOptions.filter((o) => !o.disabled).map((o) => o.id);

  async function run(action: () => Promise<AnyResult>, done: string, at: Where = "top") {
    if (busy) return;
    setBusy(true);
    setWhere(at);
    setMessage("");
    setErrors({});
    setLink(null);
    try {
      const result = await action();
      if (result.ok) {
        setMessage(done);
        if ("link" in result) setLink({ url: result.link, expiresAt: result.expiresAt });
        setReason("");
        router.refresh();
      } else if (result.error === "validation") {
        setErrors(result.errors as Record<string, string>);
      } else {
        setMessage(PROBLEMS[result.error] ?? PROBLEMS.service_error);
      }
    } catch {
      setMessage(PROBLEMS.service_error);
    }
    setBusy(false);
  }

  const err = (key: string) => (where === "card" && errors[key] ? <p className="error">{errors[key]}</p> : null);
  const id = panel.requestId;
  const { state } = panel;
  const total = panel.groups.reduce((n, g) => n + g.bids.length, 0);
  // A unit whose last bid was withdrawn since the chip was pressed falls back to all units.
  const filter = panel.groups.some((g) => g.unit === unitFilter) ? unitFilter : "all";
  const shownGroups = panel.groups.filter((g) => filter === "all" || g.unit === filter);
  const canInvite = (contractorId: string) => panel.inviteOptions.some((o) => o.id === contractorId && !o.disabled);

  const linkBox = link && (
    <div role="status" className="notice notice-warn" style={{ display: "block" }}>
      <b>Copy this link now. It is shown only once.</b>
      <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className="input mono" style={{ marginTop: 8 }} aria-label="Bid invitation link" />
      <p className="small" style={{ margin: "8px 0 0" }}>
        It works for one bid by one contractor on this request only, and stops working on {formatDate(link.expiresAt)}.
        Nothing has been sent to the contractor.
      </p>
    </div>
  );

  return (
    <section aria-labelledby="bid-heading" className="stack" style={{ ["--gap" as string]: "20px" }}>
      <h2 id="bid-heading" className="sr-only">
        Contractor bids
      </h2>

      <p className="notice notice-info" style={{ margin: 0 }}>
        <span style={{ marginTop: 2 }}>
          <Icon name="scale" size={18} />
        </span>
        <span>
          <b>Prices are compared only within the same unit.</b> ₹/sq ft, ₹/day and fixed prices are never ranked against
          each other, and no total cost is estimated.
        </span>
      </p>

      {message && where === "top" && (
        <Notice tone="muted" icon="info" role="status">
          <b>{message}</b>
        </Notice>
      )}

      {panel.selectedContractorId && (
        <Notice tone="ok" icon="check">
          <b>
            Selected: {panel.selectedBidId ? "the contractor behind the bid marked “Selected” below." : "a contractor was recorded without one of these bids."}
          </b>
        </Notice>
      )}

      {panel.groups.length > 0 && (
        <div className="row wrap unit-filter" role="group" aria-label="Show bids priced">
          <button type="button" className={`chip ${filter === "all" ? "on" : ""}`} aria-pressed={filter === "all"} onClick={() => setUnitFilter("all")}>
            All units · {total}
          </button>
          {panel.groups.map((g) => (
            <button
              key={g.unit}
              type="button"
              className={`chip ${filter === g.unit ? "on" : ""}`}
              aria-pressed={filter === g.unit}
              onClick={() => setUnitFilter(g.unit)}
            >
              {UNIT_CHIP[g.unit] ?? g.label} · {g.bids.length}
            </button>
          ))}
        </div>
      )}

      {panel.groups.length === 0 && state !== "not_opened" && (
        <div className="card empty stack" style={{ ["--gap" as string]: "8px" }}>
          <span className="ic-box">
            <Icon name="file" />
          </span>
          <p className="h3">No bids yet.</p>
          <p className="small muted" style={{ margin: 0 }}>
            Bids appear here as contractors send them, grouped by the unit they priced in.
          </p>
        </div>
      )}

      {shownGroups.map((g) => (
        <PriceGroup key={g.unit} group={g} panel={panel} busy={busy} run={run} errors={errors} confirmHref={confirmHref} />
      ))}

      {panel.groups.length > 1 && (
        <p className="small muted" style={{ margin: 0 }}>
          These groups use different rate units, so their prices are <strong>not</strong> comparable with each other and no
          total cost is estimated.
        </p>
      )}

      {panel.invited.map((i) => (
        <div key={i.contractorId} className="card flat tint row between wrap">
          <div className="row">
            <Avatar name={i.contractorName} />
            <div>
              <div className="h3">
                {i.contractorName} <span className="mono muted">{i.contractorId}</span>
              </div>
              <div className="small muted">Invited, no bid yet · link {i.stateText.toLowerCase()}</div>
            </div>
          </div>
          {state === "open" && canInvite(i.contractorId) && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => run(() => createBidInviteAction(id, i.contractorId), "Bid link created. Copy it now.", "invited")}
            >
              <Icon name="copy" size={16} /> New bid link
            </button>
          )}
        </div>
      ))}

      {where === "invited" && message && !link && (
        <Notice tone="muted" icon="info" role="status">
          <b>{message}</b>
        </Notice>
      )}
      {where === "invited" && linkBox}

      {(panel.withdrawn.length > 0 || panel.roundHistory.length > 0) && (
        <div className="stack" style={{ ["--gap" as string]: "8px" }}>
          {panel.withdrawn.length > 0 && (
            <details className="small">
              <summary className="btn btn-quiet" style={{ display: "inline-flex" }}>Withdrawn bids ({panel.withdrawn.length})</summary>
              <ol className="history" style={{ marginTop: 8 }}>
                {panel.withdrawn.map((b) => (
                  <li key={b.bidId}>
                    <span>
                      {b.contractorName} <span className="mono muted">{b.contractorId}</span>: {b.price}
                    </span>
                    <span className="tiny muted">Withdrawn: {b.history[b.history.length - 1]?.reason}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
          {panel.roundHistory.length > 0 && (
            <details className="small">
              <summary className="btn btn-quiet" style={{ display: "inline-flex" }}>Bidding history ({panel.roundHistory.length} entries)</summary>
              <ol className="history" style={{ marginTop: 8 }}>
                {panel.roundHistory.map((h, i) => (
                  <li key={i}>
                    <span>{h.event}</span>
                    <span className="tiny muted">
                      {formatDate(h.recordedAt)}
                      {h.reason ? ` · reason: ${h.reason}` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}

      {/* Managing the round: opening, links, Telegram, closing. */}
      <div className="card stack" style={{ ["--gap" as string]: "16px" }}>
        <div className="row between wrap">
          <span className="eyebrow">Bidding</span>
          <span className={`pill ${state === "open" ? "pill-ok" : state === "selected" ? "pill-dark" : "pill-muted"}`}>{panel.stateText}</span>
        </div>
        <p className="small" style={{ margin: 0 }}>
          <b>{panel.stateText}.</b>
          {panel.closesAt && <> Closes {formatDate(panel.closesAt)} (end of day, India time).</>}
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          A bid is a contractor&apos;s price only. It does <strong>not</strong> confirm that they can start on the requested
          date, and phone numbers stay hidden until you use the existing contact steps on a contractor&apos;s card.
        </p>

        {state === "not_opened" && (
          <div className="stack" style={{ ["--gap" as string]: "10px" }}>
            <div className="field">
              <label htmlFor="deadline" className="label">
                Closing date <span className="opt">(optional)</span>
              </label>
              <input id="deadline" type="date" min={today} value={deadline} onChange={(e) => setDeadline(e.target.value)} className="input" />
              {err("deadline")}
            </div>
            <div>
              <button type="button" disabled={busy} className="btn btn-primary" onClick={() => run(() => openBiddingAction(id, deadline), "Bidding is open.", "card")}>
                Open bidding
              </button>
            </div>
          </div>
        )}

        {state === "open" && (
          <div className="stack" style={{ ["--gap" as string]: "10px" }}>
            <div className="field">
              <label htmlFor="inviteFor" className="label">
                Create a private bid link for a potential match
              </label>
              <select id="inviteFor" value={inviteFor} onChange={(e) => setInviteFor(e.target.value)} className="select">
                <option value="">Choose…</option>
                {panel.inviteOptions.map((o) => (
                  <option key={o.id} value={o.id} disabled={o.disabled}>
                    {o.label}
                    {o.why ? ` — ${o.why}` : ""}
                  </option>
                ))}
              </select>
              <p className="help">
                The app does <strong>not</strong> send the link: you pass it on yourself. Making a new link for the same
                contractor replaces the old one.
              </p>
            </div>
            <div>
              <button type="button" disabled={busy || !inviteFor} className="btn btn-primary" onClick={() => run(() => createBidInviteAction(id, inviteFor), "Bid link created. Copy it now.", "card")}>
                <Icon name="copy" size={16} /> Create bid link
              </button>
            </div>
          </div>
        )}

        {where === "card" && linkBox}

        {state === "open" && (
          <div className="card flat tint stack" style={{ ["--gap" as string]: "10px", padding: 16 }}>
            <p className="h3 row" style={{ gap: 8 }}>
              <Icon name="send" size={16} /> Notify by Telegram
            </p>
            {!telegram.testMode ? (
              <p className="small muted" style={{ margin: 0 }}>This server uses REAL data, so Telegram notifications are switched off.</p>
            ) : (
              <>
                <p className="small muted" style={{ margin: 0 }}>
                  Each contractor who <strong>connected their own Telegram</strong> gets the job on Telegram with Yes / No
                  buttons and sends one quote there. Contractors who have not connected get nothing and are shown as
                  &ldquo;Not connected&rdquo;.
                  {!telegram.configured && (
                    <>
                      {" "}Telegram is not fully set up yet, so you may see <strong>previews</strong> marked &ldquo;not sent&rdquo;.{" "}
                      <Link prefetch={false} href="/admin/telegram" style={{ color: "var(--ink)", textDecoration: "underline" }}>Set up Telegram</Link>
                    </>
                  )}
                </p>
                <div className="row wrap" style={{ gap: 8 }}>
                  <button type="button" disabled={busy || !inviteFor} className="btn btn-ghost" onClick={() => notify([inviteFor])}>
                    Notify the contractor chosen above
                  </button>
                  <button type="button" disabled={busy || eligible.length === 0} className="btn btn-primary" onClick={() => notify(eligible)}>
                    {busy ? "Working…" : `Notify all eligible matches (${eligible.length})`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {notified && (
          <div role="status" className="stack" style={{ ["--gap" as string]: "8px" }}>
            <span className="eyebrow">Notification results</span>
            <ul className="stack" style={{ ["--gap" as string]: "8px", listStyle: "none", padding: 0, margin: 0 }}>
              {notified.map((n) => (
                <li key={n.contractorId} className="card flat" style={{ padding: 12 }}>
                  <p className="small" style={{ margin: 0 }}>
                    <b>{n.name || n.contractorId}</b>{" "}
                    {n.status === "sent" && <span className="pill pill-ok">Sent to their own Telegram chat.</span>}
                    {n.status === "not_connected" && <span className="muted">Not connected to Telegram: nothing created or sent.</span>}
                    {n.status === "preview" && <span className="pill pill-warn">Preview only: NOT sent (Telegram is not set up).</span>}
                    {n.status === "failed" && (
                      <span className="error" style={{ display: "inline" }}>Not sent: {n.error ? SEND_ERROR_TEXT[n.error] : "unknown error."}</span>
                    )}
                    {n.status === "skipped" && <span className="muted">Skipped: {NOTIFY_REASON[n.reason ?? ""] ?? n.reason}.</span>}
                  </p>
                  {n.link && (
                    <>
                      <input readOnly value={n.link} onFocus={(e) => e.currentTarget.select()} className="input mono" style={{ marginTop: 8 }} aria-label={`Bid link for ${n.name}`} />
                      <p className="help">Shown once. Works for one bid by this contractor on this request, until {formatDate(n.expiresAt ?? "")}.</p>
                    </>
                  )}
                  {n.preview && (
                    <details style={{ marginTop: 6 }}>
                      <summary className="small" style={{ cursor: "pointer", fontWeight: 600 }}>Message {n.status === "preview" ? "preview" : "that was not sent"}</summary>
                      <pre className="quote tiny whitespace-pre-wrap" style={{ marginTop: 6 }}>{n.preview}</pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(state === "open" || state === "closed") && (
          <div className="stack" style={{ ["--gap" as string]: "10px" }}>
            <hr className="divider" style={{ margin: 0 }} />
            <div className="field">
              <label htmlFor="bidReason" className="label">
                Reason <span className="opt">(needed to cancel or reopen, max {REASON_MAX} characters)</span>
              </label>
              <input id="bidReason" type="text" maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} className="input" />
              {err("reason")}
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              {state === "open" && (
                <button type="button" disabled={busy} className="btn btn-ghost" onClick={() => run(() => closeBiddingAction(id), "Bidding is closed.", "card")}>
                  Close bidding
                </button>
              )}
              {state === "closed" && (
                <button type="button" disabled={busy} className="btn btn-ghost" onClick={() => run(() => reopenBiddingAction(id, reason, ""), "Bidding is open again (recorded with your reason).", "card")}>
                  Reopen bidding
                </button>
              )}
              <button type="button" disabled={busy} className="btn btn-quiet" onClick={() => run(() => cancelBiddingAction(id, reason), "Bidding is cancelled.", "card")}>
                Cancel bidding
              </button>
            </div>
          </div>
        )}

        {state === "cancelled" && (
          <div className="stack" style={{ ["--gap" as string]: "10px" }}>
            <div className="field">
              <label htmlFor="bidReason2" className="label">
                Reason for reopening <span className="opt">(required)</span>
              </label>
              <input id="bidReason2" type="text" maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} className="input" />
              {err("reason")}
            </div>
            <div>
              <button type="button" disabled={busy} className="btn btn-ghost" onClick={() => run(() => reopenBiddingAction(id, reason, ""), "Bidding is open again (recorded with your reason).", "card")}>
                Reopen bidding
              </button>
            </div>
          </div>
        )}
        {where === "card" && message && !link && (
          <Notice tone="muted" icon="info" role="status">
            <b>{message}</b>
          </Notice>
        )}
      </div>
    </section>
  );
}

// One unit group as the editorial comparison table: only bids in this same unit
// are ever compared with each other.
function PriceGroup({
  group,
  panel,
  busy,
  run,
  errors,
  confirmHref,
}: {
  group: PriceGroupView;
  panel: BidPanelData;
  busy: boolean;
  run: Run;
  errors: Record<string, string>;
  confirmHref: string;
}) {
  const heading = group.fixedScope ? "Fixed price for the defined scope" : `Priced ${group.label}`;
  return (
    <section className="stack" style={{ ["--gap" as string]: "10px" }} aria-label={heading}>
      <div className="group-head">
        <h3 className="h2">{heading}</h3>
        <span className="small muted">
          {group.fixedScope
            ? "Comparable only if each covers the same scope: read each contractor's notes."
            : "Cheapest first is not the same as best: look at start date and reviews too."}
        </span>
      </div>
      <div className="cmp-table">
        <div className="cmp-head" aria-hidden="true">
          <span>Contractor</span>
          <span>Price</span>
          <span>Start date</span>
          <span>Reviews</span>
          <span></span>
        </div>
        {group.bids.map((b) => (
          <BidRow key={b.bidId} bid={b} panel={panel} busy={busy} run={run} errors={errors} confirmHref={confirmHref} />
        ))}
      </div>
    </section>
  );
}

function StandingPill({ bid }: { bid: BidView }) {
  if (bid.chosen)
    return (
      <span className="pill pill-dark plain">
        <Icon name="check" size={14} /> Selected
      </span>
    );
  if (bid.standing === "eligible") return <span className="pill pill-ok">Can be selected</span>;
  if (bid.standing === "provisional") return <span className="pill pill-warn">Provisional · date not confirmed</span>;
  return <span className="pill pill-muted">{bid.standingText}</span>;
}

// "4.6 out of 5 from 5 reviews (too few to judge)" shown the reference's way.
function RatingLine({ text, count }: { text: string; count: number }) {
  const m = /^(\d(?:\.\d)?) out of 5 from (.+?)( \(too few to judge\))?$/.exec(text);
  if (count === 0 || !m) return <span className="muted">{text}</span>;
  return (
    <span className="rating" aria-label={text}>
      <span className="star-i">
        <Icon name="star" size={15} />
      </span>
      <strong>{m[1]}</strong> <span className="muted">from {m[2]}</span>
      {m[3] && <span className="muted"> · too few to judge</span>}
    </span>
  );
}

function BidRow({
  bid,
  panel,
  busy,
  run,
  errors,
  confirmHref,
}: {
  bid: BidView;
  panel: BidPanelData;
  busy: boolean;
  run: Run;
  errors: Record<string, string>;
  confirmHref: string;
}) {
  const [amount, setAmount] = useState(bid.amount);
  const [unit, setUnit] = useState(bid.unit);
  const [notes, setNotes] = useState(bid.notes);
  const [why, setWhy] = useState("");
  const [amountText, unitText] = splitPrice(bid.price, bid.unit);
  const first = firstName(bid.contractorName);

  return (
    <div className={`cmp-row ${bid.chosen ? "is-selected" : ""}`}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Avatar name={bid.contractorName} />
        <div style={{ minWidth: 0 }}>
          <div className="h3">{bid.contractorName}</div>
          <div className="mono muted">{bid.contractorId}</div>
        </div>
      </div>

      <div>
        <div className="price">
          {amountText}
          {unitText && <span className="per">{unitText}</span>}
        </div>
        {bid.notes && (
          <p className="tiny muted whitespace-pre-wrap" style={{ margin: "4px 0 0" }}>
            {bid.notesLanguage && bid.notesLanguage !== "en" && <>Notes ({languageName(bid.notesLanguage)}, as written): </>}
            {bid.notes}
          </p>
        )}
        {bid.corrected && <p className="tiny muted" style={{ margin: "4px 0 0" }}>Corrected by the administrator (see history).</p>}
      </div>

      <div className="small">
        <StandingPill bid={bid} />
        <p className="small muted" style={{ margin: "6px 0 0" }}>
          {bid.startText}
        </p>
      </div>

      <div className="small">
        <RatingLine text={bid.rating} count={bid.reviewCount} />
        {bid.criteria.length > 0 && <p className="tiny muted" style={{ margin: "4px 0 0" }}>{bid.criteria.join(" · ")}</p>}
        {bid.recentComments.length > 0 && (
          <ul aria-label={`Latest written feedback about ${bid.contractorName}`} style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {bid.recentComments.map((c, i) => (
              <li key={i}>
                <p className="tiny quote-inline whitespace-pre-wrap" lang={c.commentLanguage || undefined}>
                  &ldquo;{c.comment}&rdquo;
                </p>
                <span className="tiny muted" style={{ display: "block" }} lang="en">
                  {c.overall}/5 · {formatDate(c.submittedAt)}
                  {c.commentLanguage ? ` · ${languageName(c.commentLanguage)}, as written` : ""}
                  {!c.commentEnglish && c.englishPending ? " · English version pending: no translation service is connected." : ""}
                </span>
                {c.commentEnglish && c.commentLanguage !== "en" && (
                  <span className="tiny whitespace-pre-wrap" style={{ display: "block" }} lang="en">
                    <b>English version:</b> {c.commentEnglish}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="cmp-act">
        {panel.canSelect &&
          (bid.canSelect ? (
            <button
              type="button"
              disabled={busy}
              className="btn btn-primary"
              onClick={() => run(() => selectBidderAction(panel.requestId, bid.bidId), "Saved. This bidder is recorded as the contractor for the job.")}
            >
              {first ? `Select ${first}` : "Select this bidder"}
            </button>
          ) : bid.standing === "provisional" ? (
            <Link prefetch={false} href={confirmHref} className="btn btn-ghost" title="Record their confirmed start date on their card first">
              <Icon name="cal" size={16} /> Confirm start date first
            </Link>
          ) : (
            <button type="button" disabled className="btn btn-ghost">
              Cannot be selected
            </button>
          ))}
      </div>

      {/* Administrator tools for this one bid, kept out of the comparison. */}
      <div className="row wrap" style={{ gridColumn: "1 / -1", gap: 8, alignItems: "flex-start", marginTop: -4 }}>
        {!panel.selectedContractorId && (
          <details className="small" style={{ flex: "1 1 280px" }}>
            <summary className="btn btn-quiet" style={{ display: "inline-flex" }}>Correct or withdraw this bid</summary>
            <div className="card flat tint stack" style={{ ["--gap" as string]: "10px", padding: 16, marginTop: 6 }}>
              <p className="small muted" style={{ margin: 0 }}>
                Administrator only, with a reason. A correction changes this one bid; it never creates a second bid. The
                earlier values stay in the history.
              </p>
              <label className="field">
                <span className="label">Amount (₹)</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="input" aria-invalid={errors.amount ? true : undefined} />
              </label>
              {errors.amount && <p className="error">{errors.amount}</p>}
              <label className="field">
                <span className="label">Rate unit</span>
                <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} className="select">
                  {RATE_UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">
                  Notes <span className="opt">(max {NOTES_MAX} characters)</span>
                </span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={NOTES_MAX} rows={2} className="textarea" style={{ minHeight: 72 }} />
              </label>
              {errors.notes && <p className="error">{errors.notes}</p>}
              <label className="field">
                <span className="label">Reason (required)</span>
                <input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={REASON_MAX} className="input" aria-invalid={errors.reason ? true : undefined} />
              </label>
              {errors.reason && <p className="error">{errors.reason}</p>}
              <div className="row wrap" style={{ gap: 8 }}>
                <button type="button" disabled={busy} className="btn btn-ghost" onClick={() => run(() => correctBidAction(panel.requestId, bid.bidId, { amount, unit, notes }, why), "Saved. The correction is recorded; the earlier values stay in the history.")}>
                  Record correction
                </button>
                <button type="button" disabled={busy} className="btn btn-quiet" onClick={() => run(() => voidBidAction(panel.requestId, bid.bidId, why), "Saved. The bid is withdrawn; the contractor still cannot submit another.")}>
                  Withdraw this bid
                </button>
              </div>
            </div>
          </details>
        )}
        <details className="small" style={{ flex: "1 1 280px" }}>
          <summary className="btn btn-quiet" style={{ display: "inline-flex" }}>History ({bid.history.length})</summary>
          <ol className="history" style={{ marginTop: 6 }}>
            <li>
              <span>Submitted</span>
              <span className="tiny muted">{formatDate(bid.submittedAt)}</span>
            </li>
            {bid.history.map((h, i) => (
              <li key={i}>
                <span>
                  {h.event} · {h.price}
                </span>
                <span className="tiny muted">
                  {formatDate(h.recordedAt)}
                  {h.reason ? ` · reason: ${h.reason}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </details>
      </div>
    </div>
  );
}
