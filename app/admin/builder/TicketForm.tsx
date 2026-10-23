"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PUNE_AREAS, TRADES } from "@/lib/registration";
import { REQUEST_CONSENT_TEXT } from "@/lib/request";
import { Icon } from "../../ui";
import { createTicketAction } from "./actions";

// "Raise a job ticket" for the Builder Demo. The founder fills it in on the
// builder's behalf. The server checks everything again with the same rules as
// the public request form.
export default function TicketForm({ today }: { today: string }) {
  const router = useRouter();
  const [v, setV] = useState({ trade: "", area: "", description: "", startDate: "", durationDays: "", notes: "", name: "", phone: "", consent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const set = (k: keyof typeof v, value: string | boolean) => setV((old) => ({ ...old, [k]: value }));
  const err = (k: string) => (errors[k] ? <p id={`${k}-error`} className="error">{errors[k]}</p> : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem("");
    setErrors({});
    try {
      const days = v.durationDays.trim() === "" ? null : Number(v.durationDays);
      const r = await createTicketAction({ ...v, durationDays: days === null || Number.isNaN(days) ? null : days });
      if (r.ok) {
        // Clear the form: Next.js may keep this page hidden in memory after navigating.
        setV({ trade: "", area: "", description: "", startDate: "", durationDays: "", notes: "", name: "", phone: "", consent: false });
        router.push(`/admin/builder/${r.id}?new=1`);
        return;
      }
      if (r.error === "validation") setErrors(r.errors as Record<string, string>);
      else setProblem(r.error === "setup" ? "The Requests tab is not set up. Nothing was saved." : "Something went wrong. Nothing was saved.");
    } catch {
      setProblem("Something went wrong. Nothing was saved.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} noValidate className="card form-card stack" style={{ ["--gap" as string]: "22px" }}>
      <div>
        <h2 className="h1">Raise a job ticket</h2>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          On a builder&apos;s behalf. The same checks as the public request form.
        </p>
      </div>
      {Object.keys(errors).length > 0 && (
        <p role="alert" className="notice notice-warn" style={{ fontWeight: 600 }}>
          Please fix the highlighted fields.
        </p>
      )}
      <div className="grid grid-2" style={{ gap: 20 }}>
        <label className="field">
          <span className="label">Trade required</span>
          <select className="select" value={v.trade} onChange={(e) => set("trade", e.target.value)} aria-invalid={Boolean(errors.trade)}>
            <option value="">Choose…</option>
            {TRADES.map((t) => <option key={t}>{t}</option>)}
          </select>
          {err("trade")}
        </label>
        <label className="field">
          <span className="label">Site location (Pune locality)</span>
          <input className="input" list="pune-areas" value={v.area} onChange={(e) => set("area", e.target.value)} aria-invalid={Boolean(errors.area)} placeholder="e.g. Baner" />
          <datalist id="pune-areas">{PUNE_AREAS.map((a) => <option key={a} value={a} />)}</datalist>
          {err("area")}
        </label>
      </div>
      <label className="field">
        <span className="label">Work description</span>
        <textarea className="textarea" rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} aria-invalid={Boolean(errors.description)}
          placeholder="e.g. Block-work contractor left mid-way on floor 4. Need a masonry team to finish internal walls." />
        {err("description")}
      </label>
      <div className="grid grid-2" style={{ gap: 20 }}>
        <label className="field">
          <span className="label">Required start date</span>
          <input type="date" min={today} className="input" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} aria-invalid={Boolean(errors.startDate)} />
          {err("startDate")}
        </label>
        <label className="field">
          <span className="label">Estimated duration (days)</span>
          <div className="suffix-input">
            <input inputMode="numeric" className="input" value={v.durationDays} onChange={(e) => set("durationDays", e.target.value)} aria-invalid={Boolean(errors.durationDays)} placeholder="e.g. 10" />
            <span aria-hidden="true">days</span>
          </div>
          {err("durationDays")}
        </label>
      </div>
      <label className="field">
        <span className="label">
          Essential notes <span className="opt">(optional)</span>
        </span>
        <input className="input" value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Material on site; work 9am to 6pm" />
        {err("notes")}
      </label>
      <div className="grid grid-2" style={{ gap: 20 }}>
        <label className="field">
          <span className="label">
            Builder name or company <span className="opt">(optional)</span>
          </span>
          <input className="input" value={v.name} onChange={(e) => set("name", e.target.value)} />
          {err("name")}
        </label>
        <label className="field">
          <span className="label">Builder mobile number</span>
          <input inputMode="tel" className="input" value={v.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={Boolean(errors.phone)} placeholder="98765 43210" />
          {err("phone")}
        </label>
      </div>
      <div>
        <label className="check">
          <input type="checkbox" checked={v.consent} onChange={(e) => set("consent", e.target.checked)} />
          <span>{REQUEST_CONSENT_TEXT}</span>
        </label>
        {err("consent")}
      </div>
      {problem && (
        <p role="alert" className="notice notice-warn" style={{ fontWeight: 600 }}>
          {problem}
        </p>
      )}
      <div className="row between form-nav" style={{ justifyContent: "flex-end" }}>
        <button type="submit" disabled={busy} className="btn btn-primary btn-lg">
          {busy ? "Saving…" : "Raise ticket"} <Icon name="arrow" size={16} />
        </button>
      </div>
    </form>
  );
}
