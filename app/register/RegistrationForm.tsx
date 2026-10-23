"use client";

import { useEffect, useRef, useState } from "react";
import { fill, getDict, translateMessage } from "@/lib/i18n";
import type { LanguageCode } from "@/lib/language";
import {
  AVAILABILITY_OPTIONS,
  CONSENT_TEXT,
  OTHER_AREA,
  PUNE_AREAS,
  TRADES,
  emptyValues,
  localToday,
  validate,
  type FormErrors,
  type FormValues,
} from "@/lib/registration";
import LanguageSelector from "../LanguageSelector";
import { Icon, Logo } from "../ui";
import { useLanguage } from "../useLanguage";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="error">
      {message}
    </p>
  );
}

// "*" after the label of a required field (the input itself carries aria-required).
const Req = () => <span className="req">*</span>;

// The contractor registration screen (the "phone screen" of the Concept B
// device stage): small logo and language switch, heading, form. Underneath,
// every value the server checks (trade names, locality spellings, availability
// codes) is unchanged; only what the person SEES is translated.
export default function RegistrationForm({ initialLanguage }: { initialLanguage?: LanguageCode }) {
  const [language, setLanguage] = useLanguage(initialLanguage);
  const d = getDict(language);
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [errors, setErrors] = useState<FormErrors>({});
  // "saved" is set only after the server confirms the write.
  const [status, setStatus] = useState<"idle" | "sending" | "saved" | "failed">(
    "idle",
  );
  const [savedAsTest, setSavedAsTest] = useState(false);
  // Live demo only: a one-time link to connect this contractor's own Telegram.
  const [telegramUrl, setTelegramUrl] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  // The form is replaced by the success panel: bring it into view on a phone.
  useEffect(() => {
    if (status === "saved") doneRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [status]);

  // Validators answer in English; show the person's own language.
  const msg = (key: keyof FormErrors) => translateMessage(language, errors[key]);

  function focusFirstError() {
    // Wait for React to render the error state first.
    setTimeout(() => {
      const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]');
      if (!el) return;
      // A group of tap buttons (trade, availability): focus its first button.
      if (el.matches("input, select, textarea")) el.focus();
      else (el.querySelector<HTMLElement>("button") ?? el).focus();
    }, 0);
  }

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    if (status !== "sending") setStatus("idle");
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;

    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setStatus("idle");
      focusFirstError();
      return;
    }

    setStatus("sending");
    try {
      const website = new FormData(event.currentTarget).get("website") ?? "";
      const response = await fetch("/api/contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, website, preferredLanguage: language }),
      });
      const result: {
        ok?: boolean;
        recordType?: string;
        localMode?: boolean;
        error?: string;
        errors?: FormErrors;
        telegramConnectUrl?: string;
      } = await response.json().catch(() => ({}));

      if (response.ok && result.ok === true) {
        setValues(emptyValues);
        // The local data mode keeps everything on this computer; it does not
        // need a "test record" warning on the contractor's screen.
        setSavedAsTest(result.recordType === "TEST" && !result.localMode);
        // Only a well-formed t.me link from our own server is shown.
        const url = result.telegramConnectUrl ?? "";
        setTelegramUrl(/^https:\/\/t\.me\/[A-Za-z0-9_]{5,32}\?start=[A-Za-z0-9_-]{24}$/.test(url) ? url : "");
        setStatus("saved");
      } else if (result.error === "validation" && result.errors) {
        // The server found a problem the browser did not.
        setErrors(result.errors);
        setStatus("idle");
        focusFirstError();
      } else {
        setStatus("failed");
      }
    } catch {
      // Network problem: we cannot know whether anything was saved.
      setStatus("failed");
    }
  }

  // Cleared errors are kept as undefined, so count only real messages.
  const errorCount = Object.values(errors).filter(Boolean).length;
  const invalid = (key: keyof FormErrors) => (errors[key] ? true : undefined);
  const describedBy = (key: keyof FormErrors) => (errors[key] ? `${key}-error` : undefined);

  const topRow = (
    <div className="row between">
      <span className="brand-sm">
        <Logo />
        <span className="sr-only">{d.common.brand}</span>
      </span>
      <LanguageSelector language={language} onChange={setLanguage} variant="compact" />
    </div>
  );

  if (status === "saved") {
    return (
      <div lang={language}>
        <div className="stack" style={{ ["--gap" as string]: "16px" }}>
          {topRow}
          <div ref={doneRef} className="center-done stack scroll-mt-24" style={{ ["--gap" as string]: "14px" }}>
            <span className="done-ic">
              <Icon name="check" size={30} />
            </span>
            <h1 role="status" className="h1">
              {d.register.success}
            </h1>
            {savedAsTest && <p className="notice notice-warn small mb-0 text-left">{d.register.testMode}</p>}
            {telegramUrl && (
              <div className="card tint flat stack w-full text-left" style={{ ["--gap" as string]: "10px" }}>
                <p className="h2">{d.register.telegramTitle}</p>
                <p className="small muted mb-0 leading-normal">{d.register.telegramBody}</p>
                <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-block btn-lg">
                  <Icon name="send" size={18} />
                  {d.register.telegramButton}
                </a>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setTelegramUrl("");
              }}
              className="btn btn-ghost"
            >
              {d.register.registerAnother}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div lang={language}>
      <form ref={formRef} onSubmit={onSubmit} noValidate className="stack" style={{ ["--gap" as string]: "18px" }}>
        {topRow}
        <div>
          <h1 className="h1">{d.register.title}</h1>
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            {d.register.intro}
          </p>
        </div>

        {errorCount > 0 && (
          <div role="alert" className="notice small bg-red-50 text-red-900">
            {errorCount === 1 ? d.common.fixOne : fill(d.common.fixMany, { n: errorCount })}
          </div>
        )}

        {status === "failed" && (
          <div role="alert" className="notice small bg-red-50 font-semibold text-red-900">
            {d.register.failed}
          </div>
        )}

        {/* Hidden trap for automated spam. Real people never see or fill it. */}
        <div aria-hidden="true" className="absolute -left-[9999px]">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <div className="field">
          <label htmlFor="name" className="label">
            {d.register.nameLabel} <Req />
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            className="input"
            placeholder={d.register.namePlaceholder}
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            aria-required="true"
            aria-invalid={invalid("name")}
            aria-describedby={describedBy("name")}
          />
          <FieldError id="name-error" message={msg("name")} />
        </div>

        <div className="field">
          <p id="trade-label" className="label">
            {d.register.tradeLabel} <Req />
          </p>
          <div
            id="trade"
            role="group"
            className="row wrap"
            aria-labelledby="trade-label"
            data-invalid={invalid("trade")}
            aria-describedby={describedBy("trade")}
          >
            {TRADES.map((t) => (
              <button
                key={t}
                type="button"
                value={t}
                aria-pressed={values.trade === t}
                onClick={() => update("trade", t)}
                className={`chip min-h-10${values.trade === t ? " on" : ""}`}
              >
                {d.trades[t]}
              </button>
            ))}
          </div>
          <FieldError id="trade-error" message={msg("trade")} />
        </div>

        <div className="field">
          <label htmlFor="area" className="label">
            {d.register.areaLabel} <Req />
          </label>
          <select
            id="area"
            className="select"
            value={values.area}
            onChange={(e) => update("area", e.target.value)}
            aria-required="true"
            aria-invalid={invalid("area")}
            aria-describedby={describedBy("area")}
          >
            <option value="">{d.register.areaPlaceholder}</option>
            {PUNE_AREAS.map((a) => (
              <option key={a} value={a}>
                {d.areas[a]}
              </option>
            ))}
            <option value={OTHER_AREA}>{d.areas.Other}</option>
          </select>
          <FieldError id="area-error" message={msg("area")} />
        </div>

        {values.area === OTHER_AREA && (
          <div className="field">
            <label htmlFor="otherArea" className="label">
              {d.register.otherAreaLabel} <Req />
            </label>
            <input
              id="otherArea"
              type="text"
              className="input"
              placeholder={d.register.otherAreaPlaceholder}
              value={values.otherArea}
              onChange={(e) => update("otherArea", e.target.value)}
              aria-required="true"
              aria-invalid={invalid("otherArea")}
              aria-describedby={describedBy("otherArea")}
            />
            <FieldError id="otherArea-error" message={msg("otherArea")} />
          </div>
        )}

        <div className="field">
          <p id="availability-label" className="label">
            {d.register.availabilityLabel} <Req />
          </p>
          <div
            role="group"
            className="row wrap"
            style={{ gap: 8 }}
            aria-labelledby="availability-label"
            data-invalid={invalid("availability")}
            aria-describedby={describedBy("availability")}
          >
            {AVAILABILITY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                value={o.value}
                aria-pressed={values.availability === o.value}
                onClick={() => update("availability", o.value)}
                className={`chip${values.availability === o.value ? " on" : ""}`}
              >
                {d.availability[o.value]}
              </button>
            ))}
          </div>
          <FieldError id="availability-error" message={msg("availability")} />

          {values.availability === "from_date" && (
            <div className="mt-2.5">
              <label htmlFor="availabilityDate" className="label">
                {d.register.availableFrom} <Req />
              </label>
              <input
                id="availabilityDate"
                type="date"
                className="input"
                min={localToday()}
                suppressHydrationWarning
                value={values.availabilityDate}
                onChange={(e) => update("availabilityDate", e.target.value)}
                aria-required="true"
                aria-invalid={invalid("availabilityDate")}
                aria-describedby={describedBy("availabilityDate")}
              />
              <FieldError id="availabilityDate-error" message={msg("availabilityDate")} />
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="phone" className="label">
            {d.register.phoneLabel} <Req />
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="input"
            placeholder={d.register.phonePlaceholder}
            value={values.phone}
            onChange={(e) => update("phone", e.target.value)}
            aria-required="true"
            aria-invalid={invalid("phone")}
            aria-describedby={errors.phone ? "phone-error" : "phone-hint"}
          />
          {!errors.phone && (
            <p id="phone-hint" className="help">
              {d.register.phoneHint}
            </p>
          )}
          <FieldError id="phone-error" message={msg("phone")} />
        </div>

        <div>
          <label className="check">
            <input
              id="consent"
              type="checkbox"
              checked={values.consent}
              onChange={(e) => update("consent", e.target.checked)}
              aria-required="true"
              aria-invalid={invalid("consent")}
              aria-describedby={describedBy("consent")}
            />
            <span className="small">
              {/* The person reads the consent in their own language. The
                  English wording below is what is recorded with the consent. */}
              {d.consent.contractor} <Req />
            </span>
          </label>
          {language !== "en" && (
            <p lang="en" className="tiny muted mt-2 mb-0 pl-8 leading-normal">
              <span lang={language}>{d.common.consentRecordedLabel}</span> {CONSENT_TEXT}
            </p>
          )}
          <FieldError id="consent-error" message={msg("consent")} />
        </div>

        <p role="note" className="notice notice-muted small" style={{ margin: 0 }}>
          <span>
            <strong className="font-semibold text-[var(--ink)]">{d.register.noteTitle}</strong> {d.register.noteBody}
          </span>
        </p>

        <button type="submit" disabled={status === "sending"} className="btn btn-primary btn-block btn-lg">
          {status === "sending" ? d.register.submitting : d.register.submit}
        </button>
      </form>
    </div>
  );
}
