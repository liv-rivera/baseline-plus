import "server-only";

/**
 * SQL for one day's check-in as JSON in the DayCheckIn shape (src/types/metrics.ts).
 * Use it in a query where `c` is the daily_check_ins row. Hidden fields keep their answers.
 */
export const CHECK_IN_JSON = `json_build_object(
                      'energy', c.energy,
                      'soreness', c.soreness,
                      'symptoms', COALESCE((
                        SELECT json_agg(jsonb_build_object(
                                 'label', f.label,
                                 'kind', f.kind,
                                 'value', CASE WHEN f.kind IN ('score', 'faces') THEN to_jsonb(a.score)
                                               WHEN f.kind = 'yes_no' THEN to_jsonb(a.yes_no)
                                               ELSE to_jsonb(a.number) END,
                                 'unit', f.unit)
                               || CASE WHEN f.kind = 'faces'
                                       THEN jsonb_build_object('description', f.score_labels[a.score])
                                       ELSE '{}'::jsonb END
                               ORDER BY f.position, f.label)
                          FROM check_in_answers a
                          JOIN check_in_fields f ON f.id = a.field_id AND f.user_id = a.user_id
                         WHERE a.user_id = c.user_id AND a.local_date = c.local_date
                           AND f.system_key IS NULL AND f.kind <> 'notes'), '[]'::json),
                      'tags', COALESCE((
                        SELECT to_json(a.tags)
                          FROM check_in_answers a
                          JOIN check_in_fields f ON f.id = a.field_id AND f.user_id = a.user_id
                         WHERE a.user_id = c.user_id AND a.local_date = c.local_date
                           AND f.system_key = 'notes' AND a.tags IS NOT NULL), '[]'::json))`;
