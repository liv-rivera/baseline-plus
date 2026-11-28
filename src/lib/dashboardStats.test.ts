import { describe, expect, it } from "vitest";
import type { DailyMetrics } from "@/types/metrics";
import { checkInLine, formatMinutes, percentChange, priorMedian, recentSeries, recentSessions, sportOf, symptomText, trainingDays } from "./dashboardStats";

const day = (date: string, overrides: Partial<DailyMetrics> = {}): DailyMetrics => ({
  date, steps: 1000, moveCalories: 100, restMinutes: 400, breatheMinutes: 0, readinessScore: 70,
  activities: [], stepActivities: [], restPeriods: [], breathworkSessions: [], ...overrides,
});

describe("dashboard stats", () => {
  it("recognises sports from activity names and ignores walking", () => {
    expect(sportOf("Tempo run")).toBe("run");
    expect(sportOf("Zone 2 ride")).toBe("ride");
    expect(sportOf("Indoor cycling")).toBe("ride");
    expect(sportOf("Pool swim")).toBe("swim");
    expect(sportOf("Restorative yoga")).toBe("yoga");
    expect(sportOf("Strength (light)")).toBe("strength");
    expect(sportOf("Everyday walking")).toBeNull();
  });

  it("uses only the 28 days before the latest record for the median, and needs four of them", () => {
    const rows = [day("2026-01-01", { steps: 99999 }), day("2026-02-01", { steps: 100 }), day("2026-02-02", { steps: 200 }), day("2026-02-03", { steps: 300 })];
    const latest = day("2026-02-05", { steps: 500 });
    expect(priorMedian([...rows, latest], latest, "steps")).toBeNull();
    const more = [...rows, day("2026-02-04", { steps: 400 }), latest];
    expect(priorMedian(more, latest, "steps")).toBe(250);
    expect(percentChange(500, 250)).toBe(100);
    expect(percentChange(500, null)).toBeNull();
  });

  it("fills missing calendar days with null in series and training days", () => {
    const rows = [day("2026-02-01"), day("2026-02-03", { activities: [{ id: "a", name: "Easy run", durationMinutes: 30, calories: 300 }], checkIn: { energy: 2, soreness: 3 } })];
    expect(recentSeries(rows, rows[1], "steps", 3)).toEqual([1000, null, 1000]);
    const days = trainingDays(rows, rows[1], 3);
    expect(days.map((d) => d.date)).toEqual(["2026-02-01", "2026-02-02", "2026-02-03"]);
    expect(days[2]).toMatchObject({ lowEnergy: true, sessions: [{ sport: "run", minutes: 30 }] });
    expect(days[2].checkIn).toBe("Energy 2/5 · Soreness 3/5");
    expect(days[1].checkIn).toBeNull();
    expect(recentSessions(rows)).toEqual([
      { date: "2026-02-03", sport: "run", name: "Easy run", minutes: 30, calories: 300, checkIn: "Energy 2 · Soreness 3" },
    ]);
  });

  it("writes a check-in as one line, with only scores beside a workout", () => {
    const checkIn = {
      energy: null,
      soreness: 2,
      symptoms: [
        { label: "Dizziness", kind: "score" as const, value: 4 },
        { label: "Flare today", kind: "yes_no" as const, value: true },
        { label: "Fluids", kind: "number" as const, value: 2.5, unit: "L" },
        { label: "Reps", kind: "number" as const, value: 1200, unit: null },
      ],
    };
    expect(checkInLine(checkIn)).toBe("Soreness 2/5 · Dizziness 4/5 · Flare today: yes · Fluids 2.5 L · Reps 1,200");
    expect(checkInLine(checkIn, { scoresOnly: true })).toBe("Soreness 2 · Dizziness 4");
    expect(checkInLine({ energy: null, soreness: null, symptoms: [] })).toBeNull();
    expect(checkInLine(undefined)).toBeNull();
    expect(symptomText({ label: "Meds taken", kind: "yes_no", value: false })).toBe("Meds taken: no");
  });

  it("formats minutes as hours and minutes", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(417)).toBe("6h 57m");
    expect(formatMinutes(null)).toBe("—");
  });
});
