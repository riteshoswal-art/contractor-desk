"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/match";
import { INVITE_STATE_TEXT, type InviteState } from "@/lib/invite";
import { JOB_STATUS_LABELS, REASON_MAX, type JobStatus } from "@/lib/job";
import { languageName } from "@/lib/language";
import {
  cancelJobAction,
  changeContractorAction,
  completeJobAction,
  correctJobAction,
  createInviteAction,
  selectContractorAction,
  shareContactAction,
  type InviteActionResult,
  type JobActionResult,
  type Failure,
} from "./job-actions";

export type JobPanelProps = {
  requestId: string;
  today: string;
  options: { id: string; label: string; selectable: boolean; why?: string }[];
  job: null | {
    contractorId: string;
    contractorLabel: string;
    status: JobStatus;
    completionDate: string;
    contactShareCount: number;
    lastContactShareAt: string;
    history: { event: string; status: string; contractorLabel: string; completionDate: string; recordedAt: string; reason: string }[];
  };
  invite: { state: "none" } | { state: InviteState; createdAt: string; expiresAt: string; count: number };
  review: null | {
    submittedAt: string;
    overall: number;
    workmanship: number | null;
    punctuality: number | null;
    communication: number | null;
    comment: string;
    commentLanguage: string;
    commentEnglish: string;
    translationStatus: string;
  };
};

const field =
  "mt-1 block w-full rounded-md border border-zinc-400 bg-white px-3 py-2 text-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/40";
const button =
  "rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-60";
const quietButton =
  "rounded-md border border-zinc-400 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60";

const PROBLEMS: Record<string, string> = {
  invalid: "Something was not valid. Nothing was saved.",
  not_found: "That request or contractor could not be found. Nothing was saved.",
  not_associated: "That contractor is not associated with this request, so they cannot be recorded on its job.",
  already_selected: "A contractor has already been recorded for this request.",
  no_job: "No contractor has been recorded for this request yet.",
  unavailable: "This contractor said they are unavailable for this request.",
  not_confirmed:
    "Their start date has not been confirmed for this request yet. Record a confirmation on their card first.",
  not_in_progress: "The job is no longer in progress, so this change is not allowed.",
  not_final: "Only a completed or cancelled job can be corrected.",
  same_contractor: "That is already the selected contractor.",
  nothing_changed: "That would change nothing.",
  not_completed: "Only a completed job can have a review invitation.",
  already_reviewed: "A review has already been received for this job.",
  setup: "A tab this needs (Jobs, ReviewInvites or Reviews) is not set up in the Sheet yet. Nothing was saved.",
  too_many_requests: "Too many changes just now. Please wait a few minutes.",
  service_error: "Something went wrong. Nothing was saved.",
};

const score = (n: number | null) => (n === null ? "not scored" : `${n} / 5`);

export default function JobPanel(props: JobPanelProps) {
  const router = useRouter();
  const { job } = props;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState("");
  const [changeTo, setChangeTo] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState("");
  const [correctTo, setCorrectTo] = useState<"completed" | "cancelled">("cancelled");
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);

  const [contact, setContact] = useState<{ name: string; phone: string | null } | null>(null);

  // Shows the chosen contractor's details to this admin (recorded on the server).
  async function showContact() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setContact(null);
    try {
      const result: Awaited<ReturnType<typeof shareContactAction>> | Failure = await shareContactAction(props.requestId);
      if (result.ok) {
        setContact({ name: result.contractorName || "Name not given", phone: result.phone });
        router.refresh();
      } else {
        setMessage(PROBLEMS[result.error] ?? PROBLEMS.service_error);
      }
    } catch {
      setMessage(PROBLEMS.service_error);
    }
    setBusy(false);
  }

  // Runs one admin action, shows its outcome, and refreshes the page data.
  async function run(action: () => Promise<JobActionResult | InviteActionResult>, done: string) {
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
        setDate("");
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

  return (
    <section aria-labelledby="job-heading" className="mt-8 rounded-md border border-zinc-300 p-4">
      <h2 id="job-heading" className="text-lg font-semibold">
        Job and review
      </h2>

      {!job && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-zinc-700">
            No contractor has been recorded for this request. When the developer tells you whom they chose, record it here.
            A contractor whose start date still needs confirmation can only be chosen after you record a confirmation for
            this request on their card.
          </p>
          <label htmlFor="chosen" className="block font-medium">
            Contractor the developer chose
          </label>
          <select id="chosen" value={chosen} onChange={(e) => setChosen(e.target.value)} className={field}>
            <option value="">Choose…</option>
            {props.options.map((o) => (
              <option key={o.id} value={o.id} disabled={!o.selectable}>
                {o.label}
                {o.why ? ` — ${o.why}` : ""}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy || !chosen} className={button} onClick={() => run(() => selectContractorAction(props.requestId, chosen), "Saved. The contractor is recorded for this job.")}>
            {busy ? "Saving…" : "Record this contractor"}
          </button>
        </div>
      )}

      {job && (
        <div className="mt-3 space-y-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-zinc-600">Status</dt>
            <dd className="font-medium">{JOB_STATUS_LABELS[job.status]}</dd>
            <dt className="text-zinc-600">Contractor</dt>
            <dd>{job.contractorLabel}</dd>
            {job.status === "completed" && (
              <>
                <dt className="text-zinc-600">Completed on</dt>
                <dd>{job.completionDate ? formatDate(job.completionDate) : "Date not recorded"}</dd>
              </>
            )}
          </dl>

          {job.status !== "cancelled" && (
            <div className="space-y-2 rounded-md bg-zinc-50 p-3">
              <p className="font-medium">Contact details for the developer</p>
              <p className="text-zinc-700">
                The chosen contractor&apos;s details are shown only here, only for this job, and each time you show them
                it is recorded in the job history. The app sends nothing: you pass them on yourself.
                {job.contactShareCount > 0 && ` Shown ${job.contactShareCount} time${job.contactShareCount === 1 ? "" : "s"} so far, last on ${formatDate(job.lastContactShareAt)}.`}
              </p>
              <button type="button" disabled={busy} className={quietButton} onClick={showContact}>
                Show contact details
              </button>
              {contact && (
                <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3">
                  <p className="font-medium">{contact.name}</p>
                  {contact.phone ? (
                    <p className="font-mono">{contact.phone}</p>
                  ) : (
                    <p className="text-zinc-700">
                      This is a TEST record, so its phone number is not read or shown here. Real numbers are shown only for
                      REAL records on a server set up for real data.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {job.status === "selected" && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-md bg-zinc-50 p-3">
                <label htmlFor="completion" className="block font-medium">
                  Mark as completed <span className="font-normal text-zinc-600">(completion date is optional)</span>
                </label>
                <input id="completion" type="date" max={props.today} value={date} onChange={(e) => setDate(e.target.value)} className={field} />
                {err("completionDate")}
                <button type="button" disabled={busy} className={button} onClick={() => run(() => completeJobAction(props.requestId, date), "Saved. The job is marked completed.")}>
                  Mark completed
                </button>
              </div>

              <div className="space-y-2 rounded-md bg-zinc-50 p-3">
                <label htmlFor="reason" className="block font-medium">
                  Reason <span className="font-normal text-zinc-600">(needed to cancel or change the contractor, max {REASON_MAX} characters, no phone numbers)</span>
                </label>
                <input id="reason" type="text" maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
                {err("reason")}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} className={quietButton} onClick={() => run(() => cancelJobAction(props.requestId, reason), "Saved. The job is cancelled.")}>
                    Cancel the job
                  </button>
                </div>
                <label htmlFor="change" className="mt-2 block font-medium">
                  Change the contractor instead
                </label>
                <select id="change" value={changeTo} onChange={(e) => setChangeTo(e.target.value)} className={field}>
                  <option value="">Choose…</option>
                  {props.options
                    .filter((o) => o.id !== job.contractorId)
                    .map((o) => (
                      <option key={o.id} value={o.id} disabled={!o.selectable}>
                        {o.label}
                        {o.why ? ` — ${o.why}` : ""}
                      </option>
                    ))}
                </select>
                <button type="button" disabled={busy || !changeTo} className={quietButton} onClick={() => run(() => changeContractorAction(props.requestId, changeTo, reason), "Saved. The contractor was changed (the earlier choice stays in the history).")}>
                  Change contractor
                </button>
              </div>
            </div>
          )}

          {job.status === "completed" && (
            <div className="space-y-2 rounded-md bg-zinc-50 p-3">
              <p className="font-medium">Review</p>
              {props.review ? (
                <ReviewDetails review={props.review} />
              ) : (
                <>
                  <p className="text-zinc-700">
                    Awaiting a review.{" "}
                    {props.invite.state === "none"
                      ? "No invitation has been created yet."
                      : `Latest invitation: ${INVITE_STATE_TEXT[props.invite.state]} (created ${formatDate(props.invite.createdAt)}, valid until ${formatDate(props.invite.expiresAt)}).`}
                  </p>
                  <button type="button" disabled={busy} className={button} onClick={() => run(() => createInviteAction(props.requestId), "Invitation link created. Copy it now.")}>
                    {props.invite.state === "none" ? "Create review invitation link" : "Create a new invitation link (replaces the old one)"}
                  </button>
                  <p className="text-zinc-600">
                    This creates a private link for the developer. The app does <strong>not</strong> send it: you pass it on yourself.
                  </p>
                </>
              )}
              {link && (
                <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3">
                  <p className="font-medium">Copy this link now. It is shown only once.</p>
                  <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className={`${field} font-mono`} aria-label="Review invitation link" />
                  <p className="mt-1 text-zinc-700">
                    It works once, for this job only, and stops working on {formatDate(link.expiresAt)}. Nothing has been sent to the developer.
                  </p>
                </div>
              )}
            </div>
          )}

          {(job.status === "completed" || job.status === "cancelled") && (
            <details className="rounded-md border border-zinc-300 p-3">
              <summary className="cursor-pointer font-medium text-blue-800">Correct the outcome (explicit, with a reason)</summary>
              <div className="mt-2 space-y-2">
                <label htmlFor="correctTo" className="block font-medium">
                  Change it to
                </label>
                <select id="correctTo" value={correctTo} onChange={(e) => setCorrectTo(e.target.value as "completed" | "cancelled")} className={field}>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                {correctTo === "completed" && (
                  <>
                    <label htmlFor="correctDate" className="block font-medium">
                      Completion date <span className="font-normal text-zinc-600">(optional)</span>
                    </label>
                    <input id="correctDate" type="date" max={props.today} value={date} onChange={(e) => setDate(e.target.value)} className={field} />
                    {err("completionDate")}
                  </>
                )}
                <label htmlFor="correctReason" className="block font-medium">
                  Reason (required)
                </label>
                <input id="correctReason" type="text" maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
                {err("reason")}
                <button type="button" disabled={busy} className={quietButton} onClick={() => run(() => correctJobAction(props.requestId, correctTo, date, reason), "Saved. The correction is recorded; the earlier outcome stays in the history.")}>
                  Record correction
                </button>
                <p className="text-zinc-600">A cancelled job&apos;s review (if any) stops counting toward the contractor&apos;s rating.</p>
              </div>
            </details>
          )}

          <details>
            <summary className="cursor-pointer text-blue-800">History ({job.history.length} entries, nothing is ever overwritten)</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-zinc-700">
              {job.history.map((h, i) => (
                <li key={i}>
                  {h.event.replace("_", " ")} — {h.contractorLabel}
                  {h.completionDate ? `, completed ${formatDate(h.completionDate)}` : ""} — {formatDate(h.recordedAt)}
                  {h.reason ? ` — reason: ${h.reason}` : ""}
                </li>
              ))}
            </ol>
          </details>
        </div>
      )}

      {message && (
        <p role="status" className="mt-3 text-sm font-medium text-zinc-900">
          {message}
        </p>
      )}
    </section>
  );
}

function ReviewDetails({ review }: { review: NonNullable<JobPanelProps["review"]> }) {
  return (
    <div className="space-y-1 text-zinc-800">
      <p>
        Review received {formatDate(review.submittedAt)}. Overall <strong>{review.overall} / 5</strong>. Workmanship: {score(review.workmanship)}; punctuality: {score(review.punctuality)}; communication: {score(review.communication)}.
      </p>
      {review.comment && (
        <p className="whitespace-pre-wrap">
          <span className="font-medium">Written feedback ({languageName(review.commentLanguage)}, as written):</span> {review.comment}
        </p>
      )}
      {review.comment && review.commentEnglish && (
        <p className="whitespace-pre-wrap">
          <span className="font-medium">English version:</span> {review.commentEnglish}
        </p>
      )}
      {review.comment && !review.commentEnglish && review.translationStatus === "pending" && (
        <p className="text-zinc-600">English version pending: no translation service is connected.</p>
      )}
    </div>
  );
}
