import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Averages, DailyMetrics } from "@/types/metrics";

const useDailyMetricsMock = vi.fn();

vi.mock("@/lib/useDailyMetrics", () => ({
  useDailyMetrics: () => useDailyMetricsMock(),
}));
vi.mock("@/components/UserDetailsPopup", () => ({ UserDetailsPopup: () => null }));

const { default: Home } = await import("./page");

const emptyAverages: Averages = { steps: 0, moveCalories: 0, restMinutes: 0, breatheMinutes: 0 };

const makeMetric = (date: string, overrides: Partial<DailyMetrics> = {}): DailyMetrics => ({
  date,
  steps: 0,
  moveCalories: 0,
  restMinutes: 0,
  breatheMinutes: 0,
  readinessScore: 0,
  activities: [],
  stepActivities: [],
  restPeriods: [],
  breathworkSessions: [],
  ...overrides,
});

describe("Home dashboard page", () => {
  it("shows a loading state", () => {
    useDailyMetricsMock.mockReturnValue({ metrics: [], averages: emptyAverages, loading: true, error: null });
    render(<Home />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading dashboard");
  });

  it("shows an error state", () => {
    useDailyMetricsMock.mockReturnValue({ metrics: [], averages: emptyAverages, loading: false, error: "Database unavailable" });
    render(<Home />);
    expect(screen.getByRole("alert")).toHaveTextContent("Try loading your records again.");
  });

  it("shows a no-data state when there are no metrics", () => {
    useDailyMetricsMock.mockReturnValue({ metrics: [], averages: emptyAverages, loading: false, error: null });
    render(<Home />);
    expect(screen.getByText("No metric records yet")).toBeInTheDocument();
  });

  it.each([null, 0] as const)("renders imported readiness %s without confusing missing data with zero", (score) => {
    useDailyMetricsMock.mockReturnValue({ metrics: [makeMetric("2026-11-01", { readinessScore: score, source: "import" })],
      averages: emptyAverages, loading: false, error: null });
    render(<Home />);
    if (score === null) {
      expect(screen.queryByRole("img", { name: /readiness score/i })).toBeNull();
      expect(screen.getByText("No score recorded for this date.")).toBeVisible();
    } else {
      expect(screen.getByText("Score supplied in your import")).toBeVisible();
      expect(screen.getByRole("img", { name: "Readiness score: 0 out of 100" })).toBeVisible();
    }
    expect(screen.getByText("LATEST VS. FULL-HISTORY AVERAGE")).toBeVisible();
  });

  it("renders trend and change values relative to the average and previous record", () => {
    const metrics = [
      makeMetric("2026-01-01", { steps: 1000, moveCalories: 200, restMinutes: 30, breatheMinutes: 10, readinessScore: 70 }),
      makeMetric("2026-01-02", { steps: 1200, moveCalories: 150, restMinutes: 30, breatheMinutes: 15, readinessScore: 80 }),
    ];
    const averages: Averages = { steps: 1100, moveCalories: 180, restMinutes: 30, breatheMinutes: 12 };
    useDailyMetricsMock.mockReturnValue({ metrics, averages, loading: false, error: null });

    render(<Home />);

    // Latest record values
    expect(screen.getByText("1,200")).toBeInTheDocument();
    // Trend: latest (1200) - previous (1000) = +200
    expect(screen.getByText("+200")).toBeInTheDocument();
    // Change: latest (1200) - average (1100) = +100
    expect(screen.getByText("+100")).toBeInTheDocument();
  });
});
