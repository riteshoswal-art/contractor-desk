"use client";

import { useRef, useState } from "react";
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

export default function RegistrationForm() {
  const [values, setValues] = useState<FormValues>(emptyValues);
  const [errors, setErrors] = useState<FormErrors>({});
  // "saved" is set only after the server confirms the write.
  const [status, setStatus] = useState<"idle" | "sending" | "saved" | "failed">(
    "idle",
  );
  const [savedAsTest, setSavedAsTest] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

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
        body: JSON.stringify({ ...values, website }),
      });
      const result: {
        ok?: boolean;
        recordType?: string;
        error?: string;
        errors?: FormErrors;
      } = await response.json().catch(() => ({}));

      if (response.ok && result.ok === true) {
        setValues(emptyValues);
        setSavedAsTest(result.recordType === "TEST");
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
    <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-8 space-y-6">
      {errorCount > 0 && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          Please fix {errorCount === 1 ? "1 problem" : `${errorCount} problems`}{" "}
          below.
        </div>
      )}

      {status === "saved" && (
        <div
          role="status"
          className="rounded-md border border-green-300 bg-green-50 p-4 text-sm font-medium text-green-900"
        >
          Thank you. Your registration has been received and stored privately.
          {savedAsTest && (
            <span className="mt-1 block font-normal">
              Test mode: this was saved as a TEST record, not a real
              registration.
            </span>
          )}
        </div>
      )}

      {status === "failed" && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-900"
        >
          Sorry, we could not save your registration. Nothing was saved. Please
          try again later.
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
          Contractor name <span className="font-normal text-zinc-600">(optional)</span>
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          placeholder="e.g. Ramesh Patil"
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
          className={fieldClass}
        />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <div>
        <label htmlFor="trade" className={labelClass}>
          Primary trade <span className="text-red-700">*</span>
        </label>
        <select
          id="trade"
          value={values.trade}
          onChange={(e) => update("trade", e.target.value)}
          aria-invalid={errors.trade ? true : undefined}
          aria-describedby={errors.trade ? "trade-error" : undefined}
          className={fieldClass}
        >
          <option value="">Select your trade</option>
          {TRADES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <FieldError id="trade-error" message={errors.trade} />
      </div>

      <div>
        <label htmlFor="area" className={labelClass}>
          Service area <span className="text-red-700">*</span>
        </label>
        <select
          id="area"
          value={values.area}
          onChange={(e) => update("area", e.target.value)}
          aria-invalid={errors.area ? true : undefined}
          aria-describedby={errors.area ? "area-error" : undefined}
          className={fieldClass}
        >
          <option value="">Select an area in Pune</option>
          {PUNE_AREAS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
          <option value={OTHER_AREA}>Other (enter another Pune locality)</option>
        </select>
        <FieldError id="area-error" message={errors.area} />
      </div>

      {values.area === OTHER_AREA && (
        <div>
          <label htmlFor="otherArea" className={labelClass}>
            Other Pune locality <span className="text-red-700">*</span>
          </label>
          <input
            id="otherArea"
            type="text"
            placeholder="e.g. Wagholi"
            value={values.otherArea}
            onChange={(e) => update("otherArea", e.target.value)}
            aria-invalid={errors.otherArea ? true : undefined}
            aria-describedby={errors.otherArea ? "otherArea-error" : undefined}
            className={fieldClass}
          />
          <FieldError id="otherArea-error" message={errors.otherArea} />
        </div>
      )}

      <fieldset>
        <legend className={labelClass}>
          Availability <span className="text-red-700">*</span>
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
              {o.label}
            </label>
          ))}
        </div>
        <FieldError id="availability-error" message={errors.availability} />
      </fieldset>

      {values.availability === "from_date" && (
        <div>
          <label htmlFor="availabilityDate" className={labelClass}>
            Available from <span className="text-red-700">*</span>
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
            message={errors.availabilityDate}
          />
        </div>
      )}

      <div>
        <label htmlFor="phone" className={labelClass}>
          Mobile number <span className="text-red-700">*</span>
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="e.g. 98765 43210 or +91 98765 43210"
          value={values.phone}
          onChange={(e) => update("phone", e.target.value)}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={errors.phone ? "phone-error" : "phone-hint"}
          className={fieldClass}
        />
        {!errors.phone && (
          <p id="phone-hint" className={hintClass}>
            10-digit Indian mobile number. +91 is optional.
          </p>
        )}
        <FieldError id="phone-error" message={errors.phone} />
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
            {CONSENT_TEXT} <span className="text-red-700">*</span>
          </span>
        </label>
        <FieldError id="consent-error" message={errors.consent} />
      </div>

      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-md bg-blue-800 px-4 py-3 text-base font-semibold text-white hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:opacity-60 sm:w-auto"
      >
        {status === "sending" ? "Submitting…" : "Register"}
      </button>
    </form>
  );
}
