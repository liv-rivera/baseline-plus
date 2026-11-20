import { NextResponse } from "next/server";
import { DatabaseConfigurationError } from "@/lib/database";
import { getRequestSession } from "@/lib/auth-session";
import { DuplicateMetricDateError, insertDailyMetrics, readDailyMetrics, readMetricAverages } from "@/lib/metricsRepository";
import type { DailyMetrics } from "@/types/metrics";

export const runtime = "nodejs";

class MetricsPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricsPayloadError";
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 2147483647;

const parseEntries = (
  value: unknown,
  quantityKey: "calories" | "steps" | "durationMinutes",
): Array<{ id: string; name: string; durationMinutes: number; quantity: number }> => {
  if (!Array.isArray(value)) {
    throw new MetricsPayloadError("Metric contribution lists must be arrays.");
  }

  if (value.length > 500) throw new MetricsPayloadError("Each daily contribution list supports up to 500 entries.");

  return value.map((entry) => {
    if (!isObject(entry)) {
      throw new MetricsPayloadError("Metric contributions must be objects.");
    }

    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const durationMinutes = entry.durationMinutes;
    const quantity = entry[quantityKey];
    if (
      !name
      || name.length > 120
      || !isNonNegativeInteger(durationMinutes)
      || durationMinutes > 1440
      || !isNonNegativeInteger(quantity)
    ) {
      throw new MetricsPayloadError("Contribution names, durations, or amounts are invalid.");
    }

    return {
      id: typeof entry.id === "string" ? entry.id : "",
      name,
      durationMinutes,
      quantity,
    };
  });
};

const parseMetricBatch = (payload: unknown): DailyMetrics[] => {
  if (!Array.isArray(payload) || payload.length === 0 || payload.length > 5000) {
    throw new MetricsPayloadError("Submit between 1 and 5,000 daily records per import.");
  }

  const dates = new Set<string>();
  return payload.map((item) => {
    if (!isObject(item)) {
      throw new MetricsPayloadError("Each daily record must be an object.");
    }

    const date = typeof item.date === "string" ? item.date : "";
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : null;
    if (date.startsWith("0000") || !parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      throw new MetricsPayloadError("Dates must be real calendar dates in YYYY-MM-DD format.");
    }
    if (dates.has(date)) {
      throw new MetricsPayloadError(`The import contains more than one record for ${date}.`);
    }
    dates.add(date);

    const metricFields = ["steps", "moveCalories", "restMinutes", "breatheMinutes"] as const;
    for (const field of metricFields) {
      if (!isNonNegativeInteger(item[field])) {
        throw new MetricsPayloadError(`${field} must be a non-negative whole number.`);
      }
    }
    if (Number(item.restMinutes) > 1440 || Number(item.breatheMinutes) > 1440) {
      throw new MetricsPayloadError("Daily minutes must be between 0 and 1440.");
    }
    const score = item.readinessScore ?? null;
    if (score !== null && (!isNonNegativeInteger(score) || score > 100)) {
      throw new MetricsPayloadError("readinessScore must be a whole number between 0 and 100.");
    }

    const activities = parseEntries(item.activities, "calories").map(({ id, name, durationMinutes, quantity }) => ({
      id, name, durationMinutes, calories: quantity,
    }));
    const stepActivities = parseEntries(item.stepActivities, "steps").map(({ id, name, durationMinutes, quantity }) => ({
      id, name, durationMinutes, steps: quantity,
    }));
    const restPeriods = parseEntries(item.restPeriods, "durationMinutes").map(({ id, name, durationMinutes }) => ({
      id, name, durationMinutes,
    }));
    const breathworkSessions = parseEntries(item.breathworkSessions, "durationMinutes").map(({ id, name, durationMinutes }) => ({
      id, name, durationMinutes,
    }));

    const contributionTotals = [
      [activities.length, activities.reduce((total, entry) => total + entry.calories, 0), item.moveCalories],
      [stepActivities.length, stepActivities.reduce((total, entry) => total + entry.steps, 0), item.steps],
      [restPeriods.length, restPeriods.reduce((total, entry) => total + entry.durationMinutes, 0), item.restMinutes],
      [breathworkSessions.length, breathworkSessions.reduce((total, entry) => total + entry.durationMinutes, 0), item.breatheMinutes],
    ];
    if (contributionTotals.some(([count, contributionTotal, dailyTotal]) => count !== 0 && contributionTotal !== dailyTotal)) {
      throw new MetricsPayloadError("Each contribution list must sum exactly to its daily metric total.");
    }

    return {
      date,
      source: "import",
      steps: item.steps as number,
      moveCalories: item.moveCalories as number,
      restMinutes: item.restMinutes as number,
      breatheMinutes: item.breatheMinutes as number,
      readinessScore: score,
      activities,
      stepActivities,
      restPeriods,
      breathworkSessions,
    };
  });
};

const databaseUnavailableResponse = () => NextResponse.json(
  { error: "Your records are temporarily unavailable. Please try again." },
  { status: 503 },
);

const unauthorizedResponse = () => NextResponse.json({ error: "Authentication required." }, { status: 401 });

export async function GET(request: Request) {
  try {
    const session = await getRequestSession(request.headers);
    if (!session) {
      return unauthorizedResponse();
    }

    const userId = session.user.id;
    const [metrics, averages] = await Promise.all([
      readDailyMetrics(userId),
      readMetricAverages(userId),
    ]);
    return NextResponse.json({ metrics, averages });
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return databaseUnavailableResponse();
    }
    console.error("Unable to read daily metrics from PostgreSQL.");
    return databaseUnavailableResponse();
  }
}

export async function POST(request: Request) {
  let session;
  try {
    session = await getRequestSession(request.headers);
  } catch {
    console.error("Unable to validate the metrics API session.");
    return databaseUnavailableResponse();
  }
  if (!session) {
    return unauthorizedResponse();
  }

  const previewOwner = request.headers.get("X-Baseline-Preview-Owner");
  if (previewOwner !== null && previewOwner !== session.user.id) {
    return NextResponse.json({ error: "Your account changed. Preview the records again." }, { status: 409 });
  }
  let metrics: DailyMetrics[];
  try {
    const limit = 5 * 1024 * 1024;
    const tooLarge = () => NextResponse.json({ error: "Split the import into batches smaller than 5 MiB." }, { status: 413 });
    if (Number(request.headers.get("content-length")) > limit) return tooLarge();
    const reader = request.body?.getReader();
    if (!reader) throw new MetricsPayloadError("The import is empty.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          return tooLarge();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    metrics = parseMetricBatch(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    const message = error instanceof MetricsPayloadError ? error.message : "The import payload is invalid.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const inserted = await insertDailyMetrics(session.user.id, metrics);
    return NextResponse.json({ inserted }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateMetricDateError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof DatabaseConfigurationError) {
      return databaseUnavailableResponse();
    }
    console.error("Unable to import daily metrics into PostgreSQL.");
    return databaseUnavailableResponse();
  }
}