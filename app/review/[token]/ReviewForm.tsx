"use client";

import { useState } from "react";
import { fill, getDict, translateMessage } from "@/lib/i18n";
import type { LanguageCode } from "@/lib/language";
import { COMMENT_MAX, validateReview, type ReviewErrors } from "@/lib/review";
import LanguageSelector from "../../LanguageSelector";
import { useLanguage } from "../../useLanguage";
import { submitReviewAction } from "./actions";

export type ReviewJobInfo = {
  trade: string;
  area: string;
  startDate: string;
  completionDate: string;
  preferredLanguage: LanguageCode;
};

type Score = number | null;
type Status = "idle" | "sending" | "done" | "used" | "bad_link" | "failed";

const fieldClass =
  "mt-1 block w-full rounded-md border border-zinc-400 bg-white px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-500 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/40 aria-[invalid=true]:border-red-700";
const labelClass = "block text-sm font-medium text-zinc-900";

// "2026-10-21" -> "21-10-2026": digits only, so it reads the same in every language.
const dayMonthYear = (iso: string) => iso.split("-").reverse().join("-");

// Five large star buttons. A star is an ordinary button, so it works with a
// finger, a mouse and a keyboard, and a screen reader hears "3 out of 5".
function Stars({
  name,
  value,
  onChange,
  describedBy,
  invalid,
  starLabel,
}: {
  name: string;
  value: Score;
  onChange: (next: Score) => void;
  describedBy?: string;
  invalid?: boolean;
  starLabel: (n: number) => string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={`${name}-label`} aria-describedby={describedBy} aria-invalid={invalid || undefined} className="mt-2 flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value !== null && n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={starLabel(n)}
            onClick={() => onChange(n)}
            className={`flex h-12 w-12 items-center justify-center rounded-md border text-3xl leading-none focus:outline-none focus:ring-2 focus:ring-blue-700 ${
              on ? "border-amber-500 bg-amber-100 text-amber-600" : "border-zinc-300 bg-white text-zinc-400"
            }`}
          >
            <span aria-hidden="true">★</span>
          </button>
        );
      })}
    </div>
  );
}

// The review screen a developer reaches from a private link. It never shows the
// contractor's name or any phone number, and it cannot be pointed at another
// job: the link decides that on the server.
export default function ReviewForm({ token, info }: { token: string; info: ReviewJobInfo }) {
  const [language, setLanguage] = useLanguage(info.preferredLanguage);
  const d = getDict(language);
  const t = d.review;
  const [overall, setOverall] = useState<Score>(null);
  const [workmanship, setWorkmanship] = useState<Score>(null);
  const [punctuality, setPunctuality] = useState<Score>(null);
  const [communication, setCommunication] = useState<Score>(null);
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<ReviewErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [translation, setTranslation] = useState("");

  const say = (key: keyof ReviewErrors) => translateMessage(language, errors[key]);
  const starLabel = (n: number) => fill(t.starLabel, { n });
  const trade = (d.trades as Record<string, string>)[info.trade] ?? info.trade;
  const area = (d.areas as Record<string, string>)[info.area] ?? info.area;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (status === "sending") return;
    const input = { overall, workmanship, punctuality, communication, comment };
    const check = validateReview(input);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setStatus("sending");
    try {
      const result = await submitReviewAction(token, input, language);
      if (result.ok) {
        setTranslation(result.translation);
        setStatus("done");
      } else if (result.error === "validation") {
        setErrors(result.errors);
        setStatus("idle");
      } else if (result.error === "already_reviewed") {
        setStatus("used");
      } else if (result.error === "invalid_link" || result.error === "expired" || result.error === "unavailable") {
        setStatus("bad_link");
      } else {
        setStatus("failed");
      }
    } catch {
      setStatus("failed");
    }
  }

  const header = (
    <>
      <p className="text-sm font-medium text-zinc-600">{d.common.brand}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t.title}</h1>
      <p className="mt-3 text-base leading-7 text-zinc-700">{t.intro}</p>
      <div className="mt-6 rounded-md border border-zinc-300 bg-zinc-50 p-4 text-sm leading-6">
        <p className="font-semibold">{t.jobHeading}</p>
        <p className="mt-1">{fill(t.jobLine, { trade, area })}</p>
        {info.startDate && <p className="text-zinc-700">{fill(t.neededFrom, { date: dayMonthYear(info.startDate) })}</p>}
        <p className="text-zinc-700">
          {info.completionDate ? fill(t.completedOn, { date: dayMonthYear(info.completionDate) }) : t.completionUnknown}
        </p>
        <p className="mt-2 text-zinc-600">{t.contractorNote}</p>
      </div>
      <LanguageSelector language={language} onChange={setLanguage} />
    </>
  );

  if (status === "done" || status === "used" || status === "bad_link") {
    const message = status === "done" ? t.thanks : status === "used" ? t.alreadyDone : t.linkBad;
    return (
      <div lang={language}>
        {header}
        <div
          role="status"
          className={`mt-8 rounded-md border p-4 text-sm font-medium ${
            status === "bad_link" ? "border-red-300 bg-red-50 text-red-900" : "border-green-300 bg-green-50 text-green-900"
          }`}
        >
          {message}
          {status === "done" && translation === "pending" && (
            <span className="mt-1 block font-normal">{t.translationPending}</span>
          )}
        </div>
      </div>
    );
  }

  const errorCount = Object.values(errors).filter(Boolean).length;
  const criteria = [
    { key: "workmanship", label: t.workmanshipLabel, value: workmanship, set: setWorkmanship },
    { key: "punctuality", label: t.punctualityLabel, value: punctuality, set: setPunctuality },
    { key: "communication", label: t.communicationLabel, value: communication, set: setCommunication },
  ] as const;

  return (
    <div lang={language}>
      {header}
      <form onSubmit={submit} noValidate className="mt-8 space-y-6">
        {errorCount > 0 && (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900">
            {errorCount === 1 ? d.common.fixOne : fill(d.common.fixMany, { n: errorCount })}
          </div>
        )}
        {status === "failed" && (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-900">
            {t.failed}
          </div>
        )}

        <div>
          <p id="overall-label" className={labelClass}>
            {t.overallLabel} <span className="text-red-700">*</span>
          </p>
          <p className="text-sm text-zinc-600">{t.overallHelp}</p>
          <Stars name="overall" value={overall} onChange={setOverall} describedBy={errors.overall ? "overall-error" : undefined} invalid={Boolean(errors.overall)} starLabel={starLabel} />
          {errors.overall && (
            <p id="overall-error" className="mt-1 text-sm font-medium text-red-700">
              {say("overall")}
            </p>
          )}
        </div>

        {criteria.map((c) => (
          <div key={c.key}>
            <p id={`${c.key}-label`} className={labelClass}>
              {c.label} <span className="font-normal text-zinc-600">{d.common.optional}</span>
            </p>
            <Stars name={c.key} value={c.value} onChange={c.set} describedBy={errors[c.key] ? `${c.key}-error` : undefined} invalid={Boolean(errors[c.key])} starLabel={starLabel} />
            {c.value !== null && (
              <button type="button" onClick={() => c.set(null)} className="mt-1 py-1 text-sm text-blue-800 underline">
                {t.clearScore}
              </button>
            )}
            {errors[c.key] && (
              <p id={`${c.key}-error`} className="mt-1 text-sm font-medium text-red-700">
                {say(c.key)}
              </p>
            )}
          </div>
        ))}

        <div>
          <label htmlFor="comment" className={labelClass}>
            {t.commentLabel} <span className="font-normal text-zinc-600">{d.common.optional}</span>
          </label>
          <textarea
            id="comment"
            rows={4}
            maxLength={COMMENT_MAX}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            aria-invalid={errors.comment ? true : undefined}
            aria-describedby={errors.comment ? "comment-error" : "comment-help"}
            className={fieldClass}
          />
          <p id="comment-help" className="mt-1 text-sm text-zinc-600">
            {t.commentHelp} {fill(t.charCount, { n: comment.length, max: COMMENT_MAX })}
          </p>
          {errors.comment && (
            <p id="comment-error" className="mt-1 text-sm font-medium text-red-700">
              {say("comment")}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full rounded-md bg-blue-800 px-4 py-3 text-base font-semibold text-white hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:opacity-60 sm:w-auto"
        >
          {status === "sending" ? t.submitting : t.submit}
        </button>
      </form>
    </div>
  );
}
