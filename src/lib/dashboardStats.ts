import type { DailyMetrics } from "@/types/metrics";

export type MetricKey = "steps" | "moveCalories" | "restMinutes" | "breatheMinutes" | "readinessScore";
export type Sport = "run" | "ride" | "swim" | "yoga" | "strength";

export const sportLabels: Record<Sport, string> = {
  run: "Run",
  ride: "Ride",
  swim: "Swim",
  yoga: "Yoga",
  strength: "Strength",
};

const sportPatterns: Array<[Sport, RegExp]> = [
  ["run", /\b(run|running|jog|tempo|interval)/i],
  ["ride", /\b(ride|cycl|bike|biking|spin)/i],
  ["swim", /\bswim/i],
  ["yoga", /\b(yoga|pilates|stretch)/i],
  ["strength", /\b(strength|weights?|lift|core|mobility|gym)/i],
];

/** Works out the sport from an activity name. Walking and unknown activities return null. */
export function sportOf(name: string): Sport | null {
  for (const [sport, pattern] of sportPatterns) {
    if (pattern.test(name)) return sport;
  }
  return null;
}

const valueOf = (row: DailyMetrics, key: MetricKey): number | null => {
  const value = row[key];
  return typeof value === "number" ? value : null;
};

const dayNumber = (date: string) => Date.parse(`${date}T12:00:00Z`) / 86_400_000;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Median of the days in the `days` before the latest record. Needs at least
 * four recorded days so one or two entries don't pass for a baseline.
 */
export function priorMedian(rows: DailyMetrics[], latest: DailyMetrics, key: MetricKey, days = 28): number | null {
  const end = dayNumber(latest.date);
  const values = rows.flatMap((row) => {
    const offset = end - dayNumber(row.date);
    const value = valueOf(row, key);
    return offset >= 1 && offset <= days && value !== null ? [value] : [];
  });
  return values.length < 4 ? null : median(values);
}

/** Percentage difference from a baseline, rounded. Null when there is nothing to compare. */
export function percentChange(value: number | null, baseline: number | null): number | null {
  if (value === null || baseline === null || baseline === 0) return null;
  return Math.round(((value - baseline) / baseline) * 100);
}

/** Values for the last `days` calendar days ending on the latest record, null where nothing was recorded. */
export function recentSeries(rows: DailyMetrics[], latest: DailyMetrics, key: MetricKey, days = 28): Array<number | null> {
  const byDay = new Map(rows.map((row) => [dayNumber(row.date), row]));
  const end = dayNumber(latest.date);
  return Array.from({ length: days }, (_, i) => {
    const row = byDay.get(end - (days - 1 - i));
    return row ? valueOf(row, key) : null;
  });
}

export type TrainingSession = { sport: Sport; name: string; minutes: number };
export type TrainingDay = {
  date: string;
  sessions: TrainingSession[];
  readiness: number | null;
  lowEnergy: boolean;
};

/** Each calendar day in the window with its sport sessions, readiness and whether energy was checked in as low. */
export function trainingDays(rows: DailyMetrics[], latest: DailyMetrics, days: number): TrainingDay[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const end = new Date(`${latest.date}T12:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - (days - 1 - i));
    const date = day.toISOString().slice(0, 10);
    const row = byDate.get(date);
    const sessions = (row?.activities ?? []).flatMap((activity) => {
      const sport = sportOf(activity.name);
      return sport ? [{ sport, name: activity.name, minutes: activity.durationMinutes }] : [];
    });
    const energy = row?.checkIn?.energy ?? null;
    return { date, sessions, readiness: row?.readinessScore ?? null, lowEnergy: energy !== null && energy <= 2 };
  });
}

/** Most recent sport sessions, newest first. */
export function recentSessions(rows: DailyMetrics[], limit = 6) {
  return [...rows]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((row) =>
      row.activities.flatMap((activity) => {
        const sport = sportOf(activity.name);
        return sport ? [{ date: row.date, sport, name: activity.name, minutes: activity.durationMinutes, calories: activity.calories }] : [];
      }),
    )
    .slice(0, limit);
}

export const formatNumber = (value: number | null) => (value === null ? "—" : value.toLocaleString("en-US"));

export const formatMinutes = (value: number | null) => {
  if (value === null) return "—";
  if (value < 60) return `${value}m`;
  return `${Math.floor(value / 60)}h ${String(value % 60).padStart(2, "0")}m`;
};

export const formatSigned = (value: number | null) =>
  value === null ? "n/a" : value > 0 ? `+${value.toLocaleString("en-US")}` : value.toLocaleString("en-US");
