import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyMetrics } from "@/types/metrics";

// Requires a reachable Postgres instance via DATABASE_URL (see .github/workflows/ci.yml's test-integration job).
const databaseUrl = process.env.DATABASE_URL;

const migrationFiles = [
  "001_initial_schema.sql",
  "002_provider_data_foundation.sql",
  "003_minimize_webhook_storage.sql",
  "004_auth.sql",
  "005_optional_readiness.sql",
];

const makeMetric = (date: string, overrides: Partial<DailyMetrics> = {}): DailyMetrics => ({
  date,
  steps: 1000,
  moveCalories: 200,
  restMinutes: 30,
  breatheMinutes: 10,
  readinessScore: 80,
  activities: [{ id: "a1", name: "Walk", durationMinutes: 20, calories: 200 }],
  stepActivities: [{ id: "s1", name: "Walk", durationMinutes: 20, steps: 1000 }],
  restPeriods: [{ id: "r1", name: "Nap", durationMinutes: 30 }],
  breathworkSessions: [{ id: "b1", name: "Breathe", durationMinutes: 10 }],
  ...overrides,
});

describe.runIf(databaseUrl)("metricsRepository (integration)", () => {
  let pool: Pool;
  let userId: string;
  const legacyUser = randomUUID();

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    pool = new Pool({ connectionString: databaseUrl });

    for (const file of migrationFiles) {
      const sql = readFileSync(path.join(__dirname, "..", "..", "database", "migrations", file), "utf8");
      if (file === "005_optional_readiness.sql") {
        await pool.query("INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Legacy')", [legacyUser, legacyUser + "@example.test"]);
        await pool.query(
          "INSERT INTO daily_metrics (id, user_id, metric_date, steps, move_calories, rest_minutes, breathwork_minutes, readiness_score) VALUES ($1, $2, '2026-09-01', 23, 12, 0, 0, 0)",
          [randomUUID(), legacyUser],
        );
      }
      await pool.query(sql);
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    userId = randomUUID();
    await pool.query(
      "INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)",
      [userId, `${userId}@example.com`, "Test User"],
    );
  });

  it("preserves a pre-migration record with a genuine zero score", async () => {
    const { readDailyMetrics } = await import("@/lib/metricsRepository");
    expect(await readDailyMetrics(legacyUser)).toMatchObject([{ date: "2026-09-01", steps: 23, readinessScore: 0 }]);
  });

  it.each(["", "owner@example.test"])("restricts new registrations at the database boundary (owner: %s)", async (owner) => {
    vi.stubEnv("BASELINE_OWNER_EMAIL", owner);
    try {
      const { auth } = await import("@/lib/auth");
      const email = randomUUID() + "@example.test";
      await auth.api.signUpEmail({ body: { email, name: "Not on list", password: randomUUID() } });
      expect((await pool.query("SELECT id FROM users WHERE email = $1", [email])).rowCount).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("inserts and reads back daily metrics with their contributions", async () => {
    const { insertDailyMetrics, readDailyMetrics, readMetricAverages } = await import("@/lib/metricsRepository");

    const inserted = await insertDailyMetrics(userId, [makeMetric("2026-01-01"), makeMetric("2026-01-02", { steps: 2000 })]);
    expect(inserted).toBe(2);

    const metrics = await readDailyMetrics(userId);
    expect(metrics).toHaveLength(2);
    expect(metrics[0].date).toBe("2026-01-01");
    expect(metrics[1].date).toBe("2026-01-02");
    expect(metrics[0].activities).toHaveLength(1);
    expect(metrics[0].stepActivities[0].steps).toBe(1000);

    const averages = await readMetricAverages(userId);
    expect(averages.steps).toBe(1500);
  });

  it("keeps missing scores and observed zeros separate across accounts sharing a date", async () => {
    const { readDailyMetrics, insertDailyMetrics } = await import("@/lib/metricsRepository");
    const other = randomUUID();
    await pool.query("INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Second fixture')", [other, other + "@example.test"]);
    const summary = makeMetric("2026-11-01", { activities: [], stepActivities: [], restPeriods: [], breathworkSessions: [], readinessScore: null });
    await insertDailyMetrics(userId, [summary]);
    await insertDailyMetrics(other, [{ ...summary, steps: 0, readinessScore: 0 }]);
    expect(await readDailyMetrics(userId)).toMatchObject([{ steps: 1000, readinessScore: null, activities: [] }]);
    expect(await readDailyMetrics(other)).toMatchObject([{ steps: 0, readinessScore: 0 }]);
  });

  it("throws DuplicateMetricDateError and rolls back when a date already exists", async () => {
    const { insertDailyMetrics, readDailyMetrics, DuplicateMetricDateError } = await import("@/lib/metricsRepository");

    await insertDailyMetrics(userId, [makeMetric("2026-01-01")]);
    await expect(
      insertDailyMetrics(userId, [makeMetric("2026-01-01"), makeMetric("2026-01-02")]),
    ).rejects.toThrow(DuplicateMetricDateError);

    // The batch should have been rolled back entirely: 2026-01-02 must not exist either.
    const metrics = await readDailyMetrics(userId);
    expect(metrics).toHaveLength(1);
    expect(metrics[0].date).toBe("2026-01-01");
  });

  it("returns zeroed averages for a user with no records", async () => {
    const { readMetricAverages } = await import("@/lib/metricsRepository");
    const averages = await readMetricAverages(userId);
    expect(averages).toEqual({ steps: 0, moveCalories: 0, restMinutes: 0, breatheMinutes: 0 });
  });
});
