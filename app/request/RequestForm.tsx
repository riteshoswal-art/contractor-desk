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
import { Icon } from "../ui";
import { useLanguage } from "../useLanguage";
import { REQUEST_COPY } from "./copy";

// Concept B form pieces. The design classes live in app/concept-b.css; the few
// Tailwind utilities below only add what the reference has no class for.
const invalidBorder = "aria-[invalid=true]:border-[var(--err-ink)]";
const inputClass = `input ${invalidBorder}`;
const textareaClass = `textarea ${invalidBorder}`;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="error" style={{ margin: "6px 0 0" }}>
      {message}
    </p>
  );
}

type Stage = "describe" | "reading" | "review" | "saving" | "saved";
type NoticeKey = "" | "manual" | "readFailed" | "ai";
type ReviewStep = 2 | 3;

// Which fields belong to which of the three visual steps.
const DETAIL_FIELDS = ["trade", "area", "startDate", "durationDays", "notes"] as const;

const DATE_LOCALE: Record<LanguageCode, string> = {
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN-u-nu-latn",
};

// "2026-10-27" -> "27 Oct 2026" in the chosen language. Built from the parts so
// the time zone cannot move the day.
function longDate(iso: string, language: LanguageCode): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(DATE_LOCALE[language], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// The whole developer request screen: a three-step form card (describe,
// details, contact) and a summary that fills in as the person types.
// Underneath, every value the server checks (trade names, locality spellings)
// is unchanged; only what the person SEES is translated. The text they type is
// sent and stored exactly as written, in whatever language.
export default function RequestForm({
  initialLanguage,
  prefill,
}: {
  initialLanguage?: LanguageCode;
  prefill?: Partial<Pick<RequestValues, "trade" | "area" | "startDate">>;
}) {
  const [language, setLanguage] = useLanguage(initialLanguage);
  const d = getDict(language);
  const c = REQUEST_COPY[language];
  const [values, setValues] = useState<RequestValues>(() => ({ ...emptyRequest, ...prefill }));
  const [errors, setErrors] = useState<RequestErrors>({});
  const [stage, setStage] = useState<Stage>("describe");
  const [reviewStep, setReviewStep] = useState<ReviewStep>(2);
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
      const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      // A group (the trade choices) is not focusable itself: focus its first option.
      const target = el?.matches("input, select, textarea") ? el : el?.querySelector<HTMLElement>("input");
      target?.focus();
    }, 0);
  }

  // After moving between steps, bring the new step into view and give its
  // heading focus so screen readers announce where the person now is.
  function focusHeading() {
    setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      if (form.getBoundingClientRect().top < 0) form.scrollIntoView({ block: "start" });
      form.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
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
  async function readDescription() {
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
    setErrors({});
    setReviewStep(2);
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
    focusHeading();
  }

  // Step 2 -> 3: check only the job details, with the validator's own messages.
  function continueToContact() {
    const found = validateRequest(values, localToday());
    const stepErrors: RequestErrors = {};
    for (const key of DETAIL_FIELDS) if (found[key]) stepErrors[key] = found[key];
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) {
      focusFirstError();
      return;
    }
    setReviewStep(3);
    focusHeading();
  }

  // Shows the first step that has a problem, so the person can see and fix it.
  function showErrors(found: RequestErrors) {
    if (found.description) {
      setStage("describe");
    } else {
      setStage("review");
      setReviewStep(DETAIL_FIELDS.some((k) => found[k]) ? 2 : 3);
    }
    focusFirstError();
  }

  // Final step: save the details the person has checked.
  async function save(form: HTMLFormElement) {
    if (stage === "saving") return;

    const found = validateRequest(values, localToday());
    setErrors(found);
    if (Object.keys(found).length > 0) {
      showErrors(found);
      return;
    }

    setStage("saving");
    try {
      const website = new FormData(form).get("website") ?? "";
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, website, preferredLanguage: language }),
      });
      const result = await response.json().catch(() => ({}));

      if (response.ok && result.ok === true) {
        setValues(emptyRequest);
        // The local data mode needs no "test record" warning on screen.
        setSavedAsTest(result.recordType === "TEST" && !result.localMode);
        setTranslation(result.language?.saved ? (result.language.translation ?? null) : null);
        setStage("saved");
      } else if (result.error === "validation" && result.errors) {
        setErrors(result.errors);
        showErrors(result.errors);
      } else {
        setFailed(true);
        setStage("review");
      }
    } catch {
      setFailed(true);
      setStage("review");
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage === "describe" || stage === "reading") void readDescription();
    else if (reviewStep === 2) continueToContact();
    else void save(event.currentTarget);
  }

  function goBack() {
    setErrors({});
    setFailed(false);
    if (reviewStep === 3) setReviewStep(2);
    else setStage("describe");
    focusHeading();
  }

  function startOver() {
    setValues(emptyRequest);
    setErrors({});
    setQuestions([]);
    setNotice("");
    setFailed(false);
    setTranslation(null);
    setReviewStep(2);
    setStage("describe");
  }

  const inReview = stage === "review" || stage === "saving";
  const step = inReview ? reviewStep : 1;
  // Cleared errors are kept as undefined, so count only real messages.
  const errorCount = Object.values(errors).filter(Boolean).length;

  const tradeShown = (TRADES as readonly string[]).includes(values.trade)
    ? d.trades[values.trade as keyof typeof d.trades]
    : "";
  const areaShown = (PUNE_AREAS as readonly string[]).includes(values.area) && values.area !== "Other"
    ? d.areas[values.area as keyof typeof d.areas]
    : values.area.trim();
  const summaryRows: [string, string][] = [
    [d.request.tradeLabel, tradeShown || "—"],
    [d.request.areaLabel, areaShown || "—"],
    [d.request.startLabel, values.startDate ? longDate(values.startDate, language) : "—"],
    [
      d.request.durationLabel,
      values.durationDays && values.durationDays > 0
        ? fill(d.bid.duration, { days: values.durationDays })
        : "—",
    ],
  ];

  const summary = (
    <aside
      className="card tint stack summary min-[901px]:col-start-2 min-[901px]:row-start-1"
      style={{ ["--gap" as string]: "14px" }}
      aria-label={c.summary}
    >
      <h2 className="eyebrow" style={{ margin: 0, fontFamily: "var(--font-body)", letterSpacing: "0.04em" }}>{c.summary}</h2>
      {summaryRows.map(([k, v]) => (
        <div key={k} className="row between" style={{ alignItems: "baseline" }}>
          <span className="muted small">{k}</span>
          <span className="h3 text-right" style={{ flexShrink: 0, maxWidth: "60%", overflowWrap: "anywhere" }}>{v}</span>
        </div>
      ))}
      <hr className="divider" />
      <div className="stack small" style={{ ["--gap" as string]: "10px" }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <Icon name="lock" size={16} className="mt-0.5" />
          <span>{d.request.phoneHint}</span>
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <Icon name="info" size={16} className="mt-0.5" />
          <span>
            <strong>{d.request.noteTitle}</strong> {d.request.noteBody}
          </span>
        </div>
      </div>
    </aside>
  );

  const languageCard = (
    <div className="card min-[901px]:col-start-2 min-[901px]:row-start-2 [&>div]:mt-0">
      <LanguageSelector language={language} onChange={setLanguage} />
    </div>
  );

  if (stage === "saved") {
    return (
      <div lang={language}>
        <div className="mx-auto w-full max-w-[720px]">
          <div className="card done-card stack" style={{ ["--gap" as string]: "18px" }}>
            <span className="done-ic">
              <Icon name="check" size={30} />
            </span>
            <div role="status" className="stack" style={{ ["--gap" as string]: "12px" }}>
              <p className="h2">{d.request.saved}</p>
              {savedAsTest && <p className="notice notice-warn" style={{ margin: 0 }}>{d.request.testMode}</p>}
              {translation === "pending" && (
                <p className="notice notice-muted" style={{ margin: 0 }}>{d.request.translationPending}</p>
              )}
              {translation === "failed" && (
                <p className="notice notice-muted" style={{ margin: 0 }}>{d.request.translationFailed}</p>
              )}
            </div>
            <div className="row wrap">
              <button type="button" onClick={startOver} className="btn btn-primary btn-lg">
                {d.request.another}
              </button>
              <Link href="/" className="btn btn-ghost btn-lg">
                {d.common.back}
              </Link>
            </div>
          </div>
          <div className="card mt-5 [&>div]:mt-0">
            <LanguageSelector language={language} onChange={setLanguage} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div lang={language}>
      <div className="form-layout min-[901px]:grid-rows-[auto_1fr]">
        <form
          ref={formRef}
          onSubmit={onSubmit}
          noValidate
          className="card form-card stack scroll-mt-24 min-[901px]:col-start-1 min-[901px]:row-span-2 min-[901px]:row-start-1"
          style={{ ["--gap" as string]: "24px" }}
        >
          <div
            className="stepper"
            role="group"
            aria-label={fill(c.stepOf, { n: step })}
          >
            {c.steps.map((name, i) => (
              <div
                key={i}
                className={`step ${i + 1 < step ? "done" : i + 1 === step ? "now" : ""}`}
                aria-current={i + 1 === step ? "step" : undefined}
              >
                <div className="bar">
                  <i />
                </div>
                <div className="cap">
                  {i + 1}. {name}
                </div>
              </div>
            ))}
          </div>

          {(errorCount > 0 || failed) && (
            <div className="stack" style={{ ["--gap" as string]: "10px" }}>
              {errorCount > 0 && (
                <div role="alert" className="notice notice-warn">
                  <Icon name="info" size={16} className="mt-0.5" />
                  <span>{errorCount === 1 ? d.common.fixOne : fill(d.common.fixMany, { n: errorCount })}</span>
                </div>
              )}
              {failed && (
                <div role="alert" className="notice notice-warn">
                  <Icon name="info" size={16} className="mt-0.5" />
                  <span>{d.request.failedSave}</span>
                </div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="stack" style={{ ["--gap" as string]: "18px" }}>
              <div>
                <p className="eyebrow" style={{ margin: "0 0 8px" }}>{d.request.title}</p>
                <h1 className="h1 outline-none" tabIndex={-1}>
                  <label htmlFor="description">{d.request.descriptionLabel}</label>
                </h1>
                <p className="muted" style={{ margin: "6px 0 0" }}>{d.request.intro}</p>
              </div>
              <div>
                <textarea
                  id="description"
                  rows={4}
                  maxLength={DESCRIPTION_MAX}
                  placeholder={d.request.descriptionPlaceholder}
                  value={values.description}
                  disabled={stage === "reading"}
                  onChange={(e) => update("description", e.target.value)}
                  aria-required="true"
                  aria-invalid={errors.description ? true : undefined}
                  aria-describedby={
                    errors.description ? "description-error description-hint" : "description-hint"
                  }
                  className={textareaClass}
                />
                <p id="description-hint" className="help" style={{ marginBottom: 0 }}>
                  {fill(d.request.charCount, { n: values.description.length, max: DESCRIPTION_MAX })}
                </p>
                <FieldError id="description-error" message={msg("description")} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="stack" style={{ ["--gap" as string]: "20px" }}>
              <div>
                <h1 className="h1 outline-none" tabIndex={-1}>{d.bid.jobHeading}</h1>
              </div>

              {noticeText && (
                <div role="note" className="notice notice-info">
                  <Icon name="info" size={16} className="mt-0.5" />
                  <span>{noticeText}</span>
                </div>
              )}

              {questions.length > 0 && (
                <div className="notice notice-warn" style={{ display: "block" }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{d.request.moreDetail}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {questions.map((q) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}

              <fieldset className="field" style={{ border: 0, padding: 0, marginInline: 0, marginBottom: 0, minWidth: 0 }}>
                <legend id="trade-legend" className="label">{d.request.tradeLabel}</legend>
                <div
                  role="radiogroup"
                  aria-labelledby="trade-legend"
                  aria-invalid={errors.trade ? true : undefined}
                  aria-describedby={errors.trade ? "trade-error" : undefined}
                  className="row wrap"
                  style={{ gap: 8 }}
                >
                  {TRADES.map((t) => (
                    <label
                      key={t}
                      className={`chip min-h-11 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus)] ${values.trade === t ? "on" : ""}`}
                    >
                      <input
                        type="radio"
                        name="trade"
                        value={t}
                        className="sr-only"
                        checked={values.trade === t}
                        onChange={() => update("trade", t)}
                      />
                      {d.trades[t]}
                    </label>
                  ))}
                </div>
                <FieldError id="trade-error" message={msg("trade")} />
              </fieldset>

              <div className="grid grid-2">
                <div className="field">
                  <label htmlFor="area" className="label">
                    {d.request.areaLabel}
                  </label>
                  <input
                    id="area"
                    type="text"
                    list="pune-areas"
                    placeholder={d.request.areaPlaceholder}
                    value={values.area}
                    onChange={(e) => update("area", e.target.value)}
                    aria-required="true"
                    aria-invalid={errors.area ? true : undefined}
                    aria-describedby={errors.area ? "area-error" : undefined}
                    className={inputClass}
                  />
                  <datalist id="pune-areas">
                    {PUNE_AREAS.map((a) => (
                      <option key={a} value={a} label={d.areas[a]} />
                    ))}
                  </datalist>
                  <FieldError id="area-error" message={msg("area")} />
                </div>

                <div className="field">
                  <label htmlFor="startDate" className="label">
                    {d.request.startLabel} <span className="opt">{d.common.optional}</span>
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
                    className={inputClass}
                  />
                  <FieldError id="startDate-error" message={msg("startDate")} />
                </div>
              </div>

              <div className="grid grid-2">
                <div className="field">
                  <label htmlFor="durationDays" className="label">
                    {d.request.durationLabel} <span className="opt">{d.common.optional}</span>
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
                    aria-describedby={errors.durationDays ? "durationDays-error" : undefined}
                    className={inputClass}
                  />
                  <FieldError id="durationDays-error" message={msg("durationDays")} />
                </div>

                <div className="field">
                  <label htmlFor="notes" className="label">
                    {d.request.notesLabel} <span className="opt">{d.common.optional}</span>
                  </label>
                  <textarea
                    id="notes"
                    rows={1}
                    maxLength={500}
                    value={values.notes}
                    onChange={(e) => update("notes", e.target.value)}
                    aria-invalid={errors.notes ? true : undefined}
                    aria-describedby={errors.notes ? "notes-error" : undefined}
                    className={textareaClass}
                    style={{ minHeight: 48 }}
                  />
                  <FieldError id="notes-error" message={msg("notes")} />
                </div>
              </div>

              <div>
                <button type="button" onClick={startOver} className="btn btn-quiet small" style={{ marginLeft: -8 }}>
                  {d.request.editAgain}
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="stack" style={{ ["--gap" as string]: "20px" }}>
              <div>
                <h1 className="h1 outline-none" tabIndex={-1}>{c.contactTitle}</h1>
              </div>

              <div className="grid grid-2">
                <div className="field">
                  <label htmlFor="name" className="label">
                    {d.request.nameLabel} <span className="opt">{d.common.optional}</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    autoComplete="name"
                    value={values.name}
                    onChange={(e) => update("name", e.target.value)}
                    aria-invalid={errors.name ? true : undefined}
                    aria-describedby={errors.name ? "name-error" : undefined}
                    className={inputClass}
                  />
                  <FieldError id="name-error" message={msg("name")} />
                </div>

                <div className="field">
                  <label htmlFor="phone" className="label">
                    {d.request.phoneLabel}
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder={d.request.phonePlaceholder}
                    value={values.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    aria-required="true"
                    aria-invalid={errors.phone ? true : undefined}
                    aria-describedby={errors.phone ? "phone-error" : "phone-hint"}
                    className={inputClass}
                  />
                  {!errors.phone && (
                    <p id="phone-hint" className="help" style={{ marginBottom: 0 }}>
                      {d.request.phoneHint}
                    </p>
                  )}
                  <FieldError id="phone-error" message={msg("phone")} />
                </div>
              </div>

              <div>
                <label className="check">
                  <input
                    id="consent"
                    type="checkbox"
                    checked={values.consent}
                    onChange={(e) => update("consent", e.target.checked)}
                    aria-required="true"
                    aria-invalid={errors.consent ? true : undefined}
                    aria-describedby={errors.consent ? "consent-error" : undefined}
                  />
                  {/* The person reads the consent in their own language. The
                      English wording below is what is recorded with the consent. */}
                  <span>{d.consent.request}</span>
                </label>
                {language !== "en" && (
                  <p lang="en" className="tiny muted" style={{ margin: "8px 0 0 32px", lineHeight: 1.5 }}>
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
            </div>
          )}

          <div className="row between form-nav wrap" style={{ rowGap: 8 }}>
            {step === 1 ? (
              <Link href="/" className="btn btn-quiet">
                {d.common.back}
              </Link>
            ) : (
              <button
                type="button"
                onClick={goBack}
                disabled={stage === "saving"}
                className="btn btn-ghost btn-lg"
              >
                <Icon name="back" size={16} /> {c.back}
              </button>
            )}
            <button
              type="submit"
              disabled={stage === "reading" || stage === "saving"}
              className="btn btn-primary btn-lg ml-auto"
            >
              {step === 1
                ? stage === "reading"
                  ? d.request.pleaseWait
                  : d.request.continue
                : step === 2
                  ? d.request.continue
                  : stage === "saving"
                    ? d.request.saving
                    : d.request.save}
              {stage !== "reading" && stage !== "saving" && <Icon name="arrow" size={16} />}
            </button>
          </div>
        </form>

        {summary}
        {languageCard}
      </div>
    </div>
  );
}
