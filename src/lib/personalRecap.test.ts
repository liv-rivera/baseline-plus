import { it, expect } from "vitest";
import { personalRecap } from "./personalRecap";
import type { DailyMetrics } from "@/types/metrics";
const record = (
  date: string,
  steps: number,
  source: DailyMetrics["source"] = "manual",
) => ({ date, steps, source }) as DailyMetrics;
it("compares recorded calendar days across the year boundary and excludes the anchor and other sources", () => {
  const latest = record("2026-01-02", 1000);
  const rows = [
    latest,
    record("2026-01-01", 0),
    record("2025-12-31", 10),
    record("2025-12-29", 20),
    record("2025-12-27", 90),
    record("2025-12-26", 180, "import"),
    record("2025-12-25", 200),
  ];
  const result = personalRecap(rows, latest, 7, "steps");
  expect(result.reference.median).toBe(15);
  expect(result.reference.gaps).toEqual([
    "2025-12-30",
    "2025-12-28",
    "2025-12-26",
  ]);
  expect(result.previousWeek.median).toBeNull();
  expect(personalRecap(rows, latest, 28, "steps").reference.median).toBeNull();
});

it("reports weekly medians and check-in coverage with sparse context", () => {
  const rows = Array.from({ length: 14 }, (_, i) => ({
    ...record("2026-11-" + String(i + 1).padStart(2, "0"), i),
    ...(i === 13 && { checkIn: { energy: 3, soreness: null } }),
  }));
  const recap = personalRecap(rows, rows[13], 7, "steps");
  expect(recap.week).toMatchObject({ median: 10, checkInCount: 1, gaps: [] });
  expect(recap.previousWeek).toMatchObject({
    median: 3,
    checkInCount: 0,
    gaps: [],
  });
  expect(
    recap.reference.observations.some((day) => day.date === rows[13].date),
  ).toBe(false);
});
