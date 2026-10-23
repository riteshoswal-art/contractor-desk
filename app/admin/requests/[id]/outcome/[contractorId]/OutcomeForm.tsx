"use client";

import { useState } from "react";
import {
  FAILURE_REASONS,
  validateOutcome,
  type OutcomeErrors,
  type OutcomeInput,
} from "@/lib/outcome";
import { formatMinutes } from "@/lib/stats";
import { saveOutcomeAction } from "./actions";


function Err({ message }: { message?: string }) {
  return message ? (
    <p className="error">{message}</p>
  ) : null;
}

function Radios<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="stack" style={{ ["--gap" as string]: "8px", marginTop: 8 }} role="radiogroup">
      {options.map((o) => (
        <label key={o.value} className="check card flat" style={{ padding: "12px 14px", alignItems: "center", borderColor: value === o.value ? "var(--ink)" : undefined }}>
          <input
            type="radio"
            name={name}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            style={{ marginTop: 0 }}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export default function OutcomeForm({
  initial,
  exists,
  requestCreatedAt,
}: {
  initial: OutcomeInput;
  exists: boolean;
  requestCreatedAt: string;
}) {
  const [v, setV] = useState<OutcomeInput>(initial);
  const [errors, setErrors] = useState<OutcomeErrors>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<null | { minutes: number | null; updated: boolean }>(null);
  const [failed, setFailed] = useState("");

  function set<K extends keyof OutcomeInput>(key: K, value: OutcomeInput[K]) {
    setV((cur) => {
      const next = { ...cur, [key]: value };
      // Keep the form consistent: no contact time or reply without a sent message.
      if (key === "messageSent" && value !== "yes") {
        next.contactAttemptedAt = "";
        next.reply = "";
        next.repliedAt = "";
        next.jobStarted = next.jobStarted === "yes" ? "" : next.jobStarted;
      }
      if (key === "reply" && value !== "yes" && value !== "no") next.repliedAt = "";
      return next;
    });
    setErrors((e) => ({ ...e, [key]: undefined }));
    setSaved(null);
    setFailed("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const check = validateOutcome(v, { requestCreatedAt, now: Date.now() });
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setBusy(true);
    setFailed("");
    try {
      const result = await saveOutcomeAction(v);
      if (result.ok) {
        setSaved({ minutes: result.responseMinutes, updated: result.updated });
      } else if (result.error === "validation") {
        setErrors(result.errors);
      } else if (result.error === "not_found") {
        setFailed("That request or contractor could not be found in the current records.");
      } else {
        setFailed("Something went wrong. Nothing was saved. Please try again.");
      }
    } catch {
      setFailed("Something went wrong. Nothing was saved. Please try again.");
    }
    setBusy(false);
  }

  const sent = v.messageSent === "yes";
  const replied = v.reply === "yes" || v.reply === "no";
  const count = Object.values(errors).filter(Boolean).length;

  return (
    <form onSubmit={submit} noValidate className="stack" style={{ ["--gap" as string]: "24px" }}>
      {exists && (
        <p className="notice notice-info" style={{ margin: 0 }}>
          An outcome is already recorded for this contractor and request.
          Saving will update it.
        </p>
      )}
      {count > 0 && (
        <div role="alert" className="notice notice-warn">
          Please fix {count === 1 ? "1 problem" : `${count} problems`} below.
        </div>
      )}
      {failed && (
        <div role="alert" className="notice notice-warn" style={{ fontWeight: 600 }}>
          {failed}
        </div>
      )}
      {saved && (
        <div role="status" className="notice notice-ok" style={{ fontWeight: 600 }}>
          Outcome {saved.updated ? "updated" : "saved"}.{" "}
          {saved.minutes !== null
            ? `Response time recorded: ${formatMinutes(saved.minutes)}.`
            : "No response time was recorded."}
        </div>
      )}

      <fieldset>
        <legend className="label">
          Did you actually send the message? <span style={{ color: "var(--err-ink)" }}>*</span>
        </legend>
        <p className="help" style={{ marginTop: 0 }}>
          Opening the WhatsApp link does not count. Only say yes if you pressed
          send.
        </p>
        <Radios
          name="messageSent"
          value={v.messageSent}
          onChange={(x) => set("messageSent", x)}
          options={[
            { value: "yes", label: "Yes, I sent it" },
            { value: "no", label: "No, I did not send it" },
          ]}
        />
        <Err message={errors.messageSent} />
      </fieldset>

      {sent && (
        <div className="field">
          <label htmlFor="contactAttemptedAt" className="label">
            When did you send it? (India time) <span style={{ color: "var(--err-ink)" }}>*</span>
          </label>
          <input
            id="contactAttemptedAt"
            type="datetime-local"
            value={v.contactAttemptedAt}
            onChange={(e) => set("contactAttemptedAt", e.target.value)}
            aria-invalid={errors.contactAttemptedAt ? true : undefined}
            className="input"
          />
          <Err message={errors.contactAttemptedAt} />
        </div>
      )}

      {sent && (
        <fieldset>
          <legend className="label">Contractor reply</legend>
          <p className="help" style={{ marginTop: 0 }}>
            A reply is not the same as confirmed availability. Record only what
            they actually said.
          </p>
          <Radios
            name="reply"
            value={v.reply}
            onChange={(x) => set("reply", x)}
            options={[
              { value: "", label: "Not recorded yet (still waiting)" },
              { value: "yes", label: "Replied: yes (interested or available)" },
              { value: "no", label: "Replied: no (declined)" },
              { value: "no_response", label: "No response" },
            ]}
          />
          <Err message={errors.reply} />
        </fieldset>
      )}

      {replied && (
        <div className="field">
          <label htmlFor="repliedAt" className="label">
            When did they reply? (India time, optional)
          </label>
          <input
            id="repliedAt"
            type="datetime-local"
            value={v.repliedAt}
            onChange={(e) => set("repliedAt", e.target.value)}
            aria-invalid={errors.repliedAt ? true : undefined}
            className="input"
          />
          <p className="help" style={{ marginTop: 0 }}>
            Leave it empty if you do not know. No response time is calculated
            without it.
          </p>
          <Err message={errors.repliedAt} />
        </div>
      )}

      <fieldset>
        <legend className="label">Was this match usable?</legend>
        <Radios
          name="matchUsable"
          value={v.matchUsable}
          onChange={(x) => set("matchUsable", x)}
          options={[
            { value: "", label: "Not sure yet" },
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      </fieldset>

      <div className="field">
        <label htmlFor="rating" className="label">
          How useful was it? (1 = not useful, 5 = very useful, optional)
        </label>
        <select
          id="rating"
          value={v.rating ?? ""}
          onChange={(e) => set("rating", e.target.value === "" ? null : Number(e.target.value))}
          aria-invalid={errors.rating ? true : undefined}
          className="select"
        >
          <option value="">No rating</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <Err message={errors.rating} />
      </div>

      <div className="field">
        <label htmlFor="failureReason" className="label">
          Reason it did not work out{" "}
          {v.matchUsable === "no" ? <span style={{ color: "var(--err-ink)" }}>*</span> : "(optional)"}
        </label>
        <select
          id="failureReason"
          value={v.failureReason}
          onChange={(e) => set("failureReason", e.target.value)}
          aria-invalid={errors.failureReason ? true : undefined}
          className="select"
        >
          <option value="">No reason</option>
          {FAILURE_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <Err message={errors.failureReason} />
      </div>

      <fieldset>
        <legend className="label">Did the job start, if you know?</legend>
        <Radios
          name="jobStarted"
          value={v.jobStarted}
          onChange={(x) => set("jobStarted", x)}
          options={[
            { value: "", label: "Not known" },
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
        <Err message={errors.jobStarted} />
      </fieldset>

      <button
        type="submit"
        disabled={busy}
        className="btn btn-primary btn-lg"
      >
        {busy ? "Saving…" : "Save outcome"}
      </button>
    </form>
  );
}
