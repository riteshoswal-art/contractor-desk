import Link from "next/link";
import {
  EXCLUSION_LABELS,
  formatDate as fmt,
  type ExclusionReason,
  type MatchResult,
  type RequestRecord,
} from "@/lib/match";

// Presentational only: it shows what the matching rules produced and nothing
// else. It never shows phone numbers, and it never calls a candidate verified
// or guaranteed available.

export default function MatchResults({
  result,
  request,
}: {
  result: MatchResult;
  request: RequestRecord;
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
            recorded confirmation first, then most recent availability report.
          </p>
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

                <p className="mt-2 text-sm font-medium">
                  {c.evidence.kind === "founder_confirmed"
                    ? `Potential match — availability recorded as confirmed by you on ${fmt(c.evidence.at)}`
                    : "Potential match — availability not confirmed"}
                </p>

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
