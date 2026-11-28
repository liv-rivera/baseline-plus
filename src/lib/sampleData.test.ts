import { describe, expect, it } from "vitest";
import { averageMetrics, generateSampleMetrics, isSampleFlareDay, SAMPLE_DAYS } from "./sampleData";
import { sportOf } from "./dashboardStats";
import { findPreset } from "./checkInPresets";

describe("sample data", () => {
  const rows = generateSampleMetrics("2026-11-27");

  it("covers six consecutive weeks ending on the given date", () => {
    expect(rows).toHaveLength(SAMPLE_DAYS);
    expect(rows[0].date).toBe("2026-10-17");
    expect(rows.at(-1)?.date).toBe("2026-11-27");
  });

  it("is the same every time for the same end date", () => {
    expect(generateSampleMetrics("2026-11-27")).toEqual(rows);
  });

  it("keeps daily totals equal to their contributions", () => {
    for (const row of rows) {
      expect(row.steps).toBe(row.stepActivities.reduce((sum, a) => sum + a.steps, 0));
      expect(row.moveCalories).toBe(row.activities.reduce((sum, a) => sum + a.calories, 0));
      expect(row.restMinutes).toBe(row.restPeriods.reduce((sum, r) => sum + r.durationMinutes, 0));
      expect(row.breatheMinutes).toBe(row.breathworkSessions.reduce((sum, b) => sum + b.durationMinutes, 0));
    }
  });

  it("includes every v1 sport and a lower-readiness flare week", () => {
    const sports = new Set(rows.flatMap((row) => row.activities.map((a) => sportOf(a.name))).filter(Boolean));
    expect([...sports].sort()).toEqual(["ride", "run", "strength", "swim", "yoga"]);
    const flare = rows.filter((_, i) => isSampleFlareDay(i)).map((row) => row.readinessScore ?? 0);
    const other = rows.filter((_, i) => !isSampleFlareDay(i)).map((row) => row.readinessScore ?? 0);
    expect(Math.max(...flare)).toBeLessThan(Math.min(...other));
  });

  it("averages whole-history values like the metrics API", () => {
    const avg = averageMetrics(rows);
    expect(avg.steps).toBe(Math.floor(rows.reduce((sum, r) => sum + (r.steps ?? 0), 0) / rows.length));
  });

  it("answers every POTS starter set field on each check-in, with lower salt and fluids in the flare", () => {
    const pots = findPreset("pots")!.fields.map((f) => [f.label, f.kind]);
    const checkIns = rows.flatMap((row, i) => (row.checkIn ? [{ i, symptoms: row.checkIn.symptoms ?? [] }] : []));
    expect(checkIns.length).toBeGreaterThan(20);
    for (const { symptoms } of checkIns) expect(symptoms.map((s) => [s.label, s.kind])).toEqual(pots);
    const salt = (flare: boolean) =>
      checkIns.filter(({ i }) => isSampleFlareDay(i) === flare).map(({ symptoms }) => symptoms.find((s) => s.label === "Salt")!.value as number);
    expect(Math.max(...salt(true))).toBeLessThan(3);
    for (const value of salt(false)) expect(value).toBeGreaterThanOrEqual(1);
  });
});
