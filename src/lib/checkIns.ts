import "server-only";
import type { PoolClient } from "pg";
import { getDatabasePool } from "./database";
import {
  type CheckInAnswer,
  type CheckInField,
  type CheckInTime,
  type FieldDraft,
  type FluidUnit,
  FACE_LABELS,
  FLUID_UNITS,
  LITRES_PER_FL_OZ,
  SYMPTOM_SCORE_LABELS,
  fieldDraftError,
  parseCheckInAnswer,
} from "./checkInValues";
import { findPreset } from "./checkInPresets";

// Storage for configurable check-ins (T257). Every query is scoped by the owner's user id.
// The legacy energy/soreness/note columns on daily_check_ins are kept in step with the
// Energy, Soreness and Notes fields until the old journal form is retired (T258).

const FIELD_COLUMNS = `id, label, kind, score_labels AS "scoreLabels", unit, position, system_key AS "systemKey",
  preset, prompt_metrics AS "promptMetrics", retired_at IS NOT NULL AS retired`;

type AnswerRow = {
  field_id: string;
  kind: CheckInField["kind"];
  score: number | null;
  yes_no: boolean | null;
  number: string | null;
  tags: string[] | null;
  note: string | null;
};

/** The descriptions stored for a field: five for a score, four for faces, none otherwise. */
function storedLabels(kind: CheckInField["kind"], labels: string[] | null | undefined): string[] | null {
  if (kind === "score") return (labels ?? SYMPTOM_SCORE_LABELS).map((l) => l.trim());
  if (kind === "faces") return (labels ?? FACE_LABELS).map((l) => l.trim());
  return null;
}

function toAnswer(row: AnswerRow): CheckInAnswer {
  switch (row.kind) {
    case "score":
      return { kind: "score", score: row.score! };
    case "faces":
      return { kind: "faces", score: row.score! };
    case "yes_no":
      return { kind: "yes_no", yesNo: row.yes_no! };
    case "number":
      return { kind: "number", number: Number(row.number) };
    case "notes":
      return { kind: "notes", tags: row.tags ?? [], note: row.note ?? "" };
  }
}

async function inTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

class Refusal extends Error {}

/** The owner's fields in form order. Retired fields are included only when asked for (history, export). */
export async function listCheckInFields(
  owner: string,
  { includeRetired = false } = {},
): Promise<CheckInField[]> {
  const db = getDatabasePool();
  await db.query("SELECT ensure_default_check_in_fields($1)", [owner]);
  const result = await db.query<CheckInField>(
    `SELECT ${FIELD_COLUMNS} FROM check_in_fields
     WHERE user_id = $1 AND ($2 OR retired_at IS NULL)
     ORDER BY retired_at IS NOT NULL, position, created_at`,
    [owner, includeRetired],
  );
  return result.rows;
}

export interface SavedCheckIn {
  date: string;
  revision: string;
  /** Answers keyed by field id, including answers to fields that were retired later. */
  answers: Record<string, CheckInAnswer>;
}

export async function readCheckIn(owner: string, day: string): Promise<SavedCheckIn | null> {
  const db = getDatabasePool();
  const head = await db.query<{ revision: string }>(
    "SELECT updated_at::text AS revision FROM daily_check_ins WHERE user_id = $1 AND local_date = $2",
    [owner, day],
  );
  if (!head.rows[0]) return null;
  const rows = await db.query<AnswerRow>(
    `SELECT a.field_id, f.kind, a.score, a.yes_no, a.number::text AS number, a.tags, a.note
     FROM check_in_answers a JOIN check_in_fields f ON f.id = a.field_id AND f.user_id = a.user_id
     WHERE a.user_id = $1 AND a.local_date = $2`,
    [owner, day],
  );
  return {
    date: day,
    revision: head.rows[0].revision,
    answers: Object.fromEntries(rows.rows.map((row) => [row.field_id, toAnswer(row)])),
  };
}

export type SaveResult = { ok: true; revision: string } | { ok: false; message: string };

/**
 * Save the submitted answers for one day. `submitted` maps field id to the raw form value;
 * a field present with an empty value clears that answer, a field left out is not touched.
 * `revision` must be the one that was displayed when editing an existing check-in.
 */
export async function saveCheckIn(
  owner: string,
  day: string,
  submitted: Record<string, unknown>,
  revision?: string,
): Promise<SaveResult> {
  const fields = await listCheckInFields(owner);
  const byId = new Map(fields.map((field) => [field.id, field]));
  const changes: Array<{ field: CheckInField; answer: CheckInAnswer | null }> = [];
  for (const [fieldId, raw] of Object.entries(submitted)) {
    const field = byId.get(fieldId);
    if (!field) return { ok: false, message: "A field changed since the form was opened. Reload and try again." };
    const parsed = parseCheckInAnswer(field, raw);
    if (parsed && "error" in parsed) return { ok: false, message: parsed.error };
    changes.push({ field, answer: parsed });
  }

  try {
    return await inTransaction(async (client) => {
      if (revision) {
        const locked = await client.query(
          "SELECT 1 FROM daily_check_ins WHERE user_id = $1 AND local_date = $2 AND updated_at::text = $3 FOR UPDATE",
          [owner, day, revision],
        );
        if (!locked.rowCount) throw new Refusal("This check-in changed in another tab. Reload before editing.");
      } else {
        const created = await client.query(
          "INSERT INTO daily_check_ins (user_id, local_date) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [owner, day],
        );
        if (!created.rowCount) throw new Refusal("A check-in already exists for this day. Reload before editing.");
      }

      for (const { field, answer } of changes) {
        if (!answer) {
          await client.query(
            "DELETE FROM check_in_answers WHERE user_id = $1 AND local_date = $2 AND field_id = $3",
            [owner, day, field.id],
          );
          continue;
        }
        await client.query(
          `INSERT INTO check_in_answers (user_id, local_date, field_id, score, yes_no, number, tags, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (user_id, local_date, field_id) DO UPDATE SET
             score = EXCLUDED.score, yes_no = EXCLUDED.yes_no, number = EXCLUDED.number,
             tags = EXCLUDED.tags, note = EXCLUDED.note, updated_at = clock_timestamp()`,
          [
            owner,
            day,
            field.id,
            answer.kind === "score" || answer.kind === "faces" ? answer.score : null,
            answer.kind === "yes_no" ? answer.yesNo : null,
            answer.kind === "number" ? answer.number : null,
            answer.kind === "notes" && answer.tags.length ? answer.tags : null,
            answer.kind === "notes" && answer.note ? answer.note : null,
          ],
        );
      }

      const remaining = await client.query(
        "SELECT 1 FROM check_in_answers WHERE user_id = $1 AND local_date = $2 LIMIT 1",
        [owner, day],
      );
      if (!remaining.rowCount)
        throw new Refusal("Fill in at least one field, or use Clear day to remove the check-in.");

      // Keep the legacy columns in step for screens that still read them.
      const updated = await client.query<{ revision: string }>(
        `UPDATE daily_check_ins c SET
           energy = (SELECT a.score FROM check_in_answers a JOIN check_in_fields f ON f.id = a.field_id
                     WHERE a.user_id = c.user_id AND a.local_date = c.local_date AND f.system_key = 'energy'),
           soreness = (SELECT a.score FROM check_in_answers a JOIN check_in_fields f ON f.id = a.field_id
                       WHERE a.user_id = c.user_id AND a.local_date = c.local_date AND f.system_key = 'soreness'),
           note = COALESCE((SELECT a.note FROM check_in_answers a JOIN check_in_fields f ON f.id = a.field_id
                            WHERE a.user_id = c.user_id AND a.local_date = c.local_date AND f.system_key = 'notes'), ''),
           updated_at = clock_timestamp()
         WHERE user_id = $1 AND local_date = $2
         RETURNING updated_at::text AS revision`,
        [owner, day],
      );
      return { ok: true as const, revision: updated.rows[0].revision };
    });
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, message: error.message };
    throw error;
  }
}

/** Remove a day's check-in and all of its answers. */
export async function clearCheckIn(owner: string, day: string, revision: string): Promise<boolean> {
  const result = await getDatabasePool().query(
    "DELETE FROM daily_check_ins WHERE user_id = $1 AND local_date = $2 AND updated_at::text = $3",
    [owner, day, revision],
  );
  return result.rowCount === 1;
}

export type FieldResult = { ok: true; field: CheckInField } | { ok: false; message: string };

function uniqueLabelMessage(error: unknown): string | null {
  return (error as { code?: string }).code === "23505" ? "You already have a field with that name." : null;
}

export async function addCheckInField(owner: string, draft: FieldDraft): Promise<FieldResult> {
  const problem = fieldDraftError(draft);
  if (problem) return { ok: false, message: problem };
  try {
    const result = await getDatabasePool().query<CheckInField>(
      `INSERT INTO check_in_fields (user_id, label, kind, score_labels, unit, prompt_metrics, position)
       VALUES ($1, $2, $3, $4, $5, $6,
         (SELECT COALESCE(max(position), -1) + 1 FROM check_in_fields WHERE user_id = $1 AND system_key IS DISTINCT FROM 'notes'))
       RETURNING ${FIELD_COLUMNS}`,
      [
        owner,
        draft.label.trim(),
        draft.kind,
        storedLabels(draft.kind, draft.scoreLabels),
        draft.kind === "number" ? draft.unit?.trim() || null : null,
        draft.promptMetrics ?? [],
      ],
    );
    return { ok: true, field: result.rows[0] };
  } catch (error) {
    const message = uniqueLabelMessage(error);
    if (message) return { ok: false, message };
    throw error;
  }
}

/**
 * Rename a field, edit its score descriptions, unit or linked metrics. The type never changes:
 * retire the field and add a new one instead, so past answers keep their meaning.
 */
export async function updateCheckInField(
  owner: string,
  fieldId: string,
  changes: Partial<Pick<FieldDraft, "label" | "scoreLabels" | "unit" | "promptMetrics">>,
): Promise<FieldResult> {
  const [current] = (await listCheckInFields(owner, { includeRetired: true })).filter((f) => f.id === fieldId);
  if (!current) return { ok: false, message: "That field no longer exists." };
  const next: FieldDraft = {
    label: changes.label ?? current.label,
    kind: current.kind,
    scoreLabels: changes.scoreLabels ?? current.scoreLabels,
    unit: changes.unit === undefined ? current.unit : changes.unit,
    promptMetrics: changes.promptMetrics ?? current.promptMetrics,
  };
  const problem = fieldDraftError(next);
  if (problem) return { ok: false, message: problem };
  try {
    const result = await getDatabasePool().query<CheckInField>(
      `UPDATE check_in_fields SET label = $3, score_labels = $4, unit = $5, prompt_metrics = $6
       WHERE user_id = $1 AND id = $2 RETURNING ${FIELD_COLUMNS}`,
      [
        owner,
        fieldId,
        next.label.trim(),
        storedLabels(next.kind, next.scoreLabels),
        next.kind === "number" ? next.unit?.trim() || null : null,
        next.promptMetrics,
      ],
    );
    return { ok: true, field: result.rows[0] };
  } catch (error) {
    const message = uniqueLabelMessage(error);
    if (message) return { ok: false, message };
    throw error;
  }
}

/** Set the form order. `fieldIds` must list every active field exactly once. */
export async function reorderCheckInFields(owner: string, fieldIds: string[]): Promise<boolean> {
  const active = await listCheckInFields(owner);
  if (fieldIds.length !== active.length || new Set(fieldIds).size !== active.length) return false;
  if (!fieldIds.every((id) => active.some((field) => field.id === id))) return false;
  await getDatabasePool().query(
    `UPDATE check_in_fields f SET position = o.position - 1
     FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, position)
     WHERE f.user_id = $1 AND f.id = o.id`,
    [owner, fieldIds],
  );
  return true;
}

/** Retire hides a field from the form but keeps its answers; restore brings it back. */
export async function setCheckInFieldRetired(owner: string, fieldId: string, retired: boolean): Promise<FieldResult> {
  try {
    const result = await getDatabasePool().query<CheckInField>(
      `UPDATE check_in_fields SET retired_at = CASE WHEN $3 THEN clock_timestamp() ELSE NULL END
       WHERE user_id = $1 AND id = $2 RETURNING ${FIELD_COLUMNS}`,
      [owner, fieldId, retired],
    );
    if (!result.rows[0]) return { ok: false, message: "That field no longer exists." };
    return { ok: true, field: result.rows[0] };
  } catch (error) {
    const message = uniqueLabelMessage(error);
    if (message) return { ok: false, message: "An active field already uses that name. Rename one first." };
    throw error;
  }
}

/** How many days have an answer for this field, shown before a delete is confirmed. */
export async function countFieldAnswers(owner: string, fieldId: string): Promise<number> {
  const result = await getDatabasePool().query<{ days: number }>(
    "SELECT count(*)::int AS days FROM check_in_answers WHERE user_id = $1 AND field_id = $2",
    [owner, fieldId],
  );
  return result.rows[0].days;
}

/**
 * Delete a field and every answer it has. System fields (Energy, Soreness, Notes) can only be retired,
 * because the legacy columns still point at them. Check-ins left with no answers are removed too.
 */
export async function deleteCheckInField(owner: string, fieldId: string): Promise<boolean> {
  return inTransaction(async (client) => {
    const removed = await client.query(
      "DELETE FROM check_in_fields WHERE user_id = $1 AND id = $2 AND system_key IS NULL",
      [owner, fieldId],
    );
    if (!removed.rowCount) return false;
    await client.query(
      `DELETE FROM daily_check_ins c WHERE c.user_id = $1
         AND c.energy IS NULL AND c.soreness IS NULL AND c.note = ''
         AND NOT EXISTS (SELECT 1 FROM check_in_answers a WHERE a.user_id = c.user_id AND a.local_date = c.local_date)`,
      [owner],
    );
    return true;
  });
}

export async function getCheckInTime(owner: string): Promise<CheckInTime> {
  const result = await getDatabasePool().query<{ check_in_time: CheckInTime }>(
    "SELECT check_in_time FROM check_in_settings WHERE user_id = $1",
    [owner],
  );
  return result.rows[0]?.check_in_time ?? "evening";
}

export async function setCheckInTime(owner: string, time: CheckInTime): Promise<void> {
  if (time !== "morning" && time !== "evening") throw new Error("Unknown check-in time.");
  await getDatabasePool().query(
    `INSERT INTO check_in_settings (user_id, check_in_time) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET check_in_time = EXCLUDED.check_in_time, updated_at = clock_timestamp()`,
    [owner, time],
  );
}

export async function getFluidUnit(owner: string): Promise<FluidUnit> {
  const result = await getDatabasePool().query<{ fluid_unit: FluidUnit }>(
    "SELECT fluid_unit FROM check_in_settings WHERE user_id = $1",
    [owner],
  );
  return result.rows[0]?.fluid_unit ?? "L";
}

/**
 * Switch fluid amounts between litres and US fluid ounces. Every number field measured in the
 * other unit changes its unit, and its saved answers are converted (to two decimals), so the
 * history, charts and export all read in one unit.
 */
export async function setFluidUnit(owner: string, unit: FluidUnit): Promise<void> {
  if (!FLUID_UNITS.includes(unit)) throw new Error("Unknown fluid unit.");
  const from: FluidUnit = unit === "L" ? "oz" : "L";
  // Litres to ounces divides by the factor; ounces to litres multiplies.
  const factor = unit === "oz" ? 1 / LITRES_PER_FL_OZ : LITRES_PER_FL_OZ;
  await inTransaction(async (client) => {
    await client.query(
      `INSERT INTO check_in_settings (user_id, fluid_unit) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET fluid_unit = EXCLUDED.fluid_unit, updated_at = clock_timestamp()`,
      [owner, unit],
    );
    const fields = await client.query<{ id: string }>(
      `UPDATE check_in_fields SET unit = $3
       WHERE user_id = $1 AND kind = 'number' AND unit = $2 RETURNING id`,
      [owner, from, unit],
    );
    if (!fields.rows.length) return;
    await client.query(
      `UPDATE check_in_answers SET number = LEAST(round(number * $3::numeric, 2), 999999.99), updated_at = clock_timestamp()
       WHERE user_id = $1 AND field_id = ANY($2::uuid[]) AND number IS NOT NULL`,
      [owner, fields.rows.map((f) => f.id), factor],
    );
  });
}

/** Tags the owner has used before, most recent first, offered as quick chips in the Notes field. */
export async function recentCheckInTags(owner: string, limit = 24): Promise<string[]> {
  const result = await getDatabasePool().query<{ tag: string }>(
    `SELECT tag FROM (
       SELECT t.tag, max(a.local_date) AS last_used
       FROM check_in_answers a CROSS JOIN LATERAL unnest(a.tags) AS t(tag)
       WHERE a.user_id = $1 GROUP BY t.tag
     ) used ORDER BY last_used DESC, tag LIMIT $2`,
    [owner, limit],
  );
  return result.rows.map((row) => row.tag);
}

export type PresetResult =
  | { ok: true; added: string[]; restored: string[]; skipped: string[] }
  | { ok: false; message: string };

/**
 * Add a starter set. A field whose name is already on the form is skipped; one that was hidden
 * with the same name and type is shown again, so its history carries on.
 */
export async function applyCheckInPreset(owner: string, presetId: string): Promise<PresetResult> {
  const preset = findPreset(presetId);
  if (!preset) return { ok: false, message: "Unknown starter set." };
  const existing = await listCheckInFields(owner, { includeRetired: true });
  const fluidUnit = await getFluidUnit(owner);
  return inTransaction(async (client) => {
    const added: string[] = [];
    const restored: string[] = [];
    const skipped: string[] = [];
    const next = await client.query<{ position: number }>(
      "SELECT COALESCE(max(position), -1) + 1 AS position FROM check_in_fields WHERE user_id = $1 AND system_key IS DISTINCT FROM 'notes'",
      [owner],
    );
    let position = next.rows[0].position;
    for (const field of preset.fields) {
      const same = existing.filter((f) => f.label.toLowerCase() === field.label.toLowerCase());
      if (same.some((f) => !f.retired)) {
        skipped.push(field.label);
        continue;
      }
      const hidden = same.find((f) => f.kind === field.kind);
      if (hidden) {
        await client.query(
          "UPDATE check_in_fields SET retired_at = NULL, position = $3 WHERE user_id = $1 AND id = $2",
          [owner, hidden.id, position++],
        );
        restored.push(field.label);
        continue;
      }
      await client.query(
        `INSERT INTO check_in_fields (user_id, label, kind, score_labels, unit, prompt_metrics, position, preset)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          owner,
          field.label,
          field.kind,
          storedLabels(field.kind, field.scoreLabels),
          field.kind === "number" ? (field.unit === "L" ? fluidUnit : (field.unit ?? null)) : null,
          field.promptMetrics ?? [],
          position++,
          preset.id,
        ],
      );
      added.push(field.label);
    }
    return { ok: true as const, added, restored, skipped };
  });
}
