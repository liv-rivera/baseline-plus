import type { DailyMetrics } from "@/types/metrics";

export const requiredCsvHeaders = ["date", "steps", "moveCalories", "restMinutes", "breatheMinutes"] as const;
export const templateHeaders = [...requiredCsvHeaders, "readinessScore"];

export const validateCsvHeaders = (fields: string[]): string[] => {
  if (requiredCsvHeaders.some(header => !fields.includes(header))
    || fields.some(header => !templateHeaders.includes(header))
    || new Set(fields).size !== fields.length) {
    return [`Required columns: ${requiredCsvHeaders.join(", ")}. Optional: readinessScore. Use each column once.`];
  }
  return [];
};

export const validateAndParseCsvRows = (
  rows: Record<string, string>[],
  existingDates: Set<string>,
): { errors: string[]; parsedMetrics: DailyMetrics[] } => {
  const errors: string[] = [];
  const incomingDates = new Set<string>();
  const parsedMetrics: DailyMetrics[] = [];

  rows.forEach((row, index) => {
    const before = errors.length;
    const report = (message: string) => errors.push(`Row ${index + 2}: ${message}`);
    const date = row.date?.trim() ?? "";
    const day = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000")
      || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) {
      report("date must be a real date in YYYY-MM-DD format.");
    }
    if (existingDates.has(date)) report(`${date} already exists in your data.`);
    if (incomingDates.has(date)) report(`${date} appears more than once in this file.`);
    incomingDates.add(date);

    function amount(field: string, max: number) {
      const raw = row[field]?.trim() ?? "";
      const value = Number(raw);
      if (!/^\d+$/.test(raw) || value > max) report(`${field} must be a non-negative whole number up to ${max}.`);
      return value;
    }

    const steps = amount("steps", 2147483647);
    const moveCalories = amount("moveCalories", 2147483647);
    const restMinutes = amount("restMinutes", 1440);
    const breatheMinutes = amount("breatheMinutes", 1440);
    const readinessScore = row.readinessScore?.trim() ? amount("readinessScore", 100) : null;
    if (errors.length === before) {
      parsedMetrics.push({
        date, source: "import", steps, moveCalories, restMinutes, breatheMinutes, readinessScore,
        activities: [], stepActivities: [], restPeriods: [], breathworkSessions: [],
      });
    }
  });

  return { errors, parsedMetrics };
};
