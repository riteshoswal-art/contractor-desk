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
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-zinc-200 py-2 text-sm">
      <dt className="text-zinc-700">{label}</dt>
      <dd className="font-medium">{value}</dd>
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
      className={`mt-8 rounded-md border p-4 ${real ? "border-zinc-400" : "border-amber-400 bg-amber-50"}`}
    >
      <h2 id={`h-${stats.recordType}`} className="text-lg font-semibold">
        {title}
      </h2>
      <p className="mt-1 text-sm text-zinc-700">{caption}</p>

      {!stats.hasData ? (
        <p role="status" className="mt-4 rounded-md border border-zinc-300 bg-white p-4 text-sm">
          No {real ? "real" : "test"} results yet.{" "}
          {real
            ? "Real outcomes will appear here after you record them for real contractors. Nothing is estimated in the meantime."
            : "Test outcomes appear here after you record them for test contractors."}
        </p>
      ) : (
        <dl className="mt-3">
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
      )}
    </section>
  );
}
