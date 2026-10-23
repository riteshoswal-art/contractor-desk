"use client";

import { useState } from "react";
import { NOTES_MAX, RATE_UNITS, validateBid, type BidErrors } from "@/lib/bid";
import type { BidFormInfo } from "@/lib/bid-store";
import { fill, getDict, translateMessage } from "@/lib/i18n";
import LanguageSelector from "../../LanguageSelector";
import { Icon, Logo } from "../../ui";
import { useLanguage } from "../../useLanguage";
import { submitBidAction } from "./actions";

type Status = "idle" | "sending" | "done" | "used" | "closed" | "bad_link" | "failed";

// "2026-10-21" -> "21-10-2026": digits only, so it reads the same in every language.
const dayMonthYear = (iso: string) => iso.split("-").reverse().join("-");

// "1250.5" -> "₹1,250.50" (Indian grouping); anything odd is shown as typed.
function rupees(amount: string): string {
  const n = Number(amount);
  if (!amount.trim() || !Number.isFinite(n)) return amount;
  return "₹" + new Intl.NumberFormat("en-IN", Number.isInteger(n) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const Req = () => <span className="req">*</span>;

// The bid screen a contractor reaches from a private link. It shows only the
// job (trade, area, dates): no developer name or phone, no other contractor, no
// other bid. It cannot be pointed at another job or contractor: the link decides
// that on the server.
export default function BidForm({ token, info }: { token: string; info: BidFormInfo }) {
  const [language, setLanguage] = useLanguage(info.preferredLanguage);
  const d = getDict(language);
  const t = d.bid;
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<BidErrors>({});
  const [status, setStatus] = useState<Status>("idle");
  const [provisional, setProvisional] = useState(info.provisional);

  const say = (key: keyof BidErrors) => translateMessage(language, errors[key]);
  const trade = (d.trades as Record<string, string>)[info.trade] ?? info.trade;
  const area = (d.areas as Record<string, string>)[info.area] ?? info.area;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (status === "sending") return; // a second click while sending does nothing
    const input = { amount, unit, notes };
    const check = validateBid(input);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setStatus("sending");
    try {
      const result = await submitBidAction(token, input, language);
      if (result.ok) {
        setProvisional(result.provisional);
        setStatus("done");
      } else if (result.error === "validation") {
        setErrors(result.errors);
        setStatus("idle");
      } else if (result.error === "already_bid") {
        setStatus("used");
      } else if (result.error === "closed") {
        setStatus("closed");
      } else if (result.error === "invalid_link" || result.error === "expired" || result.error === "unavailable" || result.error === "not_eligible") {
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
    <div className="card tint flat job-card">
      <span className="eyebrow">{t.jobHeading}</span>
      <p className="h2" style={{ marginTop: 6 }}>
        {fill(t.jobLine, { trade, area })}
      </p>
      {(info.startDate || info.durationDays) && (
        <div className="row wrap small muted" style={{ marginTop: 8, gap: "6px 14px" }}>
          {info.startDate && (
            <span className="row" style={{ gap: 6 }}>
              <Icon name="cal" size={15} /> {fill(t.neededFrom, { date: dayMonthYear(info.startDate) })}
            </span>
          )}
          {info.durationDays && (
            <span className="row" style={{ gap: 6 }}>
              <Icon name="clock" size={15} /> {fill(t.duration, { days: info.durationDays })}
            </span>
          )}
        </div>
      )}
    </div>
  );

  const provisionalNote = (
    <p role="note" className="notice notice-warn small" style={{ margin: 0 }}>
      <Icon name="info" size={16} className="mt-0.5" />
      <span>{t.provisionalNote}</span>
    </p>
  );

  if (status === "done" || status === "used" || status === "closed" || status === "bad_link") {
    const message =
      status === "done" ? (provisional ? t.thanksProvisional : t.thanks) : status === "used" ? t.alreadyDone : status === "closed" ? t.closed : t.linkBad;
    const good = status === "done" || status === "used";
    return (
      <div lang={language}>
        <div className="stack" style={{ ["--gap" as string]: "16px" }}>
          {topRow}
          {job}
          <div className="center-done stack" style={{ ["--gap" as string]: "12px" }}>
            <span className={good ? "done-ic" : "done-ic bg-[var(--surface-2)] text-[var(--ink)]"}>
              <Icon name={good ? "check" : "info"} size={30} />
            </span>
            <h1 role="status" className="h2">
              {message}
            </h1>
            {status === "done" && (
              <div className="card flat receipt">
                <div className="row between">
                  <span className="muted small">{t.amountLabel}</span>
                  <span className="h3">{rupees(amount)}</span>
                </div>
                {unit && (
                  <div className="row between">
                    <span className="muted small">{t.unitLabel}</span>
                    <span className="h3 text-right">{t.units[unit as keyof typeof t.units] ?? unit}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const errorCount = Object.values(errors).filter(Boolean).length;

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
        {info.provisional && provisionalNote}

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
          <label htmlFor="amount" className="label">
            {t.amountLabel} <Req />
          </label>
          <div className="prefix-input">
            <span aria-hidden="true">₹</span>
            <input
              id="amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-required="true"
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? "amount-error amount-help" : "amount-help"}
            />
          </div>
          <p id="amount-help" className="help">
            {t.amountHelp}
          </p>
          {errors.amount && (
            <p id="amount-error" className="error">
              {say("amount")}
            </p>
          )}
        </div>

        <div className="field">
          <p id="unit-label" className="label">
            {t.unitLabel} <Req />
          </p>
          <div
            id="unit"
            role="group"
            className="unit-grid"
            aria-labelledby="unit-label"
            data-invalid={errors.unit ? true : undefined}
            aria-describedby={errors.unit ? "unit-error" : undefined}
          >
            {RATE_UNITS.map((u) => (
              <button
                key={u.value}
                type="button"
                value={u.value}
                aria-pressed={unit === u.value}
                onClick={() => {
                  setUnit(u.value);
                  setErrors((e) => ({ ...e, unit: undefined }));
                }}
                className={`chip unit-chip${unit === u.value ? " on" : ""}`}
              >
                {t.units[u.value]}
              </button>
            ))}
          </div>
          {errors.unit && (
            <p id="unit-error" className="error">
              {say("unit")}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="notes" className="label">
            {t.notesLabel} <span className="opt">{d.common.optional}</span>
          </label>
          <textarea
            id="notes"
            rows={3}
            maxLength={NOTES_MAX}
            className="textarea"
            style={{ minHeight: 84 }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-invalid={errors.notes ? true : undefined}
            aria-describedby={errors.notes ? "notes-error notes-help" : "notes-help"}
          />
          <p id="notes-help" className="help">
            {t.notesHelp} {fill(d.review.charCount, { n: notes.length, max: NOTES_MAX })}
          </p>
          {errors.notes && (
            <p id="notes-error" className="error">
              {say("notes")}
            </p>
          )}
        </div>

        <p className="notice notice-info small" style={{ margin: 0 }}>
          <Icon name="lock" size={16} className="mt-0.5" />
          <span>{t.onceNote}</span>
        </p>

        <button type="submit" disabled={status === "sending"} className="btn btn-primary btn-block btn-lg">
          {status === "sending" ? t.submitting : t.submit}
        </button>
      </form>
    </div>
  );
}
