"use client";

import { useState } from "react";
import { NOTES_MAX, RATE_UNITS, validateBid, type BidErrors } from "@/lib/bid";
import type { BidFormInfo } from "@/lib/bid-store";
import { fill, getDict, translateMessage } from "@/lib/i18n";
import LanguageSelector from "../../LanguageSelector";
import { useLanguage } from "../../useLanguage";
import { submitBidAction } from "./actions";

type Status = "idle" | "sending" | "done" | "used" | "closed" | "bad_link" | "failed";

const fieldClass =
  "mt-1 block w-full rounded-md border border-zinc-400 bg-white px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-500 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/40 aria-[invalid=true]:border-red-700";
const labelClass = "block text-sm font-medium text-zinc-900";

// "2026-10-21" -> "21-10-2026": digits only, so it reads the same in every language.
const dayMonthYear = (iso: string) => iso.split("-").reverse().join("-");

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

  const header = (
    <>
      <p className="text-sm font-medium text-zinc-600">{d.common.brand}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t.title}</h1>
      <p className="mt-3 text-base leading-7 text-zinc-700">{t.intro}</p>
      <div className="mt-6 rounded-md border border-zinc-300 bg-zinc-50 p-4 text-sm leading-6">
        <p className="font-semibold">{t.jobHeading}</p>
        <p className="mt-1">{fill(t.jobLine, { trade, area })}</p>
        {info.startDate && <p className="text-zinc-700">{fill(t.neededFrom, { date: dayMonthYear(info.startDate) })}</p>}
        {info.durationDays && <p className="text-zinc-700">{fill(t.duration, { days: info.durationDays })}</p>}
      </div>
      {info.provisional && (
        <p role="note" className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          {t.provisionalNote}
        </p>
      )}
      <LanguageSelector language={language} onChange={setLanguage} />
    </>
  );

  if (status === "done" || status === "used" || status === "closed" || status === "bad_link") {
    const message =
      status === "done" ? (provisional ? t.thanksProvisional : t.thanks) : status === "used" ? t.alreadyDone : status === "closed" ? t.closed : t.linkBad;
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
        </div>
      </div>
    );
  }

  const errorCount = Object.values(errors).filter(Boolean).length;

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
          <label htmlFor="amount" className={labelClass}>
            {t.amountLabel} <span className="text-red-700">*</span>
          </label>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? "amount-error" : "amount-help"}
            className={fieldClass}
          />
          <p id="amount-help" className="mt-1 text-sm text-zinc-600">
            {t.amountHelp}
          </p>
          {errors.amount && (
            <p id="amount-error" className="mt-1 text-sm font-medium text-red-700">
              {say("amount")}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="unit" className={labelClass}>
            {t.unitLabel} <span className="text-red-700">*</span>
          </label>
          <select
            id="unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            aria-invalid={errors.unit ? true : undefined}
            aria-describedby={errors.unit ? "unit-error" : undefined}
            className={fieldClass}
          >
            <option value="">{t.unitChoose}</option>
            {RATE_UNITS.map((u) => (
              <option key={u.value} value={u.value}>
                {t.units[u.value]}
              </option>
            ))}
          </select>
          {errors.unit && (
            <p id="unit-error" className="mt-1 text-sm font-medium text-red-700">
              {say("unit")}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="notes" className={labelClass}>
            {t.notesLabel} <span className="font-normal text-zinc-600">{d.common.optional}</span>
          </label>
          <textarea
            id="notes"
            rows={4}
            maxLength={NOTES_MAX}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-invalid={errors.notes ? true : undefined}
            aria-describedby={errors.notes ? "notes-error" : "notes-help"}
            className={fieldClass}
          />
          <p id="notes-help" className="mt-1 text-sm text-zinc-600">
            {t.notesHelp} {fill(d.review.charCount, { n: notes.length, max: NOTES_MAX })}
          </p>
          {errors.notes && (
            <p id="notes-error" className="mt-1 text-sm font-medium text-red-700">
              {say("notes")}
            </p>
          )}
        </div>

        <p className="rounded-md border border-zinc-300 bg-zinc-50 p-4 text-sm font-medium text-zinc-900">{t.onceNote}</p>

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
