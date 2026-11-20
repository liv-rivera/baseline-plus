import "server-only";
import { randomUUID } from "node:crypto";
import { getDatabasePool } from "./database";

export function validDay(day: string) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day) || day.startsWith("0000"))
    return false;
  const d = new Date(day + "T12:00:00Z");
  return Number.isFinite(d.valueOf()) && d.toISOString().startsWith(day + "T");
}

export async function readDay(owner: string, day: string) {
  const db = getDatabasePool();
  const metrics = await db.query<{
    steps: number;
    calories: number;
    rest: number;
    breathe: number;
    source: string;
    manually_corrected: boolean;
    revision: string;
    detailed: boolean;
  }>(
    `SELECT steps, move_calories AS calories, rest_minutes AS rest, breathwork_minutes AS breathe, source, manually_corrected,
      updated_at::text AS revision, EXISTS(SELECT 1 FROM metric_contributions c WHERE c.daily_metric_id=m.id) AS detailed
      FROM daily_metrics m WHERE user_id=$1 AND metric_date=$2`,
    [owner, day],
  );
  const context = await db.query<{
    energy: number | null;
    soreness: number | null;
    note: string;
    revision: string;
  }>(
    "SELECT energy,soreness,note,updated_at::text AS revision FROM daily_check_ins WHERE user_id=$1 AND local_date=$2",
    [owner, day],
  );
  return { metric: metrics.rows[0], checkIn: context.rows[0] };
}

export async function changeDay(owner: string, form: FormData) {
  const day = String(form.get("date"));
  if (!validDay(day)) return "Choose a valid calendar date.";
  const revision = String(form.get("revision") ?? "");
  const db = getDatabasePool();
  const action = form.get("action");
  const parameters = [owner, day, revision];
  let changed: number | null;
  if (action === "delete-metric" || action === "delete-context") {
    if (form.get("confirm") !== "yes") return "Confirm deletion first.";
    const sql =
      action === "delete-metric"
        ? "DELETE FROM daily_metrics WHERE user_id=$1 AND metric_date=$2 AND updated_at::text=$3"
        : "DELETE FROM daily_check_ins WHERE user_id=$1 AND local_date=$2 AND updated_at::text=$3";
    changed = (await db.query(sql, parameters)).rowCount;
  } else if (action === "context") {
    const rating = (key: string) => form.get(key) || null;
    const energy = rating("energy"),
      soreness = rating("soreness"),
      note = String(form.get("note") ?? "").trim();
    if (
      [energy, soreness].some(
        (v) => v !== null && !/^[1-5]$/.test(String(v)),
      ) ||
      note.length > 240 ||
      !(energy || soreness || note)
    )
      return "Choose a rating or add a short note.";
    const values = [owner, day, energy, soreness, note];
    changed = revision
      ? (
          await db.query(
            "UPDATE daily_check_ins SET energy=$3,soreness=$4,note=$5,updated_at=clock_timestamp() WHERE user_id=$1 AND local_date=$2 AND updated_at::text=$6",
            [...values, revision],
          )
        ).rowCount
      : (
          await db.query(
            "INSERT INTO daily_check_ins(user_id,local_date,energy,soreness,note) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
            values,
          )
        ).rowCount;
  } else if (action === "metric") {
    const amounts = ["steps", "calories", "rest", "breathe"].map((key) =>
      String(form.get(key) ?? ""),
    );
    if (
      amounts.some(
        (v, i) => !/^\d+$/.test(v) || Number(v) > (i < 2 ? 2147483647 : 1440),
      )
    )
      return "Enter whole daily totals. Minutes must be 0–1440.";
    const values = [owner, day, ...amounts];
    changed = revision
      ? (
          await db.query(
            `UPDATE daily_metrics m SET steps=$3,move_calories=$4,rest_minutes=$5,breathwork_minutes=$6,manually_corrected=true,updated_at=clock_timestamp()
        WHERE user_id=$1 AND metric_date=$2 AND updated_at::text=$7 AND NOT EXISTS (SELECT 1 FROM metric_contributions WHERE daily_metric_id=m.id)`,
            [...values, revision],
          )
        ).rowCount
      : (
          await db.query(
            `INSERT INTO daily_metrics(user_id,metric_date,steps,move_calories,rest_minutes,breathwork_minutes,id,source)
        VALUES($1,$2,$3,$4,$5,$6,$7,'manual') ON CONFLICT DO NOTHING`,
            [...values, randomUUID()],
          )
        ).rowCount;
  } else return "Unknown action.";
  return changed
    ? "Saved."
    : "The record changed or includes individual activities. Reload before editing.";
}

export async function recentCheckIns(owner: string) {
  const result = await getDatabasePool().query<{
    date: string;
    energy: number | null;
    soreness: number | null;
  }>(
    "SELECT local_date::text AS date, energy, soreness FROM daily_check_ins WHERE user_id=$1 ORDER BY local_date DESC LIMIT 30",
    [owner],
  );
  return result.rows;
}
