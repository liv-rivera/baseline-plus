import type { DailyMetrics } from "@/types/metrics";
type Metric = "steps" | "moveCalories" | "restMinutes" | "breatheMinutes";
function previousDay(date: string, offset: number) {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}
export function personalRecap(
  rows: DailyMetrics[],
  anchor: DailyMetrics,
  window: 7 | 28,
  metric: Metric,
) {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  function period(start: number, length: number, minimum: number) {
    const days = Array.from({ length }, (_, i) =>
      previousDay(anchor.date, start + i),
    );
    const observations = days.flatMap((date) => {
      const row = byDate.get(date);
      const value = row?.[metric];
      return row &&
        value !== null && value !== undefined &&
        row.source === anchor.source &&
        (anchor.source === "manual" ||
          Boolean(row.manuallyCorrected) === Boolean(anchor.manuallyCorrected))
        ? [{ date, value, checkedIn: Boolean(row.checkIn) }]
        : [];
    });
    const values = observations.map((o) => o.value).sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    const median =
      values.length < minimum
        ? null
        : values.length % 2
          ? values[mid]
          : (values[mid - 1] + values[mid]) / 2;
    return {
      start: days[length - 1],
      end: days[0],
      observations,
      median,
      checkInCount: observations.filter((day) => day.checkedIn).length,
      gaps: days.filter((date) => !observations.some((o) => o.date === date)),
    };
  }
  return {
    reference: period(1, window, window === 7 ? 4 : 14),
    week: period(0, 7, 4),
    previousWeek: period(7, 7, 4),
  };
}
