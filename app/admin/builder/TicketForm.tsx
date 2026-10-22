"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PUNE_AREAS, TRADES } from "@/lib/registration";
import { REQUEST_CONSENT_TEXT } from "@/lib/request";
import { createTicketAction } from "./actions";

const field =
  "mt-1 block w-full rounded-md border border-zinc-400 bg-white px-3 py-2.5 text-base focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/40 aria-[invalid=true]:border-red-700";
const label = "block text-sm font-medium text-zinc-900";

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
  const err = (k: string) => (errors[k] ? <p id={`${k}-error`} className="mt-1 text-sm font-medium text-red-700">{errors[k]}</p> : null);

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
    <form onSubmit={submit} noValidate className="space-y-5 rounded-md border border-zinc-300 p-5">
      <h2 className="text-lg font-semibold">Raise a job ticket</h2>
      {Object.keys(errors).length > 0 && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          Please fix the highlighted fields.
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className={label}>
          Trade required
          <select className={field} value={v.trade} onChange={(e) => set("trade", e.target.value)} aria-invalid={Boolean(errors.trade)}>
            <option value="">Choose…</option>
            {TRADES.map((t) => <option key={t}>{t}</option>)}
          </select>
          {err("trade")}
        </label>
        <label className={label}>
          Site location (Pune locality)
          <input className={field} list="pune-areas" value={v.area} onChange={(e) => set("area", e.target.value)} aria-invalid={Boolean(errors.area)} placeholder="e.g. Baner" />
          <datalist id="pune-areas">{PUNE_AREAS.map((a) => <option key={a} value={a} />)}</datalist>
          {err("area")}
        </label>
      </div>
      <label className={label}>
        Work description
        <textarea className={field} rows={3} value={v.description} onChange={(e) => set("description", e.target.value)} aria-invalid={Boolean(errors.description)}
          placeholder="e.g. Block-work contractor left mid-way on floor 4. Need a masonry team to finish internal walls." />
        {err("description")}
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className={label}>
          Required start date
          <input type="date" min={today} className={field} value={v.startDate} onChange={(e) => set("startDate", e.target.value)} aria-invalid={Boolean(errors.startDate)} />
          {err("startDate")}
        </label>
        <label className={label}>
          Estimated duration (days)
          <input inputMode="numeric" className={field} value={v.durationDays} onChange={(e) => set("durationDays", e.target.value)} aria-invalid={Boolean(errors.durationDays)} placeholder="e.g. 10" />
          {err("durationDays")}
        </label>
      </div>
      <label className={label}>
        Essential notes <span className="font-normal text-zinc-600">(optional)</span>
        <input className={field} value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Material on site; work 9am to 6pm" />
        {err("notes")}
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className={label}>
          Builder name or company <span className="font-normal text-zinc-600">(optional)</span>
          <input className={field} value={v.name} onChange={(e) => set("name", e.target.value)} />
          {err("name")}
        </label>
        <label className={label}>
          Builder mobile number
          <input inputMode="tel" className={field} value={v.phone} onChange={(e) => set("phone", e.target.value)} aria-invalid={Boolean(errors.phone)} placeholder="98765 43210" />
          {err("phone")}
        </label>
      </div>
      <label className="flex gap-3 text-sm leading-6">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={v.consent} onChange={(e) => set("consent", e.target.checked)} />
        <span>{REQUEST_CONSENT_TEXT}</span>
      </label>
      {err("consent")}
      {problem && <p role="alert" className="text-sm font-medium text-red-800">{problem}</p>}
      <button type="submit" disabled={busy} className="rounded-md bg-blue-800 px-5 py-3 text-base font-semibold text-white hover:bg-blue-900 disabled:opacity-60">
        {busy ? "Saving…" : "Raise ticket"}
      </button>
    </form>
  );
}
