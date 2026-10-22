"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NOTES_MAX, RATE_UNITS } from "@/lib/bid";
import type { BidPanelData, BidView } from "@/lib/bid-overview";
import { REASON_MAX } from "@/lib/job";
import { languageName } from "@/lib/language";
import { formatDate } from "@/lib/match";
import type { NotifyItem } from "@/lib/notify";
import { SEND_ERROR_TEXT } from "@/lib/telegram";
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

const field =
  "mt-1 block w-full rounded-md border border-zinc-400 bg-white px-3 py-2 text-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/40";
const button =
  "rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-60";
const quietButton =
  "rounded-md border border-zinc-400 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60";

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

export default function BidPanel({ panel, today, telegram }: { panel: BidPanelData; today: string; telegram: TelegramStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deadline, setDeadline] = useState("");
  const [reason, setReason] = useState("");
  const [inviteFor, setInviteFor] = useState("");
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [notified, setNotified] = useState<NotifyItem[] | null>(null);

  // DEMO: notify matched contractors through the founder's Telegram demo chat.
  async function notify(ids: string[]) {
    if (busy || ids.length === 0) return;
    setBusy(true);
    setMessage("");
    setNotified(null);
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

  async function run(action: () => Promise<AnyResult>, done: string) {
    if (busy) return;
    setBusy(true);
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

  const err = (key: string) => (errors[key] ? <p className="mt-1 text-sm font-medium text-red-700">{errors[key]}</p> : null);
  const id = panel.requestId;
  const { state } = panel;

  return (
    <section aria-labelledby="bid-heading" className="mt-8 rounded-md border border-zinc-300 p-4">
      <h2 id="bid-heading" className="text-lg font-semibold">
        Contractor bids
      </h2>
      <p className="mt-1 text-sm">
        <span className="font-medium">{panel.stateText}.</span>
        {panel.closesAt && <> Closes {formatDate(panel.closesAt)} (end of day, India time).</>}
      </p>
      <p className="mt-1 text-sm text-zinc-700">
        A bid is a contractor&apos;s price only. It does <strong>not</strong> confirm that they can start on the requested
        date, and phone numbers stay hidden until you use the existing contact steps on a contractor&apos;s card.
      </p>

      <div className="mt-3 space-y-3 text-sm">
        {state === "not_opened" && (
          <div className="space-y-2 rounded-md bg-zinc-50 p-3">
            <label htmlFor="deadline" className="block font-medium">
              Closing date <span className="font-normal text-zinc-600">(optional)</span>
            </label>
            <input id="deadline" type="date" min={today} value={deadline} onChange={(e) => setDeadline(e.target.value)} className={field} />
            {err("deadline")}
            <button type="button" disabled={busy} className={button} onClick={() => run(() => openBiddingAction(id, deadline), "Bidding is open.")}>
              Open bidding
            </button>
          </div>
        )}

        {state === "open" && (
          <div className="space-y-2 rounded-md bg-zinc-50 p-3">
            <label htmlFor="inviteFor" className="block font-medium">
              Create a private bid link for a potential match
            </label>
            <select id="inviteFor" value={inviteFor} onChange={(e) => setInviteFor(e.target.value)} className={field}>
              <option value="">Choose…</option>
              {panel.inviteOptions.map((o) => (
                <option key={o.id} value={o.id} disabled={o.disabled}>
                  {o.label}
                  {o.why ? ` — ${o.why}` : ""}
                </option>
              ))}
            </select>
            <button type="button" disabled={busy || !inviteFor} className={button} onClick={() => run(() => createBidInviteAction(id, inviteFor), "Bid link created. Copy it now.")}>
              Create bid link
            </button>
            <p className="text-zinc-600">
              The app does <strong>not</strong> send the link: you pass it on yourself. Making a new link for the same
              contractor replaces the old one.
            </p>
          </div>
        )}

        {state === "open" && (
          <div className="space-y-2 rounded-md border border-sky-200 bg-sky-50 p-3">
            <p className="font-medium">Notify by Telegram</p>
            {!telegram.testMode ? (
              <p className="text-zinc-700">This server uses REAL data, so Telegram notifications are switched off.</p>
            ) : (
              <>
                <p className="text-zinc-700">
                  Each contractor who <strong>connected their own Telegram</strong> gets the job on Telegram with Yes / No
                  buttons and sends one quote there. Contractors who have not connected get nothing and are shown as
                  &ldquo;Not connected&rdquo;.
                  {!telegram.configured && (
                    <>
                      {" "}Telegram is not fully set up yet, so you may see <strong>previews</strong> marked &ldquo;not sent&rdquo;.{" "}
                      <Link href="/admin/telegram" className="text-blue-800 underline">Set up Telegram</Link>
                    </>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy || !inviteFor} className={quietButton} onClick={() => notify([inviteFor])}>
                    Notify the contractor chosen above
                  </button>
                  <button type="button" disabled={busy || eligible.length === 0} className={button} onClick={() => notify(eligible)}>
                    {busy ? "Working…" : `Notify all eligible matches (${eligible.length})`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {notified && (
          <div role="status" className="space-y-2 rounded-md border border-zinc-300 p-3">
            <p className="font-medium">Notification results</p>
            <ul className="space-y-2">
              {notified.map((n) => (
                <li key={n.contractorId} className="rounded-md bg-zinc-50 p-2">
                  <p>
                    <span className="font-medium">{n.name || n.contractorId}</span>{" "}
                    {n.status === "sent" && <span className="font-semibold text-green-800">Sent to their own Telegram chat.</span>}
                    {n.status === "not_connected" && <span className="text-zinc-700">Not connected to Telegram: nothing created or sent.</span>}
                    {n.status === "preview" && <span className="font-semibold text-amber-800">Preview only: NOT sent (Telegram is not set up).</span>}
                    {n.status === "failed" && (
                      <span className="font-semibold text-red-800">Not sent: {n.error ? SEND_ERROR_TEXT[n.error] : "unknown error."}</span>
                    )}
                    {n.status === "skipped" && <span className="text-zinc-700">Skipped: {NOTIFY_REASON[n.reason ?? ""] ?? n.reason}.</span>}
                  </p>
                  {n.link && (
                    <>
                      <input readOnly value={n.link} onFocus={(e) => e.currentTarget.select()} className={`${field} font-mono`} aria-label={`Bid link for ${n.name}`} />
                      <p className="text-xs text-zinc-600">Shown once. Works for one bid by this contractor on this request, until {formatDate(n.expiresAt ?? "")}.</p>
                    </>
                  )}
                  {n.preview && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-blue-800">Message {n.status === "preview" ? "preview" : "that was not sent"}</summary>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-white p-2 text-xs text-zinc-800">{n.preview}</pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {link && (
          <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="font-medium">Copy this link now. It is shown only once.</p>
            <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className={`${field} font-mono`} aria-label="Bid invitation link" />
            <p className="mt-1 text-zinc-700">
              It works for one bid by one contractor on this request only, and stops working on {formatDate(link.expiresAt)}.
              Nothing has been sent to the contractor.
            </p>
          </div>
        )}

        {(state === "open" || state === "closed") && (
          <div className="space-y-2 rounded-md bg-zinc-50 p-3">
            <label htmlFor="bidReason" className="block font-medium">
              Reason <span className="font-normal text-zinc-600">(needed to cancel or reopen, max {REASON_MAX} characters)</span>
            </label>
            <input id="bidReason" type="text" maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
            {err("reason")}
            <div className="flex flex-wrap gap-2">
              {state === "open" && (
                <button type="button" disabled={busy} className={quietButton} onClick={() => run(() => closeBiddingAction(id), "Bidding is closed.")}>
                  Close bidding
                </button>
              )}
              {state === "closed" && (
                <>
                  <button type="button" disabled={busy} className={quietButton} onClick={() => run(() => reopenBiddingAction(id, reason, ""), "Bidding is open again (recorded with your reason).")}>
                    Reopen bidding
                  </button>
                </>
              )}
              <button type="button" disabled={busy} className={quietButton} onClick={() => run(() => cancelBiddingAction(id, reason), "Bidding is cancelled.")}>
                Cancel bidding
              </button>
            </div>
          </div>
        )}

        {state === "cancelled" && (
          <div className="space-y-2 rounded-md bg-zinc-50 p-3">
            <label htmlFor="bidReason2" className="block font-medium">
              Reason for reopening <span className="font-normal text-zinc-600">(required)</span>
            </label>
            <input id="bidReason2" type="text" maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
            {err("reason")}
            <button type="button" disabled={busy} className={quietButton} onClick={() => run(() => reopenBiddingAction(id, reason, ""), "Bidding is open again (recorded with your reason).")}>
              Reopen bidding
            </button>
          </div>
        )}

        {panel.selectedContractorId && (
          <p className="rounded-md border border-green-300 bg-green-50 p-3 font-medium text-green-900">
            Selected: {panel.selectedBidId ? "the contractor behind the bid marked “Selected” below." : "a contractor was recorded without one of these bids."}
          </p>
        )}
      </div>

      {panel.groups.length === 0 && state !== "not_opened" && (
        <p className="mt-4 text-sm text-zinc-700">No bids yet.</p>
      )}

      {panel.groups.map((g) => (
        <div key={g.unit} className="mt-5">
          <h3 className="text-base font-semibold">Priced {g.label}</h3>
          <p className="text-sm text-zinc-600">
            {g.fixedScope
              ? "Fixed prices are only comparable if each covers the same scope: read each contractor's notes."
              : "Only bids in this same unit are compared with each other here."}{" "}
            Cheapest first is not the same as best: look at start date and ratings too.
          </p>
          <ul className="mt-2 space-y-3">
            {g.bids.map((b) => (
              <BidCard key={b.bidId} bid={b} panel={panel} busy={busy} run={run} errors={errors} />
            ))}
          </ul>
        </div>
      ))}
      {panel.groups.length > 1 && (
        <p className="mt-3 text-sm text-zinc-700">
          These groups use different rate units, so their prices are <strong>not</strong> comparable with each other and no
          total cost is estimated.
        </p>
      )}

      {panel.invited.length > 0 && (
        <div className="mt-5 text-sm">
          <h3 className="text-base font-semibold">Invited, no bid yet</h3>
          <ul className="mt-1 list-disc pl-5 text-zinc-800">
            {panel.invited.map((i) => (
              <li key={i.contractorId}>
                {i.contractorName} ({i.contractorId}): link {i.stateText.toLowerCase()}
              </li>
            ))}
          </ul>
        </div>
      )}

      {panel.withdrawn.length > 0 && (
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer text-blue-800">Withdrawn bids ({panel.withdrawn.length})</summary>
          <ul className="mt-2 list-disc pl-5 text-zinc-700">
            {panel.withdrawn.map((b) => (
              <li key={b.bidId}>
                {b.contractorName} ({b.contractorId}): {b.price}. Withdrawn: {b.history[b.history.length - 1]?.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {panel.roundHistory.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-blue-800">Bidding history ({panel.roundHistory.length} entries)</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-zinc-700">
            {panel.roundHistory.map((h, i) => (
              <li key={i}>
                {h.event} — {formatDate(h.recordedAt)}
                {h.reason ? ` — reason: ${h.reason}` : ""}
              </li>
            ))}
          </ol>
        </details>
      )}

      {message && (
        <p role="status" className="mt-3 text-sm font-medium text-zinc-900">
          {message}
        </p>
      )}
    </section>
  );
}

function BidCard({
  bid,
  panel,
  busy,
  run,
  errors,
}: {
  bid: BidView;
  panel: BidPanelData;
  busy: boolean;
  run: (action: () => Promise<AnyResult>, done: string) => Promise<void>;
  errors: Record<string, string>;
}) {
  const [amount, setAmount] = useState(bid.amount);
  const [unit, setUnit] = useState(bid.unit);
  const [notes, setNotes] = useState(bid.notes);
  const [why, setWhy] = useState("");
  const tone =
    bid.standing === "eligible" ? "text-green-800" : bid.standing === "provisional" ? "text-amber-800" : "text-red-800";

  return (
    <li className={`rounded-md border p-3 text-sm ${bid.chosen ? "border-green-500 bg-green-50" : "border-zinc-300"}`}>
      <p className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">
          {bid.contractorName} <span className="font-mono text-xs font-normal">{bid.contractorId}</span>
        </span>
        {bid.chosen && <span className="rounded bg-green-700 px-2 py-0.5 text-xs font-semibold text-white">Selected</span>}
      </p>
      <p className="mt-1 text-lg font-semibold">{bid.price}</p>
      {bid.corrected && <p className="text-xs text-zinc-600">Corrected by the administrator (see history).</p>}
      {bid.notes && (
        <p className="mt-1 whitespace-pre-wrap">
          <span className="font-medium">Notes ({languageName(bid.notesLanguage)}, as written):</span> {bid.notes}
        </p>
      )}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-zinc-600">Requested start</dt>
        <dd>{panel.requestedStart ? formatDate(panel.requestedStart) : "Not stated"}</dd>
        <dt className="text-zinc-600">Their start date</dt>
        <dd>{bid.startText}</dd>
        <dt className="text-zinc-600">Reviews</dt>
        <dd>
          {bid.rating}
          {bid.criteria.length > 0 && <span className="block text-zinc-700">{bid.criteria.join("; ")}</span>}
          {bid.recentComments.length > 0 && (
            <ul className="mt-2 space-y-2" aria-label={`Latest written feedback about ${bid.contractorName}`}>
              {bid.recentComments.map((c, i) => (
                <li key={i} className="rounded-md bg-zinc-50 p-2">
                  <span className="block whitespace-pre-wrap">&ldquo;{c.comment}&rdquo;</span>
                  <span className="block text-xs text-zinc-600">
                    {c.overall}/5, {formatDate(c.submittedAt)}
                    {c.commentLanguage ? `, ${languageName(c.commentLanguage)}, as written` : ""}
                  </span>
                  {c.commentEnglish && c.commentLanguage !== "en" && (
                    <span className="block whitespace-pre-wrap text-zinc-800">
                      <span className="font-medium">English version:</span> {c.commentEnglish}
                    </span>
                  )}
                  {!c.commentEnglish && c.englishPending && (
                    <span className="block text-xs text-zinc-600">English version pending: no translation service is connected.</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt className="text-zinc-600">Submitted</dt>
        <dd>{formatDate(bid.submittedAt)}</dd>
        <dt className="text-zinc-600">Status</dt>
        <dd className={`font-medium ${tone}`}>{bid.standingText}</dd>
      </dl>

      {panel.canSelect && (
        <button
          type="button"
          disabled={busy || !bid.canSelect}
          className={`${bid.canSelect ? button : quietButton} mt-3`}
          onClick={() => run(() => selectBidderAction(panel.requestId, bid.bidId), "Saved. This bidder is recorded as the contractor for the job.")}
        >
          {bid.canSelect ? "Select this bidder" : "Cannot be selected yet"}
        </button>
      )}

      {!panel.selectedContractorId && (
        <details className="mt-3">
          <summary className="cursor-pointer text-blue-800">Correct or withdraw this bid (administrator, with a reason)</summary>
          <div className="mt-2 space-y-2">
            <p className="text-zinc-600">A correction changes this one bid; it never creates a second bid. The earlier values stay in the history.</p>
            <label className="block font-medium">
              Amount (₹)
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={field} />
            </label>
            {errors.amount && <p className="text-sm font-medium text-red-700">{errors.amount}</p>}
            <label className="block font-medium">
              Rate unit
              <select value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} className={field}>
                {RATE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block font-medium">
              Notes <span className="font-normal text-zinc-600">(max {NOTES_MAX} characters)</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={NOTES_MAX} rows={2} className={field} />
            </label>
            {errors.notes && <p className="text-sm font-medium text-red-700">{errors.notes}</p>}
            <label className="block font-medium">
              Reason (required)
              <input value={why} onChange={(e) => setWhy(e.target.value)} maxLength={REASON_MAX} className={field} />
            </label>
            {errors.reason && <p className="text-sm font-medium text-red-700">{errors.reason}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={quietButton} onClick={() => run(() => correctBidAction(panel.requestId, bid.bidId, { amount, unit, notes }, why), "Saved. The correction is recorded; the earlier values stay in the history.")}>
                Record correction
              </button>
              <button type="button" disabled={busy} className={quietButton} onClick={() => run(() => voidBidAction(panel.requestId, bid.bidId, why), "Saved. The bid is withdrawn; the contractor still cannot submit another.")}>
                Withdraw this bid
              </button>
            </div>
          </div>
        </details>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-blue-800">History ({bid.history.length})</summary>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-zinc-700">
          {bid.history.map((h, i) => (
            <li key={i}>
              {h.event} — {h.price} — {formatDate(h.recordedAt)}
              {h.reason ? ` — reason: ${h.reason}` : ""}
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}
