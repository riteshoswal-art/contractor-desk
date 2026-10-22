import Link from "next/link";
import {
  CONFIRMATION_LABELS,
  NOT_CONFIRMED_TEXT,
  SOURCE_LABELS,
  type Confirmation,
  type ConfirmedStart,
} from "@/lib/confirmation";
import {
  EXCLUSION_LABELS,
  START_NEEDS_CONFIRMATION,
  formatDate as fmt,
  type ExclusionReason,
  type MatchResult,
  type RequestRecord,
} from "@/lib/match";

// Presentational only: it shows what the matching rules produced and nothing
// else. It never shows phone numbers, and it never calls a candidate verified
// or guaranteed available.

// What the page knows about one candidate for THIS request, on top of the
// matching rules. Everything is optional: with none of it the list looks
// exactly as it did before confirmations existed.
export type CandidateExtras = {
  confirmation?: {
    current: Confirmation | null;
    state: ConfirmedStart;
    history: Confirmation[];
  };
  slot?: React.ReactNode; // forms and bid information supplied by the page
};

function ConfirmationStatus({ info }: { info: NonNullable<CandidateExtras["confirmation"]> }) {
  const { current, state, history } = info;
  return (
    <div className="mt-2 rounded-md bg-zinc-50 p-3 text-sm">
      <p className="font-medium">
        Confirmation for this request:{" "}
        {current ? CONFIRMATION_LABELS[current.status] : "none recorded"}
      </p>
      {current && (
        <p className="mt-1 text-zinc-700">
          {SOURCE_LABELS[current.source]}, {fmt(current.recordedAt)}
          {current.confirmedStartDate ? `. Date: ${fmt(current.confirmedStartDate)}` : ""}
          {current.note ? `. Note: ${current.note}` : ""}
        </p>
      )}
      {!state.confirmed && (
        <p className="mt-1 text-zinc-700">{NOT_CONFIRMED_TEXT[state.reason]}</p>
      )}
      {history.length > 1 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-blue-800">
            History ({history.length} entries)
          </summary>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-zinc-700">
            {history.map((h) => (
              <li key={h.id}>
                {CONFIRMATION_LABELS[h.status]}
                {h.confirmedStartDate ? `, ${fmt(h.confirmedStartDate)}` : ""} — {fmt(h.recordedAt)} (
                {h.source === "admin" ? "founder" : "contractor link"})
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

export default function MatchResults({
  result,
  request,
  extras,
}: {
  result: MatchResult;
  request: RequestRecord;
  extras?: Record<string, CandidateExtras>;
}) {
  const excludedTotal = Object.values(result.excluded).reduce((a, b) => a + b, 0);
  const excludedParts = (Object.keys(result.excluded) as ExclusionReason[])
    .filter((k) => result.excluded[k] > 0)
    .map((k) => `${result.excluded[k]} ${EXCLUSION_LABELS[k]}`);

  return (
    <section aria-labelledby="matches-heading" className="mt-8">
      <h2 id="matches-heading" className="text-lg font-semibold">
        Potential contractors
      </h2>
      <p className="mt-1 text-sm text-zinc-700">
        Found by simple rules on trade, locality, availability and start date.
        These are potential matches only: nobody has been contacted, and no
        availability is guaranteed. Job duration, job size and budget are not
        checked, because that information is not collected from contractors.
      </p>

      {result.requestIncomplete && (
        <p className="mt-4 rounded-md border border-zinc-300 p-4 text-sm">
          This request is missing a trade or locality, so no search was run.
        </p>
      )}

      {!result.requestIncomplete && result.candidates.length === 0 && (
        <div
          role="status"
          className="mt-4 rounded-md border border-zinc-300 bg-zinc-50 p-4 text-sm"
        >
          <p className="font-medium">No suitable contractors found.</p>
          <p className="mt-1 text-zinc-700">
            {result.checked === 0
              ? `There are no ${result.recordType} contractor records yet.`
              : `We checked ${result.checked} ${result.recordType} contractor record${result.checked === 1 ? "" : "s"}; none passed every rule.`}{" "}
            Nothing has been guessed or filled in. You could register more
            contractors or reconfirm availability by phone.
          </p>
        </div>
      )}

      {result.candidates.length > 0 && (
        <>
          <p className="mt-4 text-sm font-medium">
            Showing {result.candidates.length} of {result.eligibleCount}{" "}
            potential match{result.eligibleCount === 1 ? "" : "es"}. Ordered by
            start-date fit first (exact date, then 1 day later, then 2 days
            later), then recorded confirmation, then most recent availability
            report.
          </p>
          {result.needsStartConfirmationCount > 0 && (
            <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              {result.needsStartConfirmationCount} of these{" "}
              {result.needsStartConfirmationCount === 1 ? "is" : "are"}{" "}
              labelled &ldquo;{START_NEEDS_CONFIRMATION}&rdquo;: their stated
              start date is not the requested date (or is not recorded).
              Confirm it with them before relying on it.
            </p>
          )}
          <ol className="mt-3 space-y-4">
            {result.candidates.map((c, i) => (
              <li
                key={c.contractorId}
                className="rounded-md border border-zinc-300 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">
                    {i + 1}. {c.name || "Name not given"}{" "}
                    <span className="font-mono text-sm font-normal text-zinc-600">
                      {c.contractorId}
                    </span>
                  </h3>
                  <span
                    className={
                      c.recordType === "TEST"
                        ? "rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950"
                        : "rounded bg-zinc-200 px-2 py-0.5 text-xs font-semibold text-zinc-900"
                    }
                  >
                    {c.recordType}
                  </span>
                </div>

                {extras?.[c.contractorId]?.confirmation?.state.confirmed ? (
                  // Only a confirmation recorded for THIS request, by the
                  // contractor or by you, ever shows this.
                  <p className="mt-2 text-sm font-medium">
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-900">
                      Start date confirmed:{" "}
                      {fmt(
                        (extras[c.contractorId].confirmation!.state as { startDate: string }).startDate,
                      )}
                    </span>{" "}
                    Potential match — confirmed for this request
                  </p>
                ) : c.startFit.label ? (
                  // A near-date candidate is never shown as confirmed: even a
                  // recorded confirmation was not about the requested date.
                  <p className="mt-2 text-sm font-medium">
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">
                      {c.startFit.label}
                    </span>{" "}
                    Potential match — not confirmed for the requested date
                  </p>
                ) : (
                  <p className="mt-2 text-sm font-medium">
                    {c.evidence.kind === "founder_confirmed"
                      ? `Potential match — availability recorded as confirmed by you on ${fmt(c.evidence.at)}`
                      : "Potential match — availability not confirmed"}
                  </p>
                )}

                {extras?.[c.contractorId]?.confirmation && (
                  <ConfirmationStatus info={extras[c.contractorId].confirmation!} />
                )}

                <h4 className="mt-3 text-sm font-semibold">Why this match</h4>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {c.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>

                {c.missing.length > 0 && (
                  <>
                    <h4 className="mt-3 text-sm font-semibold">
                      Missing or unchecked
                    </h4>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-800">
                      {c.missing.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </>
                )}

                {extras?.[c.contractorId]?.slot}

                <p className="mt-3 text-sm text-zinc-600">
                  Phone number: held back until you review a message.{" "}
                  <Link
                    href={`/admin/requests/${request.id}/contact/${c.contractorId}`}
                    className="font-medium text-blue-800 underline"
                  >
                    Prepare a message
                  </Link>
                  {" · "}
                  <Link
                    href={`/admin/requests/${request.id}/outcome/${c.contractorId}`}
                    className="font-medium text-blue-800 underline"
                  >
                    Record outcome
                  </Link>
                </p>
              </li>
            ))}
          </ol>
        </>
      )}

      {!result.requestIncomplete && (
        <p className="mt-4 text-sm text-zinc-600">
          Checked {result.checked} {result.recordType} contractor record
          {result.checked === 1 ? "" : "s"} for {request.trade} in{" "}
          {request.area}
          {request.startDate ? `, start ${fmt(request.startDate)}` : ""}.
          {excludedTotal > 0 && ` Left out: ${excludedParts.join("; ")}.`}
        </p>
      )}
    </section>
  );
}
