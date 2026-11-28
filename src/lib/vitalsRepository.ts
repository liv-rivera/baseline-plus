import "server-only";
import { randomUUID } from "node:crypto";
import { getDatabasePool } from "./database";

export type DayVitals = { date: string; hrv: number | null; restingHeartRate: number | null };

// Apple Health heart readings land in daily_metric_aggregates, one row per day and metric.
// Importing the same day again replaces its value, so a newer export can fill in days
// whose totals were already saved.
const AGGREGATION = {
  method: "mean",
  policy: "apple_health_preferred_device",
  fingerprint: "apple_health_export",
  version: 1,
} as const;

export async function saveVitals(owner: string, days: DayVitals[]) {
  const rows = days.flatMap((day) => [
    ...(day.hrv !== null ? [[day.date, "hrv_sdnn", day.hrv, "ms"] as const] : []),
    ...(day.restingHeartRate !== null ? [[day.date, "resting_heart_rate", day.restingHeartRate, "bpm"] as const] : []),
  ]);
  if (!rows.length) return { saved: 0 };
  await getDatabasePool().query(
    `INSERT INTO daily_metric_aggregates (id, user_id, local_date, metric_key, value, unit, aggregation_method,
       selected_source_policy, input_fingerprint, aggregation_version)
     SELECT id, $1, local_date, metric_key, value, unit, $7, $8, $9, $10
       FROM unnest($2::uuid[], $3::date[], $4::text[], $5::numeric[], $6::text[])
            AS r(id, local_date, metric_key, value, unit)
     ON CONFLICT (user_id, local_date, metric_key, aggregation_version)
     DO UPDATE SET value = EXCLUDED.value, unit = EXCLUDED.unit, computed_at = now()`,
    [
      owner,
      rows.map(() => randomUUID()),
      rows.map((r) => r[0]),
      rows.map((r) => r[1]),
      rows.map((r) => r[2]),
      rows.map((r) => r[3]),
      AGGREGATION.method,
      AGGREGATION.policy,
      AGGREGATION.fingerprint,
      AGGREGATION.version,
    ],
  );
  return { saved: new Set(rows.map((r) => r[0])).size };
}
