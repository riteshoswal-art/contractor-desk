import { FAILURE_REASONS } from "@/lib/outcome";
import {
  MIN_FOR_MEDIAN,
  MIN_FOR_PERCENT,
  formatMinutes,
  type Metric,
  type TypeStats,
} from "@/lib/stats";

// Presentational only. It shows what was recorded and nothing more: counts are
// always shown, and percentages and medians only once there is enough real
// data. It shows no IDs, names, phone numbers or messages.

function ratio(m: Metric): string {
  if (m.denominator === 0) return "No data yet";
  const counts = `${m.numerator} of ${m.denominator}`;
  return m.enough && m.percent !== null
    ? `${counts} (${m.percent}%)`
    : `${counts} (too few to show a percentage; at least ${MIN_FOR_PERCENT} needed)`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row between wrap" style={{ alignItems: "baseline", gap: "4px 16px", padding: "12px 0", borderBottom: "1px solid var(--line)", fontSize: "0.92rem" }}>
      <dt className="muted">{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600, textAlign: "right" }}>{value}</dd>
    </div>
  );
}

export default function StatsView({
  stats,
  title,
  caption,
}: {
  stats: TypeStats;
  title: string;
  caption: string;
}) {
  const real = stats.recordType === "REAL";
  const reasonLabel = (v: string) =>
    FAILURE_REASONS.find((r) => r.value === v)?.label ?? "Other";

  return (
    <section
      aria-labelledby={`h-${stats.recordType}`}
      className={`card stack${real ? "" : " tint"}`}
      style={{ ["--gap" as string]: "16px", padding: 24 }}
    >
      <div className="row between wrap" style={{ gap: 8 }}>
        <div>
          <h2 id={`h-${stats.recordType}`} className="h2">
            {title}
          </h2>
          <p className="small muted" style={{ margin: "4px 0 0" }}>{caption}</p>
        </div>
        <span className={`pill ${real ? "pill-dark" : "pill-warn"}`}>{real ? "Real records" : "Test records"}</span>
      </div>

      {!stats.hasData ? (
        <p role="status" className="notice notice-muted" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
          No {real ? "real" : "test"} results yet.{" "}
          {real
            ? "Real outcomes will appear here after you record them for real contractors. Nothing is estimated in the meantime."
            : "Test outcomes appear here after you record them for test contractors."}
        </p>
      ) : (
        <>
        <div className="facts facts-inline" style={{ padding: "4px 0 20px", margin: 0 }}>
          {(
            [
              [stats.total, "outcomes recorded"],
              [stats.sent.yes, "messages sent"],
              [stats.replies.yes, "replied yes"],
              [stats.jobStarted.yes, "jobs started"],
            ] as [number, string][]
          ).map(([n, label]) => (
            <div key={label}>
              <b>{n}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <dl style={{ margin: 0 }}>
          <Row label="Outcomes recorded" value={stats.total} />
          <Row
            label="Messages you confirmed sending"
            value={`${stats.sent.yes} (${stats.sent.no} logged as not sent)`}
          />
          <Row
            label="Replies recorded"
            value={`${stats.replies.yes} yes · ${stats.replies.no} no · ${stats.replies.noResponse} no response · ${stats.replies.awaiting} still waiting`}
          />
          <Row
            label="Response rate (replied, out of messages with a result)"
            value={ratio(stats.responseRate)}
          />
          <Row
            label="Median response time"
            value={
              stats.responseTime.enough && stats.responseTime.median !== null
                ? `${formatMinutes(stats.responseTime.median)} (from ${stats.responseTime.n} replies with times)`
                : `Not enough data yet (${stats.responseTime.n} reply time${stats.responseTime.n === 1 ? "" : "s"} recorded; at least ${MIN_FOR_MEDIAN} needed)`
            }
          />
          <Row
            label="Matches you judged usable"
            value={`${ratio(stats.usableShare)}${stats.usable.notSure ? `; ${stats.usable.notSure} not sure yet` : ""}`}
          />
          <Row
            label="Usefulness ratings (1 to 5)"
            value={
              stats.ratings.n === 0
                ? "No ratings yet"
                : `${stats.ratings.n} rating${stats.ratings.n === 1 ? "" : "s"}: ${stats.ratings.counts
                    .map((c, i) => `${i + 1}★ ×${c}`)
                    .join(", ")}${
                    stats.ratings.enough && stats.ratings.median !== null
                      ? `; median ${stats.ratings.median}`
                      : `; median shown after ${MIN_FOR_MEDIAN} ratings`
                  }`
            }
          />
          <Row
            label="Jobs started (where known)"
            value={`${ratio(stats.jobStartedShare)}${stats.jobStarted.unknown ? `; ${stats.jobStarted.unknown} not known` : ""}`}
          />
          {Object.keys(stats.failureReasons).length > 0 && (
            <Row
              label="Reasons it did not work out"
              value={Object.entries(stats.failureReasons)
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => `${reasonLabel(k)} ×${n}`)
                .join(", ")}
            />
          )}
        </dl>
        </>
      )}
    </section>
  );
}
