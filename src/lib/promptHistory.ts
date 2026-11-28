import "server-only";
import { getDatabasePool } from "./database";
import { PROMPT_RULES, type MetricDay } from "./checkInPrompts";
import type { PromptMetric } from "./checkInValues";

// Reads what the check-in prompts compare (T265): the check-in date and the 28 days before.
// - HRV and resting heart rate come from daily_metric_aggregates (hrv_sdnn in ms,
//   resting_heart_rate in bpm). Only the newest aggregation of a day counts.
// - Sleep is the Apple Health asleep total, which the importer files under the date you
//   woke up, so the check-in date's value is last night. Manual and CSV "rest" minutes
//   aren't sleep and are left out.
export async function readPromptHistory(owner: string, date: string): Promise<Record<PromptMetric, MetricDay[]>> {
  const db = getDatabasePool();
  const window = PROMPT_RULES.windowDays;
  const [vitals, sleep] = await Promise.all([
    db.query<{ date: string; metric_key: "hrv_sdnn" | "resting_heart_rate"; value: string }>(
      `SELECT DISTINCT ON (local_date, metric_key) local_date::text AS date, metric_key, value
         FROM daily_metric_aggregates
        WHERE user_id = $1 AND metric_key IN ('hrv_sdnn', 'resting_heart_rate') AND value IS NOT NULL
          AND local_date BETWEEN $2::date - $3::int AND $2::date
        ORDER BY local_date, metric_key, aggregation_version DESC`,
      [owner, date, window],
    ),
    db.query<{ date: string; value: number }>(
      `SELECT metric_date::text AS date, rest_minutes AS value
         FROM daily_metrics
        WHERE user_id = $1 AND source = 'apple_health' AND rest_minutes IS NOT NULL
          AND metric_date BETWEEN $2::date - $3::int AND $2::date`,
      [owner, date, window],
    ),
  ]);
  const pick = (key: string) =>
    vitals.rows.filter((r) => r.metric_key === key).map((r) => ({ date: r.date, value: Number(r.value) }));
  return {
    hrv: pick("hrv_sdnn"),
    resting_heart_rate: pick("resting_heart_rate"),
    sleep_duration: sleep.rows.map((r) => ({ date: r.date, value: r.value })),
  };
}
