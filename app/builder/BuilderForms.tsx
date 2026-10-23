"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/match";
import { OTHER_AREA, PUNE_AREAS, TRADES } from "@/lib/registration";
import { REQUEST_CONSENT_TEXT } from "@/lib/request";
import { Icon } from "../ui";
import { builderTelegramLinkAction, finishAndReviewAction, raiseTicketAction, registerBuilderAction, signOutBuilderAction } from "./actions";

const PROBLEM: Record<string, string> = {
  demo_only: "The builder pages are not available on this server.",
  too_many_requests: "Too many attempts. Please wait a few minutes.",
  not_registered: "Please register first.",
  no_token: "Telegram is not set up on this server.",
  no_bot: "Could not reach the Telegram bot. Please try again.",
  not_matched: "Choose a contractor on Telegram first.",
  already_reviewed: "You have already reviewed this job. Thank you!",
};
const problemText = (error: string) => PROBLEM[error] ?? "Something went wrong. Please try again.";

function FieldError({ text, id }: { text?: string; id: string }) {
  return text ? (
    <p id={`${id}-error`} className="error" style={{ margin: "6px 0 0" }}>
      {text}
    </p>
  ) : null;
}

export function Stepper({ now }: { now: 1 | 2 | 3 }) {
  const steps = ["Your details", "Connect Telegram", "Raise a ticket"];
  return (
    <div className="stepper" aria-label={`Step ${now} of 3`}>
      {steps.map((s, i) => (
        <div key={s} className={`step ${i + 1 < now ? "done" : i + 1 === now ? "now" : ""}`}>
          <div className="bar">
            <i />
          </div>
          <div className="cap">
            {i + 1}. {s}
          </div>
        </div>
      ))}
    </div>
  );
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
    <form onSubmit={submit} noValidate className="stack" style={{ ["--gap" as string]: "20px" }}>
      <div>
        <h1 className="h1">Tell us who you are</h1>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          Takes under a minute. Your number is shared only with the contractor you choose.
        </p>
      </div>
      <div className="grid grid-2">
        <label className="field">
          <span className="label">Your name</span>
          <input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} aria-invalid={Boolean(errors.name)} autoComplete="name" />
          <FieldError id="name" text={errors.name} />
        </label>
        <label className="field">
          <span className="label">
            Company <span className="opt">(optional)</span>
          </span>
          <input className="input" value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} aria-invalid={Boolean(errors.company)} autoComplete="organization" />
          <FieldError id="company" text={errors.company} />
        </label>
      </div>
      <label className="field">
        <span className="label">Mobile number</span>
        <input className="input" inputMode="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} aria-invalid={Boolean(errors.phone)} placeholder="98765 43210" autoComplete="tel" />
        <p className="help">10-digit Indian mobile number. +91 is optional.</p>
        <FieldError id="phone" text={errors.phone} />
      </label>
      <label className="check">
        <input type="checkbox" checked={v.consent} onChange={(e) => setV({ ...v, consent: e.target.checked })} />
        <span>I agree that Contractor Desk may store my name, company and mobile number, and share my name and number with the contractor I choose for a job.</span>
      </label>
      <FieldError id="consent" text={errors.consent} />
      {problem && (
        <p role="alert" className="error" style={{ margin: 0 }}>
          {problem}
        </p>
      )}
      <div className="row between form-nav">
        <span />
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? "Registering…" : "Continue"} <Icon name="arrow" size={16} />
        </button>
      </div>
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
      <div className="stack" style={{ ["--gap" as string]: "10px" }}>
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
          <Icon name="send" size={16} /> Open Telegram
        </a>
        <p className="small muted" style={{ margin: 0 }}>
          Open it on the phone that should receive the bids and press <b>Start</b>. This page updates by itself. The link works once, for 30 minutes.
        </p>
      </div>
    );
  return (
    <div className="stack" style={{ ["--gap" as string]: "10px" }}>
      <div>
        <button type="button" onClick={make} disabled={busy} className="btn btn-primary">
          <Icon name="send" size={16} /> {busy ? "Preparing…" : "Connect Telegram"}
        </button>
      </div>
      {problem && (
        <p role="alert" className="error" style={{ margin: 0 }}>
          {problem}
        </p>
      )}
    </div>
  );
}

export function SignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-quiet"
      onClick={async () => {
        await signOutBuilderAction();
        router.refresh();
      }}
    >
      Not you? Sign out
    </button>
  );
}

// Step 3: raise a ticket, with the Concept B request layout: the form on the
// left and a live "Your request" summary on the right. Saved with the same
// checks as the public request form, then sent straight away to the
// available contractors on Telegram.
export type TicketInitial = { trade?: string; area?: string; startDate?: string };

export function BuilderTicketForm({ today, connected, initial }: { today: string; connected: boolean; initial?: TicketInitial }) {
  const router = useRouter();
  const empty = { trade: "", area: "", otherArea: "", description: "", startDate: "", durationDays: "", notes: "", consent: false };
  const start = {
    ...empty,
    trade: initial?.trade && (TRADES as readonly string[]).includes(initial.trade) ? initial.trade : "",
    area: initial?.area && (PUNE_AREAS as readonly string[]).includes(initial.area) ? initial.area : "",
    startDate: initial?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(initial.startDate) && initial.startDate >= today ? initial.startDate : "",
  };
  const [v, setV] = useState(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");
  const set = (k: keyof typeof v, value: string | boolean) => {
    setV((old) => ({ ...old, [k]: value }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };
  const locality = v.area === OTHER_AREA ? v.otherArea : v.area;

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
        setV(empty);
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

  const summary: [string, string][] = [
    ["Trade", v.trade || "—"],
    ["Locality", locality ? `${locality}, Pune` : "—"],
    ["Needed from", v.startDate ? formatDate(v.startDate) : "—"],
    ["Duration", v.durationDays.trim() ? `About ${v.durationDays.trim()} days` : "—"],
  ];

  return (
    <div className="form-layout">
      <form onSubmit={submit} noValidate className="card form-card stack" style={{ ["--gap" as string]: "22px" }}>
        <Stepper now={3} />
        <div>
          <h1 className="h1">What work do you need?</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            These details decide which contractors are asked.
          </p>
        </div>
        {Object.values(errors).some(Boolean) && (
          <p role="alert" className="notice notice-warn" style={{ margin: 0 }}>
            Please fix the highlighted fields.
          </p>
        )}
        <div className="field">
          <span className="label">Trade needed</span>
          <div className="row wrap" style={{ gap: 8 }}>
            {TRADES.map((t) => (
              <button key={t} type="button" className={`chip${v.trade === t ? " on" : ""}`} aria-pressed={v.trade === t} onClick={() => set("trade", t)}>
                {t}
              </button>
            ))}
          </div>
          <FieldError id="trade" text={errors.trade} />
        </div>
        <div className="grid grid-2">
          <label className="field">
            <span className="label">Site locality in Pune</span>
            <select className="select" value={v.area} onChange={(e) => set("area", e.target.value)} aria-invalid={Boolean(errors.area)}>
              <option value="">Choose a locality</option>
              {PUNE_AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
              <option value={OTHER_AREA}>Other locality</option>
            </select>
            <FieldError id="area" text={errors.area} />
          </label>
          <label className="field">
            <span className="label">Needed from</span>
            <input type="date" min={today} className="input" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} aria-invalid={Boolean(errors.startDate)} />
            <FieldError id="startDate" text={errors.startDate} />
          </label>
        </div>
        {v.area === OTHER_AREA && (
          <label className="field">
            <span className="label">Which locality?</span>
            <input className="input" value={v.otherArea} onChange={(e) => set("otherArea", e.target.value)} aria-invalid={Boolean(errors.area)} />
          </label>
        )}
        <div className="grid grid-2">
          <label className="field">
            <span className="label">Expected duration</span>
            <div className="suffix-input">
              <input inputMode="numeric" className="input" value={v.durationDays} onChange={(e) => set("durationDays", e.target.value)} aria-invalid={Boolean(errors.durationDays)} />
              <span>days</span>
            </div>
            <FieldError id="durationDays" text={errors.durationDays} />
          </label>
          <label className="field">
            <span className="label">
              Other notes <span className="opt">(optional)</span>
            </span>
            <input className="input" value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Work on floors 3 to 5" />
            <FieldError id="notes" text={errors.notes} />
          </label>
        </div>
        <label className="field">
          <span className="label">What happened, and what do you need?</span>
          <textarea
            className="textarea"
            value={v.description}
            onChange={(e) => set("description", e.target.value)}
            aria-invalid={Boolean(errors.description)}
            placeholder="e.g. Our plumbing contractor left halfway through. We need concealed piping and bathroom fittings finished in 8 flats."
          />
          <p className="help">Please don&apos;t include phone numbers or personal details.</p>
          <FieldError id="description" text={errors.description} />
        </label>
        <label className="check">
          <input type="checkbox" checked={v.consent} onChange={(e) => set("consent", e.target.checked)} />
          <span>{REQUEST_CONSENT_TEXT}</span>
        </label>
        <FieldError id="consent" text={errors.consent} />
        {!connected && (
          <p className="notice notice-warn" style={{ margin: 0 }}>
            <Icon name="info" size={16} />
            <span>Your Telegram is not connected yet (step 2). If you raise a ticket now, the quotations go to the Contractor Desk team instead of you.</span>
          </p>
        )}
        {problem && (
          <p role="alert" className="error" style={{ margin: 0 }}>
            {problem}
          </p>
        )}
        {done && (
          <p role="status" className="notice notice-ok" style={{ margin: 0 }}>
            <Icon name="check" size={16} />
            <span>{done}</span>
          </p>
        )}
        <div className="row between form-nav">
          <span className="help" style={{ margin: 0 }}>
            Available contractors are asked on Telegram straight away.
          </span>
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy ? "Sending…" : "Raise ticket"} <Icon name="arrow" size={16} />
          </button>
        </div>
      </form>
      <aside className="card tint stack summary" style={{ ["--gap" as string]: "14px" }}>
        <span className="eyebrow">Your request</span>
        {summary.map(([k, val]) => (
          <div key={k} className="row between">
            <span className="muted small">{k}</span>
            <span className="h3">{val}</span>
          </div>
        ))}
        <hr className="divider" />
        <div className="stack small" style={{ ["--gap" as string]: "10px" }}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <Icon name="lock" size={16} />
            <span>Your number is shared only with the contractor you choose.</span>
          </div>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <Icon name="info" size={16} />
            <span>Each available contractor sends one quote. You compare like for like, then choose.</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

// After the match: mark the work as finished and review the contractor.
export function FinishAndReview({ requestId, name }: { requestId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  return (
    <div className="stack" style={{ ["--gap" as string]: "8px" }}>
      <div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setProblem("");
            try {
              const r = await finishAndReviewAction(requestId);
              if (r.ok) {
                router.push(r.reviewPath);
                return;
              }
              setProblem(problemText(r.error));
            } catch {
              setProblem(problemText(""));
            }
            setBusy(false);
          }}
        >
          <Icon name="star" size={16} /> {busy ? "Opening…" : `Work finished? Rate ${name.split(" ")[0]}`}
        </button>
      </div>
      {problem && (
        <p role="alert" className="error" style={{ margin: 0 }}>
          {problem}
        </p>
      )}
    </div>
  );
}
