"use client";

import { useState } from "react";
import { fill, getDict, translateMessage } from "@/lib/i18n";
import type { LanguageCode } from "@/lib/language";
import { COMMENT_MAX, validateReview, type ReviewErrors } from "@/lib/review";
import LanguageSelector from "../../LanguageSelector";
import { Icon, Logo } from "../../ui";
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

// "2026-10-21" -> "21-10-2026": digits only, so it reads the same in every language.
const dayMonthYear = (iso: string) => iso.split("-").reverse().join("-");

const Req = () => <span className="req">*</span>;

// Five star buttons (44px; 38px for the optional criteria). A star is an
// ordinary button, so it works with a finger, a mouse and a keyboard, and a
// screen reader hears "3 out of 5".
function Stars({
  name,
  value,
  onChange,
  describedBy,
  invalid,
  required,
  small,
  starLabel,
}: {
  name: string;
  value: Score;
  onChange: (next: Score) => void;
  describedBy?: string;
  invalid?: boolean;
  required?: boolean;
  small?: boolean;
  starLabel: (n: number) => string;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={`${name}-label`}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      aria-required={required || undefined}
      className={small ? "stars stars-sm" : "stars"}
    >
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
            className={on ? "star on" : "star"}
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

  const topRow = (
    <div className="row between">
      <span className="brand-sm">
        <Logo />
        <span className="sr-only">{d.common.brand}</span>
      </span>
      <LanguageSelector language={language} onChange={setLanguage} variant="compact" />
    </div>
  );

  const job = (
    <div className="card tint flat">
      <span className="eyebrow">{t.jobHeading}</span>
      <p className="h3" style={{ marginTop: 6 }}>
        {fill(t.jobLine, { trade, area })}
      </p>
      <div className="small muted" style={{ marginTop: 4 }}>
        {info.startDate && (
          <p className="m-0 flex items-center gap-1.5">
            <Icon name="cal" size={15} /> {fill(t.neededFrom, { date: dayMonthYear(info.startDate) })}
          </p>
        )}
        <p className="m-0 flex items-center gap-1.5">
          <Icon name="check" size={15} />{" "}
          {info.completionDate ? fill(t.completedOn, { date: dayMonthYear(info.completionDate) }) : t.completionUnknown}
        </p>
        <p className="mt-2 mb-0 leading-normal">{t.contractorNote}</p>
      </div>
    </div>
  );

  if (status === "done" || status === "used" || status === "bad_link") {
    const message = status === "done" ? t.thanks : status === "used" ? t.alreadyDone : t.linkBad;
    return (
      <div lang={language}>
        <div className="stack" style={{ ["--gap" as string]: "16px" }}>
          {topRow}
          <div className="center-done stack" style={{ ["--gap" as string]: "14px" }}>
            <span className={status === "bad_link" ? "done-ic bg-[var(--surface-2)] text-[var(--ink)]" : "done-ic"}>
              <Icon name={status === "bad_link" ? "info" : "check"} size={30} />
            </span>
            <h1 role="status" className="h1">
              {message}
            </h1>
            {status === "done" && translation === "pending" && <p className="small muted mb-0">{t.translationPending}</p>}
          </div>
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
      <form onSubmit={submit} noValidate className="stack" style={{ ["--gap" as string]: "18px" }}>
        {topRow}
        <div>
          <h1 className="h1">{t.title}</h1>
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            {t.intro}
          </p>
        </div>
        {job}

        {errorCount > 0 && (
          <div role="alert" className="notice small bg-red-50 text-red-900">
            {errorCount === 1 ? d.common.fixOne : fill(d.common.fixMany, { n: errorCount })}
          </div>
        )}
        {status === "failed" && (
          <div role="alert" className="notice small bg-red-50 font-semibold text-red-900">
            {t.failed}
          </div>
        )}

        <div className="field">
          <p id="overall-label" className="label">
            {t.overallLabel} <Req />
          </p>
          <p id="overall-help" className="help" style={{ margin: "0 0 8px" }}>
            {t.overallHelp}
          </p>
          <Stars
            name="overall"
            value={overall}
            onChange={setOverall}
            describedBy={errors.overall ? "overall-error overall-help" : "overall-help"}
            invalid={Boolean(errors.overall)}
            required
            starLabel={starLabel}
          />
          {errors.overall && (
            <p id="overall-error" className="error">
              {say("overall")}
            </p>
          )}
        </div>

        {criteria.map((c) => (
          <div key={c.key} className="field">
            <p id={`${c.key}-label`} className="label">
              {c.label} <span className="opt">{d.common.optional}</span>
            </p>
            <div className="row wrap" style={{ gap: "6px 12px" }}>
              <Stars
                name={c.key}
                value={c.value}
                onChange={c.set}
                describedBy={errors[c.key] ? `${c.key}-error` : undefined}
                invalid={Boolean(errors[c.key])}
                small
                starLabel={starLabel}
              />
              {c.value !== null && (
                <button type="button" onClick={() => c.set(null)} className="btn btn-quiet small">
                  {t.clearScore}
                </button>
              )}
            </div>
            {errors[c.key] && (
              <p id={`${c.key}-error`} className="error">
                {say(c.key)}
              </p>
            )}
          </div>
        ))}

        <div className="field">
          <label htmlFor="comment" className="label">
            {t.commentLabel} <span className="opt">{d.common.optional}</span>
          </label>
          <textarea
            id="comment"
            rows={3}
            maxLength={COMMENT_MAX}
            className="textarea"
            style={{ minHeight: 90 }}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            aria-invalid={errors.comment ? true : undefined}
            aria-describedby={errors.comment ? "comment-error comment-help" : "comment-help"}
          />
          <p id="comment-help" className="help">
            {t.commentHelp} {fill(t.charCount, { n: comment.length, max: COMMENT_MAX })}
          </p>
          {errors.comment && (
            <p id="comment-error" className="error">
              {say("comment")}
            </p>
          )}
        </div>

        <button type="submit" disabled={status === "sending"} className="btn btn-primary btn-block btn-lg">
          {status === "sending" ? t.submitting : t.submit}
        </button>
      </form>
    </div>
  );
}
