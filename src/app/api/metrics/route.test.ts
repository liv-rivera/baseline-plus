import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyMetrics } from "@/types/metrics";

const getRequestSessionMock = vi.fn();
const readDailyMetricsMock = vi.fn();
const readMetricAveragesMock = vi.fn();
const insertDailyMetricsMock = vi.fn();
const insertNewDailyMetricsMock = vi.fn();

vi.mock("@/lib/auth-session", () => ({
  getRequestSession: (headers: Headers) => getRequestSessionMock(headers),
}));

vi.mock("@/lib/metricsRepository", async () => {
  const actual = await vi.importActual<typeof import("@/lib/metricsRepository")>("@/lib/metricsRepository");
  return {
    ...actual,
    readDailyMetrics: (...args: unknown[]) => readDailyMetricsMock(...args),
    readMetricAverages: (...args: unknown[]) => readMetricAveragesMock(...args),
    insertDailyMetrics: (...args: unknown[]) => insertDailyMetricsMock(...args),
    insertNewDailyMetrics: (...args: unknown[]) => insertNewDailyMetricsMock(...args),
  };
});

const { GET, POST } = await import("./route");
const { DatabaseConfigurationError } = await import("@/lib/database");
const { DuplicateMetricDateError } = await import("@/lib/metricsRepository");

const validRecord = {
  date: "2026-01-01",
  steps: 1000,
  moveCalories: 200,
  restMinutes: 30,
  breatheMinutes: 10,
  readinessScore: 80,
  activities: [{ name: "Walk", durationMinutes: 20, calories: 200 }],
  stepActivities: [{ name: "Walk", durationMinutes: 20, steps: 1000 }],
  restPeriods: [{ name: "Nap", durationMinutes: 30 }],
  breathworkSessions: [{ name: "Breathe", durationMinutes: 10 }],
};

const postRequest = (body: unknown, query = "") => new Request(`http://localhost/api/metrics${query}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  getRequestSessionMock.mockReset().mockResolvedValue({ user: { id: "user-1" } });
  readDailyMetricsMock.mockReset();
  readMetricAveragesMock.mockReset();
  insertDailyMetricsMock.mockReset();
  insertNewDailyMetricsMock.mockReset();
});

describe("GET /api/metrics", () => {
  it("returns metrics and averages on success", async () => {
    const metrics: DailyMetrics[] = [];
    const averages = { steps: 0, moveCalories: 0, restMinutes: 0, breatheMinutes: 0 };
    readDailyMetricsMock.mockResolvedValueOnce(metrics);
    readMetricAveragesMock.mockResolvedValueOnce(averages);

    const response = await GET(new Request("http://localhost/api/metrics"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ metrics, averages });
    expect(readDailyMetricsMock).toHaveBeenCalledWith("user-1");
    expect(readMetricAveragesMock).toHaveBeenCalledWith("user-1");
  });

  it("returns 401 and does not read metrics when there is no session", async () => {
    getRequestSessionMock.mockResolvedValueOnce(null);

    const response = await GET(new Request("http://localhost/api/metrics"));
    expect(response.status).toBe(401);
    expect(readDailyMetricsMock).not.toHaveBeenCalled();
    expect(readMetricAveragesMock).not.toHaveBeenCalled();
  });

  it("returns 503 when reading metrics throws an unexpected error", async () => {
    readDailyMetricsMock.mockRejectedValueOnce(new Error("connection reset"));
    readMetricAveragesMock.mockResolvedValueOnce({ steps: 0, moveCalories: 0, restMinutes: 0, breatheMinutes: 0 });

    const response = await GET(new Request("http://localhost/api/metrics"));
    expect(response.status).toBe(503);
  });
});

describe("POST /api/metrics", () => {
  it("returns 201 with the inserted count on success", async () => {
    insertDailyMetricsMock.mockResolvedValueOnce(1);
    const response = await POST(postRequest([validRecord]));
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ inserted: 1 });
    expect(insertDailyMetricsMock).toHaveBeenCalledWith("user-1", expect.any(Array));
  });

  it("returns 401 and does not insert metrics when there is no session", async () => {
    getRequestSessionMock.mockResolvedValueOnce(null);

    const response = await POST(postRequest([validRecord]));
    expect(response.status).toBe(401);
    expect(insertDailyMetricsMock).not.toHaveBeenCalled();
  });

  it("requires a new preview if the active account changed", async () => {
    const request = postRequest([validRecord]);
    request.headers.set("X-Baseline-Preview-Owner", "other-user");
    expect((await POST(request)).status).toBe(409);
    expect(insertDailyMetricsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the payload is not an array", async () => {
    const response = await POST(postRequest({ not: "an array" }));
    expect(response.status).toBe(400);
  });

  it("limits the number of individual activities per metric per day", async () => {
    expect((await POST(postRequest([{ ...validRecord, activities: Array(501).fill(validRecord.activities[0]) }]))).status).toBe(400);
    expect(insertDailyMetricsMock).not.toHaveBeenCalled();
  });

  it("rejects oversized imports even without a content-length header", async () => {
    const request = postRequest("a".repeat(5 * 1024 * 1024));
    expect((await POST(request)).status).toBe(413);
    expect(insertDailyMetricsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the payload is empty", async () => {
    const response = await POST(postRequest([]));
    expect(response.status).toBe(400);
  });

  it("returns 400 for an invalid date format", async () => {
    const response = await POST(postRequest([{ ...validRecord, date: "01-01-2026" }]));
    expect(response.status).toBe(400);
  });

  it("returns 400 for an impossible calendar date", async () => {
    const response = await POST(postRequest([{ ...validRecord, date: "2026-02-30" }]));
    expect(response.status).toBe(400);
  });

  it("accepts a summary without events or an external score", async () => {
    const summary = { ...validRecord, readinessScore: undefined, activities: [], stepActivities: [], restPeriods: [], breathworkSessions: [] };
    expect((await POST(postRequest([summary]))).status).toBe(201);
    expect(insertDailyMetricsMock).toHaveBeenCalledWith("user-1", [expect.objectContaining({ steps: 1000, readinessScore: null, activities: [] })]);
  });

  it("returns 400 when readinessScore is out of bounds", async () => {
    const response = await POST(postRequest([{ ...validRecord, readinessScore: 150 }]));
    expect(response.status).toBe(400);
  });

  it("returns 400 when a metric field is negative", async () => {
    const response = await POST(postRequest([{ ...validRecord, steps: -1 }]));
    expect(response.status).toBe(400);
  });

  it("returns 400 when contribution totals don't sum to the daily total", async () => {
    const response = await POST(postRequest([{
      ...validRecord,
      activities: [{ name: "Walk", durationMinutes: 20, calories: 999 }],
    }]));
    expect(response.status).toBe(400);
  });

  it("returns 400 for duplicate dates within the same request", async () => {
    const response = await POST(postRequest([validRecord, validRecord]));
    expect(response.status).toBe(400);
  });

  it("returns 409 when the repository reports a duplicate date", async () => {
    insertDailyMetricsMock.mockRejectedValueOnce(new DuplicateMetricDateError());
    const response = await POST(postRequest([validRecord]));
    expect(response.status).toBe(409);
  });

  it("returns 503 when the database configuration is invalid", async () => {
    insertDailyMetricsMock.mockRejectedValueOnce(new DatabaseConfigurationError("DATABASE_URL is not configured."));
    const response = await POST(postRequest([validRecord]));
    expect(response.status).toBe(503);
  });

  it("returns 503 when insertion fails unexpectedly", async () => {
    insertDailyMetricsMock.mockRejectedValueOnce(new Error("connection reset"));
    const response = await POST(postRequest([validRecord]));
    expect(response.status).toBe(503);
  });

  describe("Apple Health days", () => {
    const appleHealthDay = {
      date: "2026-11-03",
      source: "apple_health",
      steps: 2100,
      moveCalories: 29,
      restMinutes: null,
      breatheMinutes: null,
      readinessScore: null,
      activities: [],
      stepActivities: [],
      restPeriods: [],
      breathworkSessions: [],
    };

    it("keeps blank totals and the source label", async () => {
      insertDailyMetricsMock.mockResolvedValueOnce(1);
      expect((await POST(postRequest([appleHealthDay]))).status).toBe(201);
      expect(insertDailyMetricsMock).toHaveBeenCalledWith("user-1", [
        expect.objectContaining({ source: "apple_health", steps: 2100, restMinutes: null, breatheMinutes: null }),
      ]);
    });

    it("skips days already saved when asked, and says which", async () => {
      insertNewDailyMetricsMock.mockResolvedValueOnce({ inserted: 0, skippedDates: ["2026-11-03"] });
      const response = await POST(postRequest([appleHealthDay], "?existing=skip"));
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({ inserted: 0, skipped: ["2026-11-03"] });
      expect(insertDailyMetricsMock).not.toHaveBeenCalled();
    });

    it("still requires every total on CSV rows", async () => {
      const response = await POST(postRequest([{ ...validRecord, restMinutes: null }]));
      expect(response.status).toBe(400);
    });

    it("rejects a day with no totals at all", async () => {
      const empty = { ...appleHealthDay, steps: null, moveCalories: null };
      const response = await POST(postRequest([empty]));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "2026-11-03 needs at least one daily total." });
    });

    it("rejects a contribution list for a blank total", async () => {
      const response = await POST(postRequest([{ ...appleHealthDay, restPeriods: [{ name: "Nap", durationMinutes: 20 }] }]));
      expect(response.status).toBe(400);
    });

    it("rejects unknown sources", async () => {
      const response = await POST(postRequest([{ ...appleHealthDay, source: "garmin" }]));
      expect(response.status).toBe(400);
    });
  });
});
