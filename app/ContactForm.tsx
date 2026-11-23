"use client";

import { useState } from "react";
import { Icon } from "./ui";

type Errors = Partial<Record<"name" | "email" | "message", string>>;
type State = "idle" | "sending" | "sent" | "failed";

// The home page "Contact us" form. The server saves the message and emails both
// sides (app/api/contact/route.ts).
export default function ContactForm() {
  const [values, setValues] = useState({ name: "", email: "", message: "", website: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [state, setState] = useState<State>("idle");
  const [emailed, setEmailed] = useState(true);

  const set = (k: keyof typeof values, v: string) => {
    setValues((s) => ({ ...s, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; errors?: Errors; emailed?: boolean };
      if (data.ok) {
        setEmailed(data.emailed !== false);
        setState("sent");
      } else if (data.errors) {
        setErrors(data.errors);
        setState("idle");
      } else setState("failed");
    } catch {
      setState("failed");
    }
  }

  if (state === "sent")
    return (
      <div role="status" className="card stack" style={{ ["--gap" as string]: "10px" }}>
        <span className="done-ic">
          <Icon name="check" size={26} />
        </span>
        <h3 className="h2" style={{ margin: 0 }}>Thanks, {values.name.split(" ")[0]}! Message received.</h3>
        <p className="muted" style={{ margin: 0 }}>
          {emailed ? `We've sent a confirmation to ${values.email}. We'll reply within 1–2 working days.` : "We'll reply within 1–2 working days."}
        </p>
      </div>
    );

  const field = (id: "name" | "email", label: string, type: string, autoComplete: string) => (
    <div className="field">
      <label htmlFor={`contact-${id}`} className="label">{label}</label>
      <input
        id={`contact-${id}`}
        type={type}
        autoComplete={autoComplete}
        className="input"
        value={values[id]}
        onChange={(e) => set(id, e.target.value)}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={errors[id] ? `contact-${id}-error` : undefined}
        required
      />
      {errors[id] && <p id={`contact-${id}-error`} className="error" style={{ margin: "6px 0 0" }}>{errors[id]}</p>}
    </div>
  );

  return (
    <form className="card stack" style={{ ["--gap" as string]: "16px" }} onSubmit={submit} noValidate>
      <div className="grid grid-2" style={{ gap: 16 }}>
        {field("name", "Your name", "text", "name")}
        {field("email", "Email", "email", "email")}
      </div>
      <div className="field">
        <label htmlFor="contact-message" className="label">Your question or message</label>
        <textarea
          id="contact-message"
          rows={4}
          maxLength={2000}
          className="textarea"
          value={values.message}
          onChange={(e) => set("message", e.target.value)}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? "contact-message-error" : undefined}
          required
        />
        {errors.message && <p id="contact-message-error" className="error" style={{ margin: "6px 0 0" }}>{errors.message}</p>}
      </div>
      {/* Hidden from people; bots that fill it are ignored. */}
      <div aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" tabIndex={-1} autoComplete="off" value={values.website} onChange={(e) => set("website", e.target.value)} />
      </div>
      {state === "failed" && (
        <p role="alert" className="notice notice-warn" style={{ margin: 0 }}>
          <Icon name="info" size={16} />
          <span>Sorry, your message could not be sent. Please try again in a minute.</span>
        </p>
      )}
      <div className="row between wrap">
        <span className="small muted">We use your email only to reply to you.</span>
        <button type="submit" className="btn btn-primary" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
