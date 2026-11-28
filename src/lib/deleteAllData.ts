import "server-only";
import { getDatabasePool } from "./database";

// Every table that holds a person's health records, in an order that never
// waits on a cascade. The account, sign-in methods, sessions and provider
// connections stay so the person can keep using Baseline+ straight away. So does
// the check-in setup (which fields to ask and when), but not any answers.
export const RECORD_TABLES = [
  "activity_sources",
  "metric_observations",
  "daily_metric_aggregates",
  "recovery_scores",
  "activities",
  "provider_records",
  "check_in_answers",
  "daily_check_ins",
  "daily_metrics", // metric_contributions go with it (ON DELETE CASCADE)
] as const;

export async function deleteAllRecords(owner: string) {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    let days = 0;
    for (const table of RECORD_TABLES) {
      const result = await client.query(
        `DELETE FROM ${table} WHERE user_id = $1`,
        [owner],
      );
      if (table === "daily_metrics") days = result.rowCount ?? 0;
    }
    await client.query("COMMIT");
    return { days };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
