"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONFIRMATION_STATUSES, NOTE_MAX } from "@/lib/confirmation";
import { saveConfirmationAction } from "./actions";

const field =
  "mt-1 block w-full rounded-md border border-zinc-400 bg-white px-3 py-2 text-sm focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/40 aria-[invalid=true]:border-red-700";

// Lets the founder record what a contractor said about THIS request, after a
// call or a reply. It never sends anything and never contacts anyone.
export default function ConfirmationForm({
  requestId,
  contractorId,
  requestHasDate,
}: {
  requestId: string;
  contractorId: string;
  requestHasDate: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setErrors({});
    try {
      const result = await saveConfirmationAction({
        requestId,
        contractorId,
        status,
        confirmedStartDate: date,
        note,
      });
      if (result.ok) {
        setStatus("");
        setDate("");
        setNote("");
        setMessage("Saved. The status above now shows this change.");
        router.refresh();
      } else if (result.error === "validation") {
        setErrors(result.errors as Record<string, string>);
      } else if (result.error === "setup") {
        setMessage("The Confirmations tab is not set up in the Sheet yet. Nothing was saved.");
      } else if (result.error === "too_many_requests") {
        setMessage("Too many saves just now. Please wait a few minutes.");
      } else if (result.error === "not_found") {
        setMessage("This contractor is no longer a potential match for the request. Nothing was saved.");
      } else {
        setMessage("Something went wrong. Nothing was saved.");
      }
    } catch {
      setMessage("Something went wrong. Nothing was saved.");
    }
    setBusy(false);
  }

  return (
    <details className="mt-3 rounded-md border border-zinc-300 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-blue-800">
        Record what they said about this request
      </summary>
      <form onSubmit={submit} noValidate className="mt-3 space-y-3">
        <div>
          <label className="block font-medium" htmlFor={`status-${contractorId}`}>
            Status
          </label>
          <select
            id={`status-${contractorId}`}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-invalid={errors.status ? true : undefined}
            className={field}
          >
            <option value="">Choose…</option>
            {CONFIRMATION_STATUSES.map((s) => (
              <option
                key={s.value}
                value={s.value}
                disabled={s.value === "available_requested_date" && !requestHasDate}
              >
                {s.label}
              </option>
            ))}
          </select>
          {errors.status && <p className="mt-1 font-medium text-red-700">{errors.status}</p>}
        </div>

        {status === "available_alternative_date" && (
          <div>
            <label className="block font-medium" htmlFor={`date-${contractorId}`}>
              Date they confirmed
            </label>
            <input
              id={`date-${contractorId}`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={errors.confirmedStartDate ? true : undefined}
              className={field}
            />
            {errors.confirmedStartDate && (
              <p className="mt-1 font-medium text-red-700">{errors.confirmedStartDate}</p>
            )}
          </div>
        )}

        <div>
          <label className="block font-medium" htmlFor={`note-${contractorId}`}>
            Note <span className="font-normal text-zinc-600">(optional, no phone numbers)</span>
          </label>
          <input
            id={`note-${contractorId}`}
            type="text"
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={errors.note ? true : undefined}
            className={field}
          />
          {errors.note && <p className="mt-1 font-medium text-red-700">{errors.note}</p>}
        </div>

        <button
          type="submit"
          disabled={busy || !status}
          className="rounded-md bg-blue-800 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-900 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save status"}
        </button>
        {message && (
          <p role="status" className="font-medium text-zinc-800">
            {message}
          </p>
        )}
      </form>
    </details>
  );
}
