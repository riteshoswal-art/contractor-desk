// Dashboard calculations. Every figure is computed only from outcomes the
// founder actually recorded. Nothing is estimated, filled in or extrapolated,
// and percentages and medians appear only when there are enough real data
// points. TEST and REAL results are always calculated separately.
import type { OutcomeRecord } from "./outcome";

// Below these sample sizes the dashboard shows raw counts only.
export const MIN_FOR_PERCENT = 5;
export const MIN_FOR_MEDIAN = 5;

export type Metric = {
  numerator: number;
  denominator: number;
  percent: number | null; // null until there is enough data
  enough: boolean;
};

export type NumberSummary = {
  n: number;
  median: number | null; // null until there is enough data
  enough: boolean;
};

export type TypeStats = {
  recordType: "TEST" | "REAL";
  total: number; // outcomes logged
  hasData: boolean;
  sent: { yes: number; no: number };
  replies: { yes: number; no: number; noResponse: number; awaiting: number };
  responseRate: Metric; // replied (yes or no) out of sent messages with a recorded result
  responseTime: NumberSummary; // minutes, only where both times were recorded
  usable: { yes: number; no: number; notSure: number };
  usableShare: Metric;
  ratings: { n: number; counts: [number, number, number, number, number]; median: number | null; enough: boolean };
  jobStarted: { yes: number; no: number; unknown: number };
  jobStartedShare: Metric; // among outcomes where it is known
  failureReasons: Record<string, number>;
};

export function metric(numerator: number, denominator: number): Metric {
  const enough = denominator >= MIN_FOR_PERCENT;
  return {
    numerator,
    denominator,
    percent: enough ? Math.round((100 * numerator) / denominator) : null,
    enough,
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function computeTypeStats(
  all: OutcomeRecord[],
  recordType: "TEST" | "REAL",
): TypeStats {
  const rows = all.filter((o) => o.recordType === recordType);

  const sentRows = rows.filter((o) => o.messageSent === "yes");
  const replies = {
    yes: sentRows.filter((o) => o.reply === "yes").length,
    no: sentRows.filter((o) => o.reply === "no").length,
    noResponse: sentRows.filter((o) => o.reply === "no_response").length,
    awaiting: sentRows.filter((o) => o.reply === "").length,
  };
  // Messages still waiting for an answer are not counted against the rate.
  const resolved = replies.yes + replies.no + replies.noResponse;

  const times = sentRows
    .filter((o) => (o.reply === "yes" || o.reply === "no") && o.responseMinutes !== null)
    .map((o) => o.responseMinutes as number);

  const usable = {
    yes: rows.filter((o) => o.matchUsable === "yes").length,
    no: rows.filter((o) => o.matchUsable === "no").length,
    notSure: rows.filter((o) => o.matchUsable === "").length,
  };

  const ratingValues = rows.filter((o) => o.rating !== null).map((o) => o.rating as number);
  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const r of ratingValues) counts[r - 1] += 1;

  const jobStarted = {
    yes: rows.filter((o) => o.jobStarted === "yes").length,
    no: rows.filter((o) => o.jobStarted === "no").length,
    unknown: rows.filter((o) => o.jobStarted === "").length,
  };

  const failureReasons: Record<string, number> = {};
  for (const o of rows) {
    if (o.failureReason) {
      failureReasons[o.failureReason] = (failureReasons[o.failureReason] ?? 0) + 1;
    }
  }

  return {
    recordType,
    total: rows.length,
    hasData: rows.length > 0,
    sent: { yes: sentRows.length, no: rows.filter((o) => o.messageSent === "no").length },
    replies,
    responseRate: metric(replies.yes + replies.no, resolved),
    responseTime: {
      n: times.length,
      median: times.length >= MIN_FOR_MEDIAN ? median(times) : null,
      enough: times.length >= MIN_FOR_MEDIAN,
    },
    usable,
    usableShare: metric(usable.yes, usable.yes + usable.no),
    ratings: {
      n: ratingValues.length,
      counts,
      median: ratingValues.length >= MIN_FOR_MEDIAN ? median(ratingValues) : null,
      enough: ratingValues.length >= MIN_FOR_MEDIAN,
    },
    jobStarted,
    jobStartedShare: metric(jobStarted.yes, jobStarted.yes + jobStarted.no),
    failureReasons,
  };
}

// "135" -> "2 h 15 min"
export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return `${days} d ${hours} h`;
  return mins ? `${hours} h ${mins} min` : `${hours} h`;
}
