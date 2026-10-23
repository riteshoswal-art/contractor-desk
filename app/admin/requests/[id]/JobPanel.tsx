"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/match";
import { INVITE_STATE_TEXT, type InviteState } from "@/lib/invite";
import { JOB_STATUS_LABELS, REASON_MAX, type JobStatus } from "@/lib/job";
import { languageName } from "@/lib/language";
import { Icon } from "../../../ui";
import { Avatar, Notice } from "./detail-ui";
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

  const err = (key: string) => (errors[key] ? <p className="error">{errors[key]}</p> : null);

  const status =
    message && (
      <Notice tone="muted" icon="info" role="status">
        <b>{message}</b>
      </Notice>
    );

  if (!job) {
    return (
      <section aria-labelledby="job-heading" className="card empty stack" style={{ ["--gap" as string]: "12px" }}>
        <span className="ic-box">
          <Icon name="users" />
        </span>
        <h2 id="job-heading" className="h2">
          <span className="sr-only">Job and review: </span>No contractor recorded yet
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          No contractor has been recorded for this request. When the developer tells you whom they chose, record it here.
          A contractor whose start date still needs confirmation can only be chosen after you record a confirmation for
          this request on their card. Only then can contact details be shared.
        </p>
        <div className="field" style={{ maxWidth: 480 }}>
          <label htmlFor="chosen" className="label">
            Contractor the developer chose
          </label>
          <select id="chosen" value={chosen} onChange={(e) => setChosen(e.target.value)} className="select">
            <option value="">Choose…</option>
            {props.options.map((o) => (
              <option key={o.id} value={o.id} disabled={!o.selectable}>
                {o.label}
                {o.why ? ` — ${o.why}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <button type="button" disabled={busy || !chosen} className="btn btn-primary" onClick={() => run(() => selectContractorAction(props.requestId, chosen), "Saved. The contractor is recorded for this job.")}>
            {busy ? "Saving…" : "Record this contractor"}
          </button>
        </div>
        {status}
      </section>
    );
  }

  const steps: [string, boolean][] =
    job.status === "cancelled"
      ? [["Selected", true], ["Cancelled", true]]
      : [["Selected", true], ["Completed", job.status === "completed"], ["Reviewed", Boolean(props.review)]];
  const pill =
    job.status === "completed"
      ? "pill-ok"
      : job.status === "cancelled"
        ? "pill-muted"
        : "pill-dark";

  return (
    <section aria-labelledby="job-heading" className="stack" style={{ ["--gap" as string]: "16px" }}>
      {status}
      <div className="job-grid">
        <div className="card stack" style={{ ["--gap" as string]: "18px" }}>
          <div className="row between wrap">
            <h2 id="job-heading" className="eyebrow" style={{ margin: 0 }}>
              Job and review
            </h2>
            <span className={`pill ${pill}`}>{JOB_STATUS_LABELS[job.status]}</span>
          </div>
          <div className="row">
            <Avatar name={job.contractorLabel} />
            <div style={{ minWidth: 0 }}>
              <div className="h2">{job.contractorLabel}</div>
              <div className="small muted">
                {job.status === "completed"
                  ? `Completed on ${job.completionDate ? formatDate(job.completionDate) : "a date not recorded"}`
                  : job.status === "cancelled"
                    ? "This job was cancelled"
                    : "Chosen contractor"}
              </div>
            </div>
          </div>
          <ol className="progress" aria-label="Job progress">
            {steps.map(([label, on]) => (
              <li key={label} className={on ? "on" : ""}>
                <i></i>
                <span>
                  {label}
                  <span className="sr-only">{on ? " (done)" : " (not yet)"}</span>
                </span>
              </li>
            ))}
          </ol>

          {job.status === "selected" && (
            <div className="stack" style={{ ["--gap" as string]: "10px" }}>
              <div className="field">
                <label htmlFor="completion" className="label">
                  Mark as completed <span className="opt">(completion date is optional)</span>
                </label>
                <input id="completion" type="date" max={props.today} value={date} onChange={(e) => setDate(e.target.value)} className="input" />
                {err("completionDate")}
              </div>
              <div>
                <button type="button" disabled={busy} className="btn btn-primary" onClick={() => run(() => completeJobAction(props.requestId, date), "Saved. The job is marked completed.")}>
                  <Icon name="check" size={16} /> Mark completed
                </button>
              </div>

              <details>
                <summary className="btn btn-quiet" style={{ display: "inline-flex" }}>
                  Cancel the job or change the contractor
                </summary>
                <div className="card flat tint stack" style={{ ["--gap" as string]: "10px", padding: 16, marginTop: 6 }}>
                  <div className="field">
                    <label htmlFor="reason" className="label">
                      Reason <span className="opt">(needed to cancel or change the contractor, max {REASON_MAX} characters, no phone numbers)</span>
                    </label>
                    <input id="reason" type="text" maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} className="input" />
                    {err("reason")}
                  </div>
                  <div>
                    <button type="button" disabled={busy} className="btn btn-ghost" onClick={() => run(() => cancelJobAction(props.requestId, reason), "Saved. The job is cancelled.")}>
                      Cancel the job
                    </button>
                  </div>
                  <div className="field">
                    <label htmlFor="change" className="label">
                      Change the contractor instead
                    </label>
                    <select id="change" value={changeTo} onChange={(e) => setChangeTo(e.target.value)} className="select">
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
                  </div>
                  <div>
                    <button type="button" disabled={busy || !changeTo} className="btn btn-ghost" onClick={() => run(() => changeContractorAction(props.requestId, changeTo, reason), "Saved. The contractor was changed (the earlier choice stays in the history).")}>
                      Change contractor
                    </button>
                  </div>
                </div>
              </details>
            </div>
          )}

          {job.status === "completed" && (
            <div className="stack" style={{ ["--gap" as string]: "10px" }}>
              <span className="eyebrow">Review</span>
              {props.review ? (
                <ReviewDetails review={props.review} />
              ) : (
                <>
                  <p className="small muted" style={{ margin: 0 }}>
                    Awaiting a review.{" "}
                    {props.invite.state === "none"
                      ? "No invitation has been created yet."
                      : `Latest invitation: ${INVITE_STATE_TEXT[props.invite.state]} (created ${formatDate(props.invite.createdAt)}, valid until ${formatDate(props.invite.expiresAt)}).`}
                  </p>
                  <div>
                    <button type="button" disabled={busy} className="btn btn-primary" onClick={() => run(() => createInviteAction(props.requestId), "Invitation link created. Copy it now.")}>
                      <Icon name="star" size={16} />
                      {props.invite.state === "none" ? "Create review invitation link" : "Create a new invitation link (replaces the old one)"}
                    </button>
                  </div>
                  <p className="help" style={{ margin: 0 }}>
                    This creates a private link for the developer. The app does <strong>not</strong> send it: you pass it on yourself.
                  </p>
                </>
              )}
              {link && (
                <div role="status" className="notice notice-warn" style={{ display: "block" }}>
                  <b>Copy this link now. It is shown only once.</b>
                  <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className="input mono" style={{ marginTop: 8 }} aria-label="Review invitation link" />
                  <p className="small" style={{ margin: "8px 0 0" }}>
                    It works once, for this job only, and stops working on {formatDate(link.expiresAt)}. Nothing has been sent to the developer.
                  </p>
                </div>
              )}
            </div>
          )}

          {(job.status === "completed" || job.status === "cancelled") && (
            <details>
              <summary className="btn btn-quiet" style={{ display: "inline-flex" }}>
                Correct the outcome (explicit, with a reason)
              </summary>
              <div className="card flat tint stack" style={{ ["--gap" as string]: "10px", padding: 16, marginTop: 6 }}>
                <div className="field">
                  <label htmlFor="correctTo" className="label">
                    Change it to
                  </label>
                  <select id="correctTo" value={correctTo} onChange={(e) => setCorrectTo(e.target.value as "completed" | "cancelled")} className="select">
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                {correctTo === "completed" && (
                  <div className="field">
                    <label htmlFor="correctDate" className="label">
                      Completion date <span className="opt">(optional)</span>
                    </label>
                    <input id="correctDate" type="date" max={props.today} value={date} onChange={(e) => setDate(e.target.value)} className="input" />
                    {err("completionDate")}
                  </div>
                )}
                <div className="field">
                  <label htmlFor="correctReason" className="label">
                    Reason (required)
                  </label>
                  <input id="correctReason" type="text" maxLength={REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} className="input" />
                  {err("reason")}
                </div>
                <div>
                  <button type="button" disabled={busy} className="btn btn-ghost" onClick={() => run(() => correctJobAction(props.requestId, correctTo, date, reason), "Saved. The correction is recorded; the earlier outcome stays in the history.")}>
                    Record correction
                  </button>
                </div>
                <p className="help" style={{ margin: 0 }}>A cancelled job&apos;s review (if any) stops counting toward the contractor&apos;s rating.</p>
              </div>
            </details>
          )}
        </div>

        <div className="card stack" style={{ ["--gap" as string]: "14px" }}>
          {job.status !== "cancelled" && (
            <>
              <span className="eyebrow">Contact details for the developer</span>
              <p className="small muted" style={{ margin: 0 }}>
                The chosen contractor&apos;s details are shown only here, only for this job, and each time you show them
                it is recorded in the job history. The app sends nothing: you pass them on yourself.
                {job.contactShareCount > 0 && ` Shown ${job.contactShareCount} time${job.contactShareCount === 1 ? "" : "s"} so far, last on ${formatDate(job.lastContactShareAt)}.`}
              </p>
              {contact ? (
                <div role="status" className="notice notice-warn" style={{ display: "block" }}>
                  <b>{contact.name}</b>
                  {contact.phone ? (
                    <p className="mono" style={{ margin: "4px 0 0", fontSize: "1rem" }}>{contact.phone}</p>
                  ) : (
                    <p className="small" style={{ margin: "4px 0 0" }}>
                      This is a TEST record, so its phone number is not read or shown here. Real numbers are shown only for
                      REAL records on a server set up for real data.
                    </p>
                  )}
                </div>
              ) : null}
              <div>
                <button type="button" disabled={busy} className="btn btn-ghost" onClick={showContact}>
                  <Icon name="lock" size={16} /> Show contact details
                </button>
              </div>
              <hr className="divider" style={{ margin: "4px 0" }} />
            </>
          )}
          <div className="row between wrap">
            <span className="eyebrow">History</span>
            <span className="tiny muted">
              {job.history.length} entries, nothing is ever overwritten
            </span>
          </div>
          <ol className="history">
            {job.history.map((h, i) => (
              <li key={i}>
                <span>
                  {h.event.replace("_", " ")} · {h.contractorLabel}
                  {h.completionDate ? `, completed ${formatDate(h.completionDate)}` : ""}
                </span>
                <span className="tiny muted">
                  {formatDate(h.recordedAt)}
                  {h.reason ? ` · reason: ${h.reason}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function ReviewDetails({ review }: { review: NonNullable<JobPanelProps["review"]> }) {
  return (
    <div className="stack" style={{ ["--gap" as string]: "8px" }}>
      <p className="small" style={{ margin: 0 }}>
        <span className="rating">
          <span className="star-i">
            <Icon name="star" size={15} />
          </span>
          Review received {formatDate(review.submittedAt)}. Overall <strong>{review.overall} / 5</strong>.
        </span>{" "}
        <span className="muted">
          Workmanship: {score(review.workmanship)}; punctuality: {score(review.punctuality)}; communication: {score(review.communication)}.
        </span>
      </p>
      {review.comment && (
        <p className="quote whitespace-pre-wrap" style={{ margin: 0 }} lang={review.commentLanguage || undefined}>
          &ldquo;{review.comment}&rdquo;
          <span className="meta" lang="en">
            Written feedback ({languageName(review.commentLanguage)}, as written)
          </span>
        </p>
      )}
      {review.comment && review.commentEnglish && (
        <p className="small whitespace-pre-wrap" style={{ margin: 0 }}>
          <b>English version:</b> {review.commentEnglish}
        </p>
      )}
      {review.comment && !review.commentEnglish && review.translationStatus === "pending" && (
        <p className="help" style={{ margin: 0 }}>English version pending: no translation service is connected.</p>
      )}
    </div>
  );
}
