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

const field =
  "mt-1 block w-full rounded-md border border-zinc-400 bg-white px-3 py-2.5 text-base focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/40 aria-[invalid=true]:border-red-700";
const choice =
  "flex cursor-pointer items-center gap-3 rounded-md border border-zinc-300 px-3 py-3 text-base has-[:checked]:border-blue-700 has-[:checked]:bg-blue-50";

function Err({ message }: { message?: string }) {
  return message ? (
    <p className="mt-1 text-sm font-medium text-red-700">{message}</p>
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
    <div className="mt-2 space-y-2" role="radiogroup">
      {options.map((o) => (
        <label key={o.value} className={choice}>
          <input
            type="radio"
            name={name}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="h-4 w-4 accent-blue-800"
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
    <form onSubmit={submit} noValidate className="mt-6 space-y-6">
      {exists && (
        <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
          An outcome is already recorded for this contractor and request.
          Saving will update it.
        </p>
      )}
      {count > 0 && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          Please fix {count === 1 ? "1 problem" : `${count} problems`} below.
        </div>
      )}
      {failed && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-900">
          {failed}
        </div>
      )}
      {saved && (
        <div role="status" className="rounded-md border border-green-300 bg-green-50 p-3 text-sm font-medium text-green-900">
          Outcome {saved.updated ? "updated" : "saved"}.{" "}
          {saved.minutes !== null
            ? `Response time recorded: ${formatMinutes(saved.minutes)}.`
            : "No response time was recorded."}
        </div>
      )}

      <fieldset>
        <legend className="text-sm font-medium">
          Did you actually send the message? <span className="text-red-700">*</span>
        </legend>
        <p className="mt-1 text-sm text-zinc-600">
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
        <div>
          <label htmlFor="contactAttemptedAt" className="block text-sm font-medium">
            When did you send it? (India time) <span className="text-red-700">*</span>
          </label>
          <input
            id="contactAttemptedAt"
            type="datetime-local"
            value={v.contactAttemptedAt}
            onChange={(e) => set("contactAttemptedAt", e.target.value)}
            aria-invalid={errors.contactAttemptedAt ? true : undefined}
            className={field}
          />
          <Err message={errors.contactAttemptedAt} />
        </div>
      )}

      {sent && (
        <fieldset>
          <legend className="text-sm font-medium">Contractor reply</legend>
          <p className="mt-1 text-sm text-zinc-600">
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
        <div>
          <label htmlFor="repliedAt" className="block text-sm font-medium">
            When did they reply? (India time, optional)
          </label>
          <input
            id="repliedAt"
            type="datetime-local"
            value={v.repliedAt}
            onChange={(e) => set("repliedAt", e.target.value)}
            aria-invalid={errors.repliedAt ? true : undefined}
            className={field}
          />
          <p className="mt-1 text-sm text-zinc-600">
            Leave it empty if you do not know. No response time is calculated
            without it.
          </p>
          <Err message={errors.repliedAt} />
        </div>
      )}

      <fieldset>
        <legend className="text-sm font-medium">Was this match usable?</legend>
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

      <div>
        <label htmlFor="rating" className="block text-sm font-medium">
          How useful was it? (1 = not useful, 5 = very useful, optional)
        </label>
        <select
          id="rating"
          value={v.rating ?? ""}
          onChange={(e) => set("rating", e.target.value === "" ? null : Number(e.target.value))}
          aria-invalid={errors.rating ? true : undefined}
          className={field}
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

      <div>
        <label htmlFor="failureReason" className="block text-sm font-medium">
          Reason it did not work out{" "}
          {v.matchUsable === "no" ? <span className="text-red-700">*</span> : "(optional)"}
        </label>
        <select
          id="failureReason"
          value={v.failureReason}
          onChange={(e) => set("failureReason", e.target.value)}
          aria-invalid={errors.failureReason ? true : undefined}
          className={field}
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
        <legend className="text-sm font-medium">Did the job start, if you know?</legend>
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
        className="w-full rounded-md bg-blue-800 px-4 py-3 text-base font-semibold text-white hover:bg-blue-900 disabled:opacity-60 sm:w-auto"
      >
        {busy ? "Saving…" : "Save outcome"}
      </button>
    </form>
  );
}
