"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OTHER_AREA, PUNE_AREAS, TRADES } from "@/lib/registration";
import { REQUEST_CONSENT_TEXT } from "@/lib/request";
import { builderTelegramLinkAction, raiseTicketAction, registerBuilderAction, signOutBuilderAction } from "./actions";

const field =
  "mt-1 block w-full rounded-md border border-zinc-400 bg-white px-3 py-2.5 text-base focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/40 aria-[invalid=true]:border-red-700";
const label = "block text-sm font-medium text-zinc-900";
const button = "rounded-md bg-blue-800 px-5 py-3 text-base font-semibold text-white hover:bg-blue-900 disabled:opacity-60";

const PROBLEM: Record<string, string> = {
  demo_only: "The builder pages are not available on this server.",
  too_many_requests: "Too many attempts. Please wait a few minutes.",
  not_registered: "Please register first.",
  no_token: "Telegram is not set up on this server.",
  no_bot: "Could not reach the Telegram bot. Please try again.",
};
const problemText = (error: string) => PROBLEM[error] ?? "Something went wrong. Please try again.";

function FieldError({ text, id }: { text?: string; id: string }) {
  return text ? <p id={`${id}-error`} className="mt-1 text-sm font-medium text-red-700">{text}</p> : null;
}

// Step 1: register (name, optional company, mobile, consent).
export function RegisterBuilderForm() {
  const router = useRouter();
  const [v, setV] = useState({ name: "", company: "", phone: "", consent: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem("");
    setErrors({});
    try {
      const r = await registerBuilderAction(v);
      if (r.ok) {
        router.refresh();
        return;
      }
      if (r.error === "validation") setErrors(r.errors as Record<string, string>);
      else setProblem(problemText(r.error));
    } catch {
      setProblem(problemText(""));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div>
        <p className="cb-eyebrow">For builders</p>
        <h2 className="mt-1.5 text-2xl font-semibold">Register as a builder</h2>
        <p className="mt-1.5 text-sm text-zinc-600">Takes under a minute.</p>
      </div>
      <label className={label}>
        Your name
        <input className={field} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-invalid={Boolean(errors.name)} autoComplete="name" />
        <FieldError id="name" text={errors.name} />
      </label>
      <label className={label}>
        Company <span className="font-normal text-zinc-600">(optional)</span>
        <input className={field} value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} aria-invalid={Boolean(errors.company)} autoComplete="organization" />
        <FieldError id="company" text={errors.company} />
      </label>
      <label className={label}>
        Mobile number
        <input inputMode="tel" className={field} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} aria-invalid={Boolean(errors.phone)} placeholder="98765 43210" autoComplete="tel" />
        <FieldError id="phone" text={errors.phone} />
      </label>
      <label className="flex gap-3 text-sm leading-6">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={v.consent} onChange={(e) => setV({ ...v, consent: e.target.checked })} />
        <span>
          I agree that Contractor Desk may store my name, company and mobile number, and share my name and number with the contractor I
          choose for a job.
        </span>
      </label>
      <FieldError id="consent" text={errors.consent} />
      {problem && <p role="alert" className="text-sm font-medium text-red-800">{problem}</p>}
      <button type="submit" disabled={busy} className={button}>{busy ? "Registering…" : "Register"}</button>
    </form>
  );
}

// Step 2: connect the builder's own Telegram chat, so bids arrive there.
export function ConnectTelegram() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function make() {
    setBusy(true);
    setProblem("");
    try {
      const r = await builderTelegramLinkAction();
      if (r.ok) setUrl(r.url);
      else setProblem(problemText(r.error));
    } catch {
      setProblem(problemText(""));
    }
    setBusy(false);
  }

  if (url)
    return (
      <div className="space-y-2 text-sm leading-6">
        <a href={url} target="_blank" rel="noreferrer" className={`${button} inline-block`}>Open Telegram</a>
        <p>
          Open the link on the phone that should receive the bids and press <b>Start</b>. This page updates by itself. The link works
          once, for 30 minutes.
        </p>
      </div>
    );
  return (
    <div className="space-y-2">
      <button type="button" onClick={make} disabled={busy} className={button}>{busy ? "Preparing…" : "Connect Telegram"}</button>
      {problem && <p role="alert" className="text-sm font-medium text-red-800">{problem}</p>}
    </div>
  );
}

export function SignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-sm font-medium text-blue-800 underline"
      onClick={async () => {
        await signOutBuilderAction();
        router.refresh();
      }}
    >
      Not you? Sign out
    </button>
  );
}

// Step 3: raise a ticket. Saved with the same checks as the public request
// form, then sent straight away to the available contractors on Telegram.
const EMPTY_TICKET = { trade: "", area: "", otherArea: "", description: "", startDate: "", durationDays: "", notes: "", consent: false };

export function BuilderTicketForm({ today, connected }: { today: string; connected: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(EMPTY_TICKET);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");
  const set = (k: keyof typeof v, value: string | boolean) => setV((old) => ({ ...old, [k]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem("");
    setErrors({});
    setDone("");
    try {
      const days = v.durationDays.trim() === "" ? null : Number(v.durationDays);
      const { otherArea, ...rest } = v;
      const area = v.area === OTHER_AREA ? otherArea : v.area;
      const r = await raiseTicketAction({ ...rest, area, durationDays: days === null || Number.isNaN(days) ? null : days });
      if (r.ok) {
        setV(EMPTY_TICKET);
        setDone(
          r.asked > 0
            ? `Ticket ${r.id} raised. Sent to ${r.asked} available contractor${r.asked === 1 ? "" : "s"} on Telegram.`
            : `Ticket ${r.id} raised. No available contractor on Telegram could be asked yet.`,
        );
        router.refresh();
      } else if (r.error === "validation") setErrors(r.errors as Record<string, string>);
      else setProblem(problemText(r.error));
    } catch {
      setProblem(problemText(""));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} noValidate className={`space-y-5 rounded-[20px] p-5 ${connected ? "border-2 border-[var(--ink)]" : "border border-[var(--line)]"}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Raise a ticket</h2>
        <span className="cb-eyebrow !text-[var(--accent)]">Step 2</span>
      </div>
      {Object.keys(errors).length > 0 && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">Please fix the highlighted fields.</p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className={label}>
          Work needed
          <select className={field} value={v.trade} onChange={(e) => set("trade", e.target.value)} aria-invalid={Boolean(errors.trade)}>
            <option value="">Choose…</option>
            {TRADES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <FieldError id="trade" text={errors.trade} />
        </label>
        <label className={label}>
          Site location (Pune locality)
          <select className={field} value={v.area} onChange={(e) => set("area", e.target.value)} aria-invalid={Boolean(errors.area)}>
            <option value="">Choose…</option>
            {PUNE_AREAS.map((a) => <option key={a}>{a}</option>)}
            <option value={OTHER_AREA}>Other locality</option>
          </select>
          <FieldError id="area" text={errors.area} />
        </label>
      </div>
      {v.area === OTHER_AREA && (
        <label className={label}>
          Which locality?
          <input className={field} value={v.otherArea} onChange={(e) => set("otherArea", e.target.value)} aria-invalid={Boolean(errors.area)} />
        </label>
      )}
      <label className={label}>
        Work description
        <textarea
          className={field}
          rows={3}
          value={v.description}
          onChange={(e) => set("description", e.target.value)}
          aria-invalid={Boolean(errors.description)}
          placeholder="e.g. Plumbing for 12 flats on floors 3 and 4: concealed piping and bathroom fittings."
        />
        <FieldError id="description" text={errors.description} />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className={label}>
          Start date
          <input type="date" min={today} className={field} value={v.startDate} onChange={(e) => set("startDate", e.target.value)} aria-invalid={Boolean(errors.startDate)} />
          <FieldError id="startDate" text={errors.startDate} />
        </label>
        <label className={label}>
          How many days (estimate)
          <input inputMode="numeric" className={field} value={v.durationDays} onChange={(e) => set("durationDays", e.target.value)} aria-invalid={Boolean(errors.durationDays)} placeholder="e.g. 7" />
          <FieldError id="durationDays" text={errors.durationDays} />
        </label>
      </div>
      <label className={label}>
        Notes <span className="font-normal text-zinc-600">(optional)</span>
        <input className={field} value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Material on site; work 9am to 6pm" />
        <FieldError id="notes" text={errors.notes} />
      </label>
      <label className="flex gap-3 text-sm leading-6">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={v.consent} onChange={(e) => set("consent", e.target.checked)} />
        <span>{REQUEST_CONSENT_TEXT}</span>
      </label>
      <FieldError id="consent" text={errors.consent} />
      {problem && <p role="alert" className="text-sm font-medium text-red-800">{problem}</p>}
      {!connected && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Your Telegram is not connected yet (step 1). If you raise a ticket now, the quotations go to the Contractor Desk team instead of you.
        </p>
      )}
      {done && <p role="status" className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-900">{done}</p>}
      <button type="submit" disabled={busy} className={button}>{busy ? "Sending…" : "Raise ticket"}</button>
    </form>
  );
}
