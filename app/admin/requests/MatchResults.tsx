import Link from "next/link";
import { ratingText, type ReviewSummary } from "@/lib/review";
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
  // Present only when ratings can be read. `summary: null` means no valid review
  // yet ("Not yet rated"); an absent `rating` means ratings are not available at all.
  rating?: { summary: ReviewSummary | null };
  slot?: React.ReactNode; // forms and bid information supplied by the page
};

function ConfirmationStatus({ info }: { info: NonNullable<CandidateExtras["confirmation"]> }) {
  const { current, state, history } = info;
  return (
    <div className="quote" style={{ marginTop: 10 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>
        Confirmation for this request:{" "}
        {current ? CONFIRMATION_LABELS[current.status] : "none recorded"}
      </p>
      {current && (
        <p className="muted" style={{ margin: "4px 0 0" }}>
          {SOURCE_LABELS[current.source]}, {fmt(current.recordedAt)}
          {current.confirmedStartDate ? `. Date: ${fmt(current.confirmedStartDate)}` : ""}
          {current.note ? `. Note: ${current.note}` : ""}
        </p>
      )}
      {!state.confirmed && (
        <p className="muted" style={{ margin: "4px 0 0" }}>{NOT_CONFIRMED_TEXT[state.reason]}</p>
      )}
      {history.length > 1 && (
        <details style={{ marginTop: 8 }}>
          <summary className="cursor-pointer" style={{ fontWeight: 600 }}>
            History ({history.length} entries)
          </summary>
          <ol className="history" style={{ marginTop: 8 }}>
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
    <section aria-labelledby="matches-heading" className="stack" style={{ ["--gap" as string]: "14px", marginTop: 32 }}>
      <h2 id="matches-heading" className="h2">
        Potential contractors
      </h2>
      <p className="small muted" style={{ marginTop: 6 }}>
        Found by simple rules on trade, locality, availability and start date.
        These are potential matches only: nobody has been contacted, and no
        availability is guaranteed. Job duration, job size and budget are not
        checked, because that information is not collected from contractors.
      </p>

      {result.requestIncomplete && (
        <p className="notice notice-muted">
          This request is missing a trade or locality, so no search was run.
        </p>
      )}

      {!result.requestIncomplete && result.candidates.length === 0 && (
        <div
          role="status"
          className="card tint flat small"
        >
          <p className="h3">No suitable contractors found.</p>
          <p className="muted" style={{ margin: "6px 0 0" }}>
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
          <p className="small" style={{ fontWeight: 600 }}>
            Showing {result.candidates.length} of {result.eligibleCount}{" "}
            potential match{result.eligibleCount === 1 ? "" : "es"}. Ordered by
            start-date fit first (exact date, then 1 day later, then 2 days
            later), then recorded confirmation, then most recent availability
            report.
          </p>
          {result.needsStartConfirmationCount > 0 && (
            <p className="notice notice-warn">
              {result.needsStartConfirmationCount} of these{" "}
              {result.needsStartConfirmationCount === 1 ? "is" : "are"}{" "}
              labelled &ldquo;{START_NEEDS_CONFIRMATION}&rdquo;: their stated
              start date is not the requested date (or is not recorded).
              Confirm it with them before relying on it.
            </p>
          )}
          <ol className="stack" style={{ ["--gap" as string]: "14px", listStyle: "none", padding: 0, margin: 0 }}>
            {result.candidates.map((c, i) => (
              <li
                key={c.contractorId}
                className="card"
              >
                <div className="row between wrap" style={{ gap: 8 }}>
                  <h3 className="h3">
                    {i + 1}. {c.name || "Name not given"}{" "}
                    <span className="mono muted" style={{ fontWeight: 400 }}>
                      {c.contractorId}
                    </span>
                  </h3>
                  <span
                    className={
                      c.recordType === "TEST"
                        ? "pill plain pill-warn"
                        : "pill plain pill-dark"
                    }
                  >
                    {c.recordType}
                  </span>
                </div>

                {extras?.[c.contractorId]?.confirmation?.state.confirmed ? (
                  // Only a confirmation recorded for THIS request, by the
                  // contractor or by you, ever shows this.
                  <p className="small" style={{ margin: "10px 0 0", fontWeight: 600, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                    <span className="pill pill-ok">
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
                  <p className="small" style={{ margin: "10px 0 0", fontWeight: 600, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                    <span className="pill pill-warn">
                      {c.startFit.label}
                    </span>{" "}
                    Potential match — not confirmed for the requested date
                  </p>
                ) : (
                  <p className="small" style={{ margin: "10px 0 0", fontWeight: 600, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                    {c.evidence.kind === "founder_confirmed"
                      ? `Potential match — availability recorded as confirmed by you on ${fmt(c.evidence.at)}`
                      : "Potential match — availability not confirmed"}
                  </p>
                )}

                {extras?.[c.contractorId]?.confirmation && (
                  <ConfirmationStatus info={extras[c.contractorId].confirmation!} />
                )}

                {extras?.[c.contractorId]?.rating && (
                  <p className="small" style={{ margin: "10px 0 0" }}>
                    <span style={{ fontWeight: 600 }}>Reviews:</span>{" "}
                    {ratingText(extras[c.contractorId].rating!.summary ?? undefined)}
                  </p>
                )}

                <h4 className="eyebrow" style={{ margin: "14px 0 0" }}>Why this match</h4>
                <ul className="small" style={{ margin: "6px 0 0", paddingLeft: 20, listStyle: "disc", lineHeight: 1.6 }}>
                  {c.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>

                {c.missing.length > 0 && (
                  <>
                    <h4 className="eyebrow" style={{ margin: "14px 0 0" }}>
                      Missing or unchecked
                    </h4>
                    <ul className="small muted" style={{ margin: "6px 0 0", paddingLeft: 20, listStyle: "disc", lineHeight: 1.6 }}>
                      {c.missing.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  </>
                )}

                {extras?.[c.contractorId]?.slot}

                <p className="small muted" style={{ margin: "14px 0 0", paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                  Phone number: held back until you review a message.{" "}
                  <Link
                    href={`/admin/requests/${request.id}/contact/${c.contractorId}`}
                    className="font-semibold underline underline-offset-2" style={{ color: "var(--ink)" }}
                  >
                    Prepare a message
                  </Link>
                  {" · "}
                  <Link
                    href={`/admin/requests/${request.id}/outcome/${c.contractorId}`}
                    className="font-semibold underline underline-offset-2" style={{ color: "var(--ink)" }}
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
        <p className="small muted">
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
