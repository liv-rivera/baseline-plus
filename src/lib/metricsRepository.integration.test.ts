import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { DailyMetrics } from "@/types/metrics";
import { collectAppleHealthXml } from "./appleHealth/collector";

// Requires a reachable Postgres instance via DATABASE_URL (see .github/workflows/ci.yml's test-integration job).
const databaseUrl = process.env.DATABASE_URL;

const migrationFiles = [
  "001_initial_schema.sql",
  "002_provider_data_foundation.sql",
  "003_minimize_webhook_storage.sql",
  "004_auth.sql",
  "005_optional_readiness.sql",
  "006_check_ins.sql",
  "007_apple_health_source.sql",
];

const makeMetric = (
  date: string,
  overrides: Partial<DailyMetrics> = {},
): DailyMetrics => ({
  date,
  steps: 1000,
  moveCalories: 200,
  restMinutes: 30,
  breatheMinutes: 10,
  readinessScore: 80,
  activities: [{ id: "a1", name: "Walk", durationMinutes: 20, calories: 200 }],
  stepActivities: [
    { id: "s1", name: "Walk", durationMinutes: 20, steps: 1000 },
  ],
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
      const sql = readFileSync(
        path.join(__dirname, "..", "..", "database", "migrations", file),
        "utf8",
      );
      if (file === "005_optional_readiness.sql") {
        await pool.query(
          "INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Legacy')",
          [legacyUser, legacyUser + "@example.test"],
        );
        await pool.query(
          "INSERT INTO daily_metrics (id, user_id, metric_date, steps, move_calories, rest_minutes, breathwork_minutes, readiness_score) VALUES ($1, $2, '2026-09-01', 23, 12, 0, 0, 0)",
          [randomUUID(), legacyUser],
        );
      }
      await pool.query(sql);
    }
    await pool.query(
      readFileSync(
        path.join(__dirname, "..", "..", "database", "seed.sql"),
        "utf8",
      ),
    );
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

  function entry(values: Record<string, string>) {
    const form = new FormData();
    for (const [key, value] of Object.entries(values)) form.set(key, value);
    return form;
  }

  it("deletes all of one person's records but keeps their account", async () => {
    const { insertDailyMetrics, readDailyMetrics } = await import("./metricsRepository");
    const { changeDay } = await import("./journal");
    const { deleteAllRecords } = await import("./deleteAllData");
    const otherUser = randomUUID();
    await pool.query(
      "INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Other')",
      [otherUser, `${otherUser}@example.com`],
    );
    await insertDailyMetrics(userId, [makeMetric("2026-10-01"), makeMetric("2026-10-02")]);
    await insertDailyMetrics(otherUser, [makeMetric("2026-10-01")]);
    expect(
      await changeDay(userId, entry({ date: "2026-10-01", action: "context", energy: "3", note: "" })),
    ).toBe("Saved.");

    expect(await deleteAllRecords(userId)).toEqual({ days: 2 });

    expect(await readDailyMetrics(userId)).toEqual([]);
    const leftovers = await pool.query(
      `SELECT (SELECT count(*) FROM daily_check_ins WHERE user_id=$1)::int AS check_ins,
              (SELECT count(*) FROM metric_contributions c JOIN daily_metrics m ON m.id=c.daily_metric_id WHERE m.user_id=$1)::int AS contributions,
              (SELECT count(*) FROM users WHERE id=$1)::int AS account`,
      [userId],
    );
    expect(leftovers.rows[0]).toEqual({ check_ins: 0, contributions: 0, account: 1 });
    expect(await readDailyMetrics(otherUser)).toHaveLength(1);
  });

  it("keeps check-ins independent and rejects stale, conflicting and unconfirmed changes", async () => {
    const { changeDay, readDay } = await import("./journal");
    const date = "2026-11-02";
    const checkIn = {
      date,
      action: "context",
      energy: "2",
      note: "Fixture only",
    };
    expect(await changeDay(userId, entry(checkIn))).toBe("Saved.");
    const first = await readDay(userId, date);
    expect(first.metric).toBeUndefined();
    expect(first.checkIn).toMatchObject({ energy: 2, soreness: null });
    expect(await changeDay(userId, entry(checkIn))).toMatch(/Reload/);
    expect(
      await changeDay(
        legacyUser,
        entry({ ...checkIn, revision: first.checkIn.revision }),
      ),
    ).toMatch(/Reload/);
    expect(
      await changeDay(
        userId,
        entry({ ...checkIn, revision: first.checkIn.revision, energy: "3" }),
      ),
    ).toBe("Saved.");
    expect(
      await changeDay(
        userId,
        entry({ ...checkIn, revision: first.checkIn.revision }),
      ),
    ).toMatch(/Reload/);
    const totals = {
      date,
      action: "metric",
      steps: "0",
      calories: "0",
      rest: "20",
      breathe: "0",
    };
    expect(await changeDay(userId, entry(totals))).toBe("Saved.");
    const current = await readDay(userId, date);
    expect(current.metric).toMatchObject({ source: "manual", steps: 0 });
    expect(
      await changeDay(
        userId,
        entry({ ...totals, steps: "123", revision: current.metric.revision }),
      ),
    ).toBe("Saved.");
    const remove = {
      date,
      action: "delete-metric",
      revision: (await readDay(userId, date)).metric.revision,
    };
    expect(await changeDay(userId, entry(remove))).toMatch(/Confirm/);
    expect(await changeDay(userId, entry({ ...remove, confirm: "yes" }))).toBe(
      "Saved.",
    );
    expect((await readDay(userId, date)).checkIn.energy).toBe(3);
    expect(
      await changeDay(
        userId,
        entry({
          date,
          action: "delete-context",
          revision: current.checkIn.revision,
          confirm: "yes",
        }),
      ),
    ).toBe("Saved.");
    expect((await readDay(userId, date)).checkIn).toBeUndefined();
  });

  it("imports an Apple Health export twice without touching days already saved", async () => {
    const { insertNewDailyMetrics, readDailyMetrics, readMetricAverages } = await import("./metricsRepository");
    const { changeDay, readDay } = await import("./journal");
    const xml = readFileSync(path.join(__dirname, "..", "test", "fixtures", "apple-health", "export.xml"), "utf8");
    const toMetrics = (days: ReturnType<typeof collectAppleHealthXml>["days"]): DailyMetrics[] =>
      days.map((day) => ({
        date: day.date,
        steps: day.steps,
        moveCalories: day.moveCalories,
        restMinutes: day.restMinutes,
        breatheMinutes: day.breatheMinutes,
        source: "apple_health",
        readinessScore: null,
        activities: [],
        stepActivities: [],
        restPeriods: [],
        breathworkSessions: [],
      }));
    const { days } = collectAppleHealthXml(xml);

    // The first export covers 2 to 4 Nov. 3 Nov is corrected by hand afterwards.
    expect(await insertNewDailyMetrics(userId, toMetrics(days.slice(0, 3)))).toEqual({ inserted: 3, skippedDates: [] });
    const corrected = await readDay(userId, "2026-11-03");
    expect(corrected.metric).toMatchObject({ steps: 2100, rest: null, breathe: null });
    expect(await changeDay(userId, entry({
      date: "2026-11-03", action: "metric", revision: corrected.metric.revision,
      steps: "2200", calories: "29", rest: "", breathe: "",
    }))).toBe("Saved.");

    // A newer export overlaps those days and adds 5 Nov.
    expect(await insertNewDailyMetrics(userId, toMetrics(days))).toEqual({
      inserted: 1,
      skippedDates: ["2026-11-02", "2026-11-03", "2026-11-04"],
    });

    const saved = await readDailyMetrics(userId);
    expect(saved.map((day) => [day.date, day.source, day.steps, day.restMinutes])).toEqual([
      ["2026-11-02", "apple_health", 5500, 440],
      ["2026-11-03", "apple_health", 2200, null],
      ["2026-11-04", "apple_health", 6800, null],
      ["2026-11-05", "apple_health", 3000, 420],
    ]);
    expect(saved[1].manuallyCorrected).toBe(true);
    // Blank totals are left out of averages rather than counted as zero.
    expect((await readMetricAverages(userId)).restMinutes).toBe(430);
  });

  it("rejects a day with no totals at all and sources it doesn't know", async () => {
    const id = () => randomUUID();
    await expect(pool.query(
      "INSERT INTO daily_metrics (id, user_id, metric_date, source) VALUES ($1, $2, '2026-11-09', 'apple_health')",
      [id(), userId],
    )).rejects.toThrow(/daily_metrics_has_a_total_check/);
    await expect(pool.query(
      "INSERT INTO daily_metrics (id, user_id, metric_date, steps, source) VALUES ($1, $2, '2026-11-09', 10, 'garmin')",
      [id(), userId],
    )).rejects.toThrow(/daily_metrics_source_check/);
  });

  it("keeps absent check-ins absent and resolves concurrent saves without overwriting", async () => {
    const { changeDay, readDay } = await import("./journal");
    const date = "2026-04-10";
    expect((await readDay(userId, date)).checkIn).toBeUndefined();
    const values = { date, action: "context", note: "Synthetic only" };
    const saves = await Promise.all([
      changeDay(userId, entry(values)),
      changeDay(userId, entry(values)),
    ]);
    expect(saves.filter((value) => value === "Saved.")).toHaveLength(1);
    expect(
      (
        await pool.query(
          "SELECT 1 FROM daily_check_ins WHERE user_id=$1 AND local_date=$2",
          [userId, date],
        )
      ).rowCount,
    ).toBe(1);
    expect(await changeDay(userId, entry({ date, action: "context" }))).toMatch(
      /Choose/,
    );
    expect((await readDay(legacyUser, date)).checkIn).toBeUndefined();
  });

  it("removes a detailed day and all its contributions without changing another account", async () => {
    const { insertDailyMetrics } = await import("./metricsRepository");
    const { changeDay, readDay } = await import("./journal");
    const date = "2026-04-11";
    await insertDailyMetrics(userId, [makeMetric(date)]);
    const id = (
      await pool.query(
        "SELECT id FROM daily_metrics WHERE user_id=$1 AND metric_date=$2",
        [userId, date],
      )
    ).rows[0].id;
    const metric = (await readDay(userId, date)).metric;
    expect(
      await changeDay(
        legacyUser,
        entry({
          date,
          action: "delete-metric",
          revision: metric.revision,
          confirm: "yes",
        }),
      ),
    ).toMatch(/Reload/);
    expect(
      await changeDay(
        userId,
        entry({
          date,
          action: "delete-metric",
          revision: metric.revision,
          confirm: "yes",
        }),
      ),
    ).toBe("Saved.");
    expect(
      (
        await pool.query(
          "SELECT 1 FROM metric_contributions WHERE daily_metric_id=$1",
          [id],
        )
      ).rowCount,
    ).toBe(0);
  });

  it("preserves the original source and readiness score on a manual correction to an import", async () => {
    const { changeDay, readDay } = await import("./journal");
    const { insertDailyMetrics, readDailyMetrics } =
      await import("./metricsRepository");
    const date = "2026-06-05";
    await insertDailyMetrics(userId, [
      makeMetric(date, {
        activities: [],
        stepActivities: [],
        restPeriods: [],
        breathworkSessions: [],
      }),
    ]);
    const before = await readDay(userId, date);
    expect(
      await changeDay(
        userId,
        entry({
          date,
          action: "metric",
          revision: before.metric.revision,
          steps: "34",
          calories: "10",
          rest: "20",
          breathe: "5",
        }),
      ),
    ).toBe("Saved.");
    expect(await readDailyMetrics(userId)).toMatchObject([
      {
        date,
        source: "import",
        readinessScore: 80,
        manuallyCorrected: true,
        steps: 34,
      },
    ]);
  });

  it("exports a signed-in fixture and requires its password and confirmation for cascading deletion", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "synthetic-test-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "synthetic-test-secret");
    const { hashPassword } = await import("better-auth/crypto");
    const { auth } = await import("./auth");
    const { GET } = await import("@/app/api/export/route");
    const { changeDay } = await import("./journal");
    const password = randomUUID();
    await pool.query("UPDATE users SET email_verified=true WHERE id=$1", [
      userId,
    ]);
    await pool.query(
      "INSERT INTO user_accounts(id,account_id,provider_id,user_id,password) VALUES($1,$2,'credential',$2::text::uuid,$3)",
      [randomUUID(), userId, await hashPassword(password)],
    );
    const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    async function call(
      path: string,
      body: object,
      headers: Record<string, string> = {},
    ) {
      return auth.handler(
        new Request(origin + "/api/auth/" + path, {
          method: "POST",
          headers: { "content-type": "application/json", origin, ...headers },
          body: JSON.stringify(body),
        }),
      );
    }
    const login = await call("sign-in/email", {
      email: userId + "@example.com",
      password,
    });
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const request = new Request(origin + "/api/export", {
      headers: { cookie },
    });
    const date = "2026-11-03";
    await changeDay(
      userId,
      entry({ date, action: "context", note: "Owned fixture" }),
    );
    await changeDay(
      legacyUser,
      entry({ date, action: "context", note: "Other fixture" }),
    );
    expect((await GET(new Request(origin + "/api/export"))).status).toBe(401);
    const { insertDailyMetrics } = await import("./metricsRepository");
    await insertDailyMetrics(userId, [makeMetric(date)]);
    const response = await GET(request);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({
      metrics: [
        {
          date,
          steps: 1000,
          source: "import",
          move_kcal: 200,
          contributions: expect.arrayContaining([
            expect.objectContaining({ type: "steps", quantity: 1000 }),
          ]),
        },
      ],
      check_ins: [{ date, note: "Owned fixture" }],
    });
    expect(
      (await call("unlink-account", { accountId: "other" }, { cookie })).status,
    ).toBe(403);
    expect(
      (
        await call(
          "link-social",
          { provider: "google", scopes: ["email"] },
          { cookie },
        )
      ).status,
    ).toBe(400);
    // Exercise Better Auth state, session and account persistence locally. Only the
    // two network calls to Google are replaced with deterministic fixture data.
    const ctx = await auth.$context;
    const google = ctx.socialProviders.find((p) => p.id === "google")!;
    const subject = randomUUID();
    let email = userId + "@example.com";
    let verified = true;
    const exchange = vi
      .spyOn(google, "validateAuthorizationCode")
      .mockResolvedValue({ accessToken: "synthetic-token" });
    const profile = vi
      .spyOn(google, "getUserInfo")
      .mockImplementation(async () => ({
        data: { sub: subject },
        user: { name: "Synthetic Google", email, emailVerified: verified },
      }));
    async function flow(path: string, cancel = false) {
      const begin = await call(
        path,
        {
          provider: "google",
          callbackURL: "/home",
          errorCallbackURL: "/?failed=1",
          disableRedirect: true,
        },
        { cookie },
      );
      expect(begin.status).toBe(200);
      const url = new URL((await begin.json()).url);
      expect(url.searchParams.get("scope")?.split(" ").sort()).toEqual([
        "email",
        "openid",
        "profile",
      ]);
      const stateCookie = begin.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      const callback = new URL(origin + "/api/auth/callback/google");
      callback.searchParams.set("state", url.searchParams.get("state")!);
      callback.searchParams.set(
        cancel ? "error" : "code",
        cancel ? "access_denied" : "synthetic-code",
      );
      const finish = () =>
        auth.handler(
          new Request(callback, {
            headers: { cookie: cookie + "; " + stateCookie },
          }),
        );
      return { result: await finish(), repeat: finish };
    }
    async function linkedAccounts() {
      return (
        await pool.query(
          "SELECT id,user_id FROM user_accounts WHERE provider_id='google' AND account_id=$1",
          [subject],
        )
      ).rows;
    }
    try {
      await flow("sign-in/social");
      expect(await linkedAccounts()).toEqual([]);
      await flow("link-social", true);
      expect(await linkedAccounts()).toEqual([]);
      email = legacyUser + "@example.test";
      await flow("link-social");
      expect(await linkedAccounts()).toEqual([]);
      email = userId + "@example.com";
      verified = false;
      await flow("link-social");
      expect(await linkedAccounts()).toEqual([]);
      verified = true;
      await pool.query(
        "INSERT INTO user_accounts(id,user_id,provider_id,account_id) VALUES($1,$2,'google',$3)",
        [randomUUID(), legacyUser, subject],
      );
      await flow("link-social");
      expect(await linkedAccounts()).toMatchObject([{ user_id: legacyUser }]);
      await pool.query(
        "DELETE FROM user_accounts WHERE user_id=$1 AND provider_id='google'",
        [legacyUser],
      );
      const linked = await flow("link-social");
      expect(await linkedAccounts()).toMatchObject([{ user_id: userId }]);
      await linked.repeat();
      const accounts = await linkedAccounts();
      expect(accounts).toHaveLength(1);
      const signedIn = await flow("sign-in/social");
      const googleCookie = signedIn.result.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ");
      expect(
        (
          await auth.api.getSession({
            headers: new Headers({ cookie: googleCookie }),
          })
        )?.user.id,
      ).toBe(userId);
      expect(
        (
          await call(
            "unlink-account",
            { accountId: accounts[0].id },
            { cookie },
          )
        ).status,
      ).toBe(200);
      expect(await linkedAccounts()).toEqual([]);
    } finally {
      profile.mockRestore();
      exchange.mockRestore();
      vi.unstubAllEnvs();
    }
    await pool.query(
      "UPDATE user_sessions SET created_at=now()-interval '6 minutes' WHERE user_id=$1",
      [userId],
    );
    expect(
      (await call("link-social", { provider: "google" }, { cookie })).status,
    ).toBe(403);
    const confirmed = { cookie, "x-baseline-confirm-deletion": userId };
    expect((await call("delete-user", { password }, { cookie })).status).toBe(
      403,
    );
    expect((await call("delete-user", {}, confirmed)).status).toBe(403);
    expect(
      (await call("delete-user", { password: "incorrect" }, confirmed)).ok,
    ).toBe(false);
    await pool.query(
      "INSERT INTO auth_verifications(id,identifier,value,expires_at) VALUES($1,$2,$3,now()+interval '1 minute')",
      [randomUUID(), "reset-password:" + randomUUID(), userId],
    );
    expect((await call("delete-user", { password }, confirmed)).status).toBe(
      200,
    );
    expect((await GET(request)).status).toBe(401);
    for (const table of [
      "user_sessions",
      "user_accounts",
      "daily_check_ins",
      "daily_metrics",
    ]) {
      expect(
        (
          await pool.query("SELECT 1 FROM " + table + " WHERE user_id=$1", [
            userId,
          ])
        ).rowCount,
      ).toBe(0);
    }
    expect(
      (
        await pool.query("SELECT 1 FROM auth_verifications WHERE value=$1", [
          userId,
        ])
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await pool.query("SELECT 1 FROM daily_check_ins WHERE user_id=$1", [
          legacyUser,
        ])
      ).rowCount,
    ).toBe(1);
  });

  it("rejects missing and expired verification links and safely repeats a valid link", async () => {
    const { auth } = await import("./auth");
    const { createEmailVerificationToken } = await import("better-auth/api");
    const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const email = userId + "@example.com";
    const secret = (await auth.$context).secret;
    const expired = await createEmailVerificationToken(
      secret,
      email,
      undefined,
      -60,
    );
    const verify = (token?: string) =>
      auth.handler(
        new Request(
          origin +
            "/api/auth/verify-email" +
            (token ? "?token=" + encodeURIComponent(token) : ""),
        ),
      );
    expect((await verify()).ok).toBe(false);
    expect((await verify(expired)).ok).toBe(false);
    expect(
      (
        await pool.query("SELECT email_verified FROM users WHERE id=$1", [
          userId,
        ])
      ).rows[0].email_verified,
    ).toBe(false);
    const valid = await createEmailVerificationToken(secret, email);
    expect((await verify(valid)).ok).toBe(true);
    expect((await verify(valid)).ok).toBe(true);
    expect(
      (await pool.query("SELECT id FROM users WHERE email=$1", [email])).rows,
    ).toEqual([{ id: userId }]);
  });

  it("preserves a pre-migration record with a genuine zero score", async () => {
    const { readDailyMetrics } = await import("@/lib/metricsRepository");
    expect(await readDailyMetrics(legacyUser)).toMatchObject([
      { date: "2026-09-01", steps: 23, readinessScore: 0 },
    ]);
  });

  it.each(["", "owner@example.test"])(
    "restricts new registrations at the database boundary (owner: %s)",
    async (owner) => {
      vi.stubEnv("BASELINE_OWNER_EMAIL", owner);
      try {
        const { auth } = await import("@/lib/auth");
        const email = randomUUID() + "@example.test";
        await auth.api.signUpEmail({
          body: { email, name: "Not on list", password: randomUUID() },
        });
        expect(
          (await pool.query("SELECT id FROM users WHERE email = $1", [email]))
            .rowCount,
        ).toBe(0);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it("inserts and reads back daily metrics with their contributions", async () => {
    const { insertDailyMetrics, readDailyMetrics, readMetricAverages } =
      await import("@/lib/metricsRepository");

    const inserted = await insertDailyMetrics(userId, [
      makeMetric("2026-01-01"),
      makeMetric("2026-01-02", { steps: 2000 }),
    ]);
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
    const { readDailyMetrics, insertDailyMetrics } =
      await import("@/lib/metricsRepository");
    const other = randomUUID();
    await pool.query(
      "INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Second fixture')",
      [other, other + "@example.test"],
    );
    const summary = makeMetric("2026-11-01", {
      activities: [],
      stepActivities: [],
      restPeriods: [],
      breathworkSessions: [],
      readinessScore: null,
    });
    await insertDailyMetrics(userId, [summary]);
    await insertDailyMetrics(other, [
      { ...summary, steps: 0, readinessScore: 0 },
    ]);
    expect(await readDailyMetrics(userId)).toMatchObject([
      { steps: 1000, readinessScore: null, activities: [] },
    ]);
    expect(await readDailyMetrics(other)).toMatchObject([
      { steps: 0, readinessScore: 0 },
    ]);
  });

  it("throws DuplicateMetricDateError and rolls back when a date already exists", async () => {
    const { insertDailyMetrics, readDailyMetrics, DuplicateMetricDateError } =
      await import("@/lib/metricsRepository");

    await insertDailyMetrics(userId, [makeMetric("2026-01-01")]);
    await expect(
      insertDailyMetrics(userId, [
        makeMetric("2026-01-01"),
        makeMetric("2026-01-02"),
      ]),
    ).rejects.toThrow(DuplicateMetricDateError);

    // The batch should have been rolled back entirely: 2026-01-02 must not exist either.
    const metrics = await readDailyMetrics(userId);
    expect(metrics).toHaveLength(1);
    expect(metrics[0].date).toBe("2026-01-01");
  });

  it("isolates overlapping dates across sessions and rejects expired or signed-out sessions", async () => {
    const { auth } = await import("./auth");
    const { hashPassword } = await import("better-auth/crypto");
    const { GET, POST } = await import("@/app/api/metrics/route");
    const { changeDay } = await import("./journal");
    const other = randomUUID();
    await pool.query(
      "INSERT INTO users(id,email,display_name,email_verified) VALUES($1,$2,'Second session fixture',true)",
      [other, other + "@example.test"],
    );
    await pool.query("UPDATE users SET email_verified=true WHERE id=$1", [
      userId,
    ]);
    const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const ids = [userId, other];
    const postAuth = (route: string, body: object, cookie = "") =>
      auth.handler(
        new Request(origin + "/api/auth/" + route, {
          method: "POST",
          headers: { origin, "content-type": "application/json", cookie },
          body: JSON.stringify(body),
        }),
      );
    expect((await GET(new Request(origin + "/api/metrics"))).status).toBe(401);
    for (const [index, id] of ids.entries()) {
      const password = randomUUID();
      const email = (
        await pool.query("SELECT email FROM users WHERE id=$1", [id])
      ).rows[0].email;
      await pool.query(
        "INSERT INTO user_accounts(id,account_id,provider_id,user_id,password) VALUES($1,$2,'credential',$3,$4)",
        [randomUUID(), id, id, await hashPassword(password)],
      );
      await changeDay(
        id,
        entry({
          date: "2026-11-12",
          action: "metric",
          steps: String(index + 1),
          calories: "0",
          rest: "0",
          breathe: "0",
        }),
      );
      async function login() {
        let response = await postAuth("sign-in/email", { email, password });
        for (
          let attempt = 0;
          response.status === 429 && attempt < 3;
          attempt++
        ) {
          const seconds = Math.min(
            60,
            Number(response.headers.get("retry-after")) || 10,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, (seconds + 1) * 1000),
          );
          response = await postAuth("sign-in/email", { email, password });
        }
        expect(response.status).toBe(200);
        return response.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; ");
      }
      let cookie = await login();
      const request = () =>
        new Request(origin + "/api/metrics?userId=" + ids[1 - index], {
          headers: { cookie },
        });
      expect(await (await GET(request())).json()).toMatchObject({
        metrics: [{ date: "2026-11-12", steps: index + 1 }],
      });
      const wrongPreview = new Request(origin + "/api/metrics", {
        method: "POST",
        headers: {
          cookie,
          "X-Baseline-Preview-Owner": ids[1 - index],
          "content-type": "application/json",
        },
        body: JSON.stringify([makeMetric("2026-11-13")]),
      });
      expect((await POST(wrongPreview)).status).toBe(409);
      expect(
        (await pool.query("SELECT 1 FROM daily_metrics WHERE user_id=$1", [id]))
          .rowCount,
      ).toBe(1);
      await pool.query(
        "UPDATE user_sessions SET expires_at=now()-interval '1 minute' WHERE user_id=$1",
        [id],
      );
      expect((await GET(request())).status).toBe(401);
      cookie = await login();
      expect((await postAuth("sign-out", {}, cookie)).status).toBe(200);
      expect((await GET(request())).status).toBe(401);
    }
  }, 120_000);

  it("returns zeroed averages for a user with no records", async () => {
    const { readMetricAverages } = await import("@/lib/metricsRepository");
    const averages = await readMetricAverages(userId);
    expect(averages).toEqual({
      steps: 0,
      moveCalories: 0,
      restMinutes: 0,
      breatheMinutes: 0,
    });
  });
});
