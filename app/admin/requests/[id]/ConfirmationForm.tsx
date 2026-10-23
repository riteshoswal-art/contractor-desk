"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONFIRMATION_STATUSES, NOTE_MAX } from "@/lib/confirmation";
import { Icon } from "../../../ui";
import { saveConfirmationAction } from "./actions";

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
    <details className="small" style={{ marginTop: 12 }}>
      <summary className="btn btn-ghost" style={{ display: "inline-flex", minHeight: 40 }}>
        <Icon name="cal" size={16} />
        Record what they said about this request
      </summary>
      <form onSubmit={submit} noValidate className="card flat tint stack" style={{ ["--gap" as string]: "12px", padding: 16, marginTop: 8 }}>
        <div className="field">
          <label className="label" htmlFor={`status-${contractorId}`}>
            Status
          </label>
          <select
            id={`status-${contractorId}`}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-invalid={errors.status ? true : undefined}
            className="select"
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
          {errors.status && <p className="error">{errors.status}</p>}
        </div>

        {status === "available_alternative_date" && (
          <div className="field">
            <label className="label" htmlFor={`date-${contractorId}`}>
              Date they confirmed
            </label>
            <input
              id={`date-${contractorId}`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={errors.confirmedStartDate ? true : undefined}
              className="input"
            />
            {errors.confirmedStartDate && (
              <p className="error">{errors.confirmedStartDate}</p>
            )}
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor={`note-${contractorId}`}>
            Note <span className="opt">(optional, no phone numbers)</span>
          </label>
          <input
            id={`note-${contractorId}`}
            type="text"
            maxLength={NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={errors.note ? true : undefined}
            className="input"
          />
          {errors.note && <p className="error">{errors.note}</p>}
        </div>

        <button
          type="submit"
          disabled={busy || !status}
          className="btn btn-primary"
        >
          {busy ? "Saving…" : "Save status"}
        </button>
        {message && (
          <p role="status" className="small" style={{ margin: 0, fontWeight: 600 }}>
            {message}
          </p>
        )}
      </form>
    </details>
  );
}
