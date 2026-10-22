"use client";

import Link from "next/link";
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
import { useLanguage } from "../useLanguage";

const fieldClass =
  "mt-1 block w-full rounded-md border border-zinc-400 bg-white px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-500 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/40 aria-[invalid=true]:border-red-700";
const labelClass = "block text-sm font-medium text-zinc-900";
const hintClass = "mt-1 text-sm text-zinc-600";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm font-medium text-red-700">
      {message}
    </p>
  );
}

// The whole contractor registration screen: heading, notice, language choice
// and form. Underneath, every value the server checks (trade names, locality
// spellings, availability codes) is unchanged; only what the person SEES is
// translated.
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
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
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

  return (
    <div lang={language}>
      <Link href="/" className="text-sm text-blue-800 underline">
        {d.common.back}
      </Link>
      <p className="mt-6 text-sm font-medium text-zinc-600">{d.common.brand}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
        {d.register.title}
      </h1>
      <p className="mt-3 text-base leading-7 text-zinc-700">{d.register.intro}</p>

      <div
        role="note"
        className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
      >
        <strong>{d.register.noteTitle}</strong> {d.register.noteBody}
      </div>

      <LanguageSelector language={language} onChange={setLanguage} />

      {status === "saved" ? (
        <div ref={doneRef} className="mt-8 scroll-mt-24 space-y-4">
          <div role="status" className="rounded-[20px] bg-[var(--ok-bg)] p-5 text-base font-medium text-[var(--ok-ink)]">
            {d.register.success}
            {savedAsTest && <span className="mt-1 block text-sm font-normal">{d.register.testMode}</span>}
          </div>
          {telegramUrl && (
            <div className="rounded-[20px] border-2 border-[var(--ink)] p-5 text-sm">
              <p className="text-lg font-semibold">{d.register.telegramTitle}</p>
              <p className="mt-1 leading-6 text-zinc-700">{d.register.telegramBody}</p>
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--ink)] px-5 text-base font-semibold text-white sm:w-auto"
              >
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
            className="text-sm font-medium underline"
          >
            {d.register.registerAnother}
          </button>
        </div>
      ) : (
      <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-8 space-y-6">
        {errorCount > 0 && (
          <div
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900"
          >
            {errorCount === 1 ? d.common.fixOne : fill(d.common.fixMany, { n: errorCount })}
          </div>
        )}

        {status === "failed" && (
          <div
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-900"
          >
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

        <div>
          <label htmlFor="name" className={labelClass}>
            {d.register.nameLabel} <span className="text-red-700">*</span>
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            placeholder={d.register.namePlaceholder}
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "name-error" : undefined}
            className={fieldClass}
          />
          <FieldError id="name-error" message={msg("name")} />
        </div>

        <div>
          <label htmlFor="trade" className={labelClass}>
            {d.register.tradeLabel} <span className="text-red-700">*</span>
          </label>
          <select
            id="trade"
            value={values.trade}
            onChange={(e) => update("trade", e.target.value)}
            aria-invalid={errors.trade ? true : undefined}
            aria-describedby={errors.trade ? "trade-error" : undefined}
            className={fieldClass}
          >
            <option value="">{d.register.tradePlaceholder}</option>
            {TRADES.map((t) => (
              <option key={t} value={t}>
                {d.trades[t]}
              </option>
            ))}
          </select>
          <FieldError id="trade-error" message={msg("trade")} />
        </div>

        <div>
          <label htmlFor="area" className={labelClass}>
            {d.register.areaLabel} <span className="text-red-700">*</span>
          </label>
          <select
            id="area"
            value={values.area}
            onChange={(e) => update("area", e.target.value)}
            aria-invalid={errors.area ? true : undefined}
            aria-describedby={errors.area ? "area-error" : undefined}
            className={fieldClass}
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
          <div>
            <label htmlFor="otherArea" className={labelClass}>
              {d.register.otherAreaLabel} <span className="text-red-700">*</span>
            </label>
            <input
              id="otherArea"
              type="text"
              placeholder={d.register.otherAreaPlaceholder}
              value={values.otherArea}
              onChange={(e) => update("otherArea", e.target.value)}
              aria-invalid={errors.otherArea ? true : undefined}
              aria-describedby={errors.otherArea ? "otherArea-error" : undefined}
              className={fieldClass}
            />
            <FieldError id="otherArea-error" message={msg("otherArea")} />
          </div>
        )}

        <fieldset>
          <legend className={labelClass}>
            {d.register.availabilityLabel} <span className="text-red-700">*</span>
          </legend>
          <div
            className="mt-2 space-y-2"
            role="radiogroup"
            aria-invalid={errors.availability ? true : undefined}
            aria-describedby={errors.availability ? "availability-error" : undefined}
          >
            {AVAILABILITY_OPTIONS.map((o) => (
              <label
                key={o.value}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-zinc-300 px-3 py-3 text-base has-[:checked]:border-blue-700 has-[:checked]:bg-blue-50"
              >
                <input
                  type="radio"
                  name="availability"
                  value={o.value}
                  checked={values.availability === o.value}
                  onChange={() => update("availability", o.value)}
                  className="h-4 w-4 accent-blue-800"
                />
                {d.availability[o.value]}
              </label>
            ))}
          </div>
          <FieldError id="availability-error" message={msg("availability")} />
        </fieldset>

        {values.availability === "from_date" && (
          <div>
            <label htmlFor="availabilityDate" className={labelClass}>
              {d.register.availableFrom} <span className="text-red-700">*</span>
            </label>
            <input
              id="availabilityDate"
              type="date"
              min={localToday()}
              suppressHydrationWarning
              value={values.availabilityDate}
              onChange={(e) => update("availabilityDate", e.target.value)}
              aria-invalid={errors.availabilityDate ? true : undefined}
              aria-describedby={
                errors.availabilityDate ? "availabilityDate-error" : undefined
              }
              className={fieldClass}
            />
            <FieldError
              id="availabilityDate-error"
              message={msg("availabilityDate")}
            />
          </div>
        )}

        <div>
          <label htmlFor="phone" className={labelClass}>
            {d.register.phoneLabel} <span className="text-red-700">*</span>
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={d.register.phonePlaceholder}
            value={values.phone}
            onChange={(e) => update("phone", e.target.value)}
            aria-invalid={errors.phone ? true : undefined}
            aria-describedby={errors.phone ? "phone-error" : "phone-hint"}
            className={fieldClass}
          />
          {!errors.phone && (
            <p id="phone-hint" className={hintClass}>
              {d.register.phoneHint}
            </p>
          )}
          <FieldError id="phone-error" message={msg("phone")} />
        </div>

        <div>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-300 p-3 text-sm leading-6">
            <input
              id="consent"
              type="checkbox"
              checked={values.consent}
              onChange={(e) => update("consent", e.target.checked)}
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby={errors.consent ? "consent-error" : undefined}
              className="mt-1 h-4 w-4 shrink-0 accent-blue-800"
            />
            <span>
              {/* The person reads the consent in their own language. The
                  English wording below is what is recorded with the consent. */}
              {d.consent.contractor} <span className="text-red-700">*</span>
            </span>
          </label>
          {language !== "en" && (
            <p lang="en" className="mt-2 text-xs leading-5 text-zinc-600">
              <span lang={language}>{d.common.consentRecordedLabel}</span> {CONSENT_TEXT}
            </p>
          )}
          <FieldError id="consent-error" message={msg("consent")} />
        </div>

        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full rounded-md bg-blue-800 px-4 py-3 text-base font-semibold text-white hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:opacity-60 sm:w-auto"
        >
          {status === "sending" ? d.register.submitting : d.register.submit}
        </button>
      </form>
      )}
    </div>
  );
}
