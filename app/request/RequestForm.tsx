"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { fill, getDict, translateMessage } from "@/lib/i18n";
import type { LanguageCode } from "@/lib/language";
import { PUNE_AREAS, TRADES, localToday } from "@/lib/registration";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  REQUEST_CONSENT_TEXT,
  emptyRequest,
  validateRequest,
  type RequestErrors,
  type RequestValues,
} from "@/lib/request";
import LanguageSelector from "../LanguageSelector";
import { useLanguage } from "../useLanguage";

const fieldClass =
  "mt-1 block w-full rounded-md border border-zinc-400 bg-white px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-500 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/40 aria-[invalid=true]:border-red-700";
const labelClass = "block text-sm font-medium text-zinc-900";
const hintClass = "mt-1 text-sm text-zinc-600";
const buttonClass =
  "w-full rounded-md bg-blue-800 px-4 py-3 text-base font-semibold text-white hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:opacity-60 sm:w-auto";

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm font-medium text-red-700">
      {message}
    </p>
  );
}

type Stage = "describe" | "reading" | "review" | "saving" | "saved";
type NoticeKey = "" | "manual" | "readFailed" | "ai";

// The whole developer request screen: heading, notice, language choice and
// form. Underneath, every value the server checks (trade names, locality
// spellings) is unchanged; only what the person SEES is translated. The text
// they type is sent and stored exactly as written, in whatever language.
export default function RequestForm({ initialLanguage }: { initialLanguage?: LanguageCode }) {
  const [language, setLanguage] = useLanguage(initialLanguage);
  const d = getDict(language);
  const [values, setValues] = useState<RequestValues>(emptyRequest);
  const [errors, setErrors] = useState<RequestErrors>({});
  const [stage, setStage] = useState<Stage>("describe");
  const [questions, setQuestions] = useState<string[]>([]);
  // Kept as a key (not text) so the notice changes language with the selector.
  const [notice, setNotice] = useState<NoticeKey>("");
  const [failed, setFailed] = useState(false);
  const [savedAsTest, setSavedAsTest] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const msg = (key: keyof RequestErrors) => translateMessage(language, errors[key]);
  const noticeText =
    notice === "manual"
      ? d.request.noticeManual
      : notice === "readFailed"
        ? d.request.noticeReadFailed
        : notice === "ai"
          ? d.request.noticeAi
          : "";

  function focusFirstError() {
    setTimeout(() => {
      formRef.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    }, 0);
  }

  function update<K extends keyof RequestValues>(
    key: K,
    value: RequestValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setFailed(false);
  }

  // Step 1: ask the server to read the description. The server decides whether
  // Gemini may be used (only for the founder's synthetic tests).
  async function readDescription(event: React.FormEvent) {
    event.preventDefault();
    if (stage === "reading") return;
    const text = values.description.trim();
    if (text.length < DESCRIPTION_MIN || text.length > DESCRIPTION_MAX) {
      setErrors({
        description: `Please describe the situation in ${DESCRIPTION_MIN} to ${DESCRIPTION_MAX} characters.`,
      });
      focusFirstError();
      return;
    }

    setStage("reading");
    setFailed(false);
    try {
      const response = await fetch("/api/requests/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text }),
      });
      const result = await response.json().catch(() => ({}));

      if (response.ok && result.ok === true) {
        const f = result.fields;
        setValues((v) => ({
          ...v,
          trade: f.trade,
          area: f.area,
          startDate: f.startDate,
          durationDays: f.durationDays,
          notes: f.notes,
          source: "ai_assisted",
        }));
        setQuestions(result.questions);
        setNotice("ai");
      } else if (response.ok && result.error === "ai_not_used") {
        // Automatic reading is switched off for this request (the normal case).
        // Nothing was sent to the AI service.
        setValues((v) => ({ ...v, source: "manual" }));
        setQuestions([]);
        setNotice("manual");
      } else {
        // Reading failed (or is not set up). Let the person fill it in by hand.
        setValues((v) => ({ ...v, source: "manual" }));
        setQuestions([]);
        setNotice("readFailed");
      }
      setStage("review");
    } catch {
      setValues((v) => ({ ...v, source: "manual" }));
      setNotice("readFailed");
      setStage("review");
    }
  }

  // Step 2: save the details the person has checked.
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage === "saving") return;

    const found = validateRequest(values, localToday());
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError();
      return;
    }

    setStage("saving");
    try {
      const website = new FormData(event.currentTarget).get("website") ?? "";
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, website, preferredLanguage: language }),
      });
      const result = await response.json().catch(() => ({}));

      if (response.ok && result.ok === true) {
        setValues(emptyRequest);
        setSavedAsTest(result.recordType === "TEST");
        setTranslation(result.language?.saved ? (result.language.translation ?? null) : null);
        setStage("saved");
      } else if (result.error === "validation" && result.errors) {
        setErrors(result.errors);
        setStage("review");
        focusFirstError();
      } else {
        setFailed(true);
        setStage("review");
      }
    } catch {
      setFailed(true);
      setStage("review");
    }
  }

  function startOver() {
    setValues(emptyRequest);
    setErrors({});
    setQuestions([]);
    setNotice("");
    setFailed(false);
    setTranslation(null);
    setStage("describe");
  }

  const inReview = stage === "review" || stage === "saving";
  // Cleared errors are kept as undefined, so count only real messages.
  const errorCount = Object.values(errors).filter(Boolean).length;

  const header = (
    <>
      <Link href="/" className="text-sm text-blue-800 underline">
        {d.common.back}
      </Link>
      <p className="mt-6 text-sm font-medium text-zinc-600">{d.common.brand}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
        {d.request.title}
      </h1>
      <p className="mt-3 text-base leading-7 text-zinc-700">{d.request.intro}</p>
      <div
        role="note"
        className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
      >
        <strong>{d.request.noteTitle}</strong> {d.request.noteBody}
      </div>
      <LanguageSelector language={language} onChange={setLanguage} />
    </>
  );

  if (stage === "saved") {
    return (
      <div lang={language}>
        {header}
        <div className="mt-8 space-y-4">
          <div
            role="status"
            className="rounded-md border border-green-300 bg-green-50 p-4 text-sm font-medium text-green-900"
          >
            {d.request.saved}
            {savedAsTest && (
              <span className="mt-1 block font-normal">{d.request.testMode}</span>
            )}
            {translation === "pending" && (
              <span className="mt-1 block font-normal">{d.request.translationPending}</span>
            )}
            {translation === "failed" && (
              <span className="mt-1 block font-normal">{d.request.translationFailed}</span>
            )}
          </div>
          <button type="button" onClick={startOver} className={buttonClass}>
            {d.request.another}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div lang={language}>
      {header}
      <form
        ref={formRef}
        onSubmit={inReview ? save : readDescription}
        noValidate
        className="mt-8 space-y-6"
      >
        {errorCount > 0 && (
          <div
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900"
          >
            {errorCount === 1 ? d.common.fixOne : fill(d.common.fixMany, { n: errorCount })}
          </div>
        )}

        {failed && (
          <div
            role="alert"
            className="rounded-md border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-900"
          >
            {d.request.failedSave}
          </div>
        )}

        <div>
          <label htmlFor="description" className={labelClass}>
            {d.request.descriptionLabel} <span className="text-red-700">*</span>
          </label>
          <textarea
            id="description"
            rows={6}
            maxLength={DESCRIPTION_MAX}
            placeholder={d.request.descriptionPlaceholder}
            value={values.description}
            disabled={inReview}
            onChange={(e) => update("description", e.target.value)}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={
              errors.description ? "description-error" : "description-hint"
            }
            className={`${fieldClass} disabled:bg-zinc-100`}
          />
          <p id="description-hint" className={hintClass}>
            {fill(d.request.charCount, { n: values.description.length, max: DESCRIPTION_MAX })}
          </p>
          <FieldError id="description-error" message={msg("description")} />
        </div>

        {!inReview && (
          <button
            type="submit"
            disabled={stage === "reading"}
            className={buttonClass}
          >
            {stage === "reading" ? d.request.pleaseWait : d.request.continue}
          </button>
        )}

        {inReview && (
          <>
            <button
              type="button"
              onClick={startOver}
              className="py-2 text-sm text-blue-800 underline"
            >
              {d.request.editAgain}
            </button>

            <div
              role="note"
              className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"
            >
              {noticeText}
            </div>

            {questions.length > 0 && (
              <div className="rounded-md border border-zinc-300 p-4 text-sm">
                <p className="font-medium">{d.request.moreDetail}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-800">
                  {questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <label htmlFor="trade" className={labelClass}>
                {d.request.tradeLabel} <span className="text-red-700">*</span>
              </label>
              <select
                id="trade"
                value={values.trade}
                onChange={(e) => update("trade", e.target.value)}
                aria-invalid={errors.trade ? true : undefined}
                aria-describedby={errors.trade ? "trade-error" : undefined}
                className={fieldClass}
              >
                <option value="">{d.request.tradePlaceholder}</option>
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
                {d.request.areaLabel} <span className="text-red-700">*</span>
              </label>
              <input
                id="area"
                type="text"
                list="pune-areas"
                placeholder={d.request.areaPlaceholder}
                value={values.area}
                onChange={(e) => update("area", e.target.value)}
                aria-invalid={errors.area ? true : undefined}
                aria-describedby={errors.area ? "area-error" : undefined}
                className={fieldClass}
              />
              <datalist id="pune-areas">
                {PUNE_AREAS.map((a) => (
                  <option key={a} value={a} label={d.areas[a]} />
                ))}
              </datalist>
              <FieldError id="area-error" message={msg("area")} />
            </div>

            <div>
              <label htmlFor="startDate" className={labelClass}>
                {d.request.startLabel}{" "}
                <span className="font-normal text-zinc-600">{d.common.optional}</span>
              </label>
              <input
                id="startDate"
                type="date"
                min={localToday()}
                suppressHydrationWarning
                value={values.startDate}
                onChange={(e) => update("startDate", e.target.value)}
                aria-invalid={errors.startDate ? true : undefined}
                aria-describedby={errors.startDate ? "startDate-error" : undefined}
                className={fieldClass}
              />
              <FieldError id="startDate-error" message={msg("startDate")} />
            </div>

            <div>
              <label htmlFor="durationDays" className={labelClass}>
                {d.request.durationLabel}{" "}
                <span className="font-normal text-zinc-600">{d.common.optional}</span>
              </label>
              <input
                id="durationDays"
                type="number"
                inputMode="numeric"
                min={1}
                max={730}
                placeholder={d.request.durationPlaceholder}
                value={values.durationDays ?? ""}
                onChange={(e) =>
                  update(
                    "durationDays",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
                aria-invalid={errors.durationDays ? true : undefined}
                aria-describedby={
                  errors.durationDays ? "durationDays-error" : undefined
                }
                className={fieldClass}
              />
              <FieldError id="durationDays-error" message={msg("durationDays")} />
            </div>

            <div>
              <label htmlFor="notes" className={labelClass}>
                {d.request.notesLabel}{" "}
                <span className="font-normal text-zinc-600">{d.common.optional}</span>
              </label>
              <textarea
                id="notes"
                rows={3}
                maxLength={500}
                value={values.notes}
                onChange={(e) => update("notes", e.target.value)}
                aria-invalid={errors.notes ? true : undefined}
                aria-describedby={errors.notes ? "notes-error" : undefined}
                className={fieldClass}
              />
              <FieldError id="notes-error" message={msg("notes")} />
            </div>

            <div>
              <label htmlFor="name" className={labelClass}>
                {d.request.nameLabel}{" "}
                <span className="font-normal text-zinc-600">{d.common.optional}</span>
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={values.name}
                onChange={(e) => update("name", e.target.value)}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "name-error" : undefined}
                className={fieldClass}
              />
              <FieldError id="name-error" message={msg("name")} />
            </div>

            <div>
              <label htmlFor="phone" className={labelClass}>
                {d.request.phoneLabel} <span className="text-red-700">*</span>
              </label>
              <input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder={d.request.phonePlaceholder}
                value={values.phone}
                onChange={(e) => update("phone", e.target.value)}
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={errors.phone ? "phone-error" : "phone-hint"}
                className={fieldClass}
              />
              {!errors.phone && (
                <p id="phone-hint" className={hintClass}>
                  {d.request.phoneHint}
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
                  {d.consent.request} <span className="text-red-700">*</span>
                </span>
              </label>
              {language !== "en" && (
                <p lang="en" className="mt-2 text-xs leading-5 text-zinc-600">
                  <span lang={language}>{d.common.consentRecordedLabel}</span> {REQUEST_CONSENT_TEXT}
                </p>
              )}
              <FieldError id="consent-error" message={msg("consent")} />
            </div>

            {/* Hidden trap for automated spam. Real people never see it. */}
            <div aria-hidden="true" className="absolute -left-[9999px]">
              <label>
                Website
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={stage === "saving"}
              className={buttonClass}
            >
              {stage === "saving" ? d.request.saving : d.request.save}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
