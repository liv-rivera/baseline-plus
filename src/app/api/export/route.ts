import { getRequestSession } from "@/lib/auth-session";
import { getDatabasePool } from "@/lib/database";
export async function GET(request: Request) {
  try {
    const session = await getRequestSession(request.headers);
    if (!session) return new Response(null, { status: 401 });
    const { rows } = await getDatabasePool().query(
      `SELECT
    COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.date) FROM (
      SELECT metric_date::text AS date, steps,move_calories AS move_kcal,rest_minutes,breathwork_minutes,readiness_score,source,manually_corrected,created_at,updated_at,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('type',metric_type,'name',name,'duration_minutes',duration_minutes,'quantity',quantity) ORDER BY created_at,id)
       FROM metric_contributions WHERE daily_metric_id=m.id),'[]') AS contributions
      FROM daily_metrics m WHERE user_id=$1) d),'[]') AS metrics,
    COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.date) FROM (
      SELECT local_date::text AS date,energy,soreness,note,updated_at,
      COALESCE((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('field_id',a.field_id,'field',f.label,'score',a.score,'yes_no',a.yes_no,
        'number',a.number,'tags',a.tags,'note',a.note)) ORDER BY f.position,f.label)
       FROM check_in_answers a JOIN check_in_fields f ON f.id=a.field_id AND f.user_id=a.user_id
       WHERE a.user_id=ci.user_id AND a.local_date=ci.local_date),'[]') AS answers
      FROM daily_check_ins ci WHERE user_id=$1) c),'[]') AS check_ins,
    COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.position,f.label) FROM (
      SELECT id,label,kind,score_labels,unit,position,preset,prompt_metrics,retired_at IS NOT NULL AS hidden,created_at
      FROM check_in_fields WHERE user_id=$1) f),'[]') AS check_in_fields,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('date',local_date::text,'metric',metric_key,'value',value,'unit',unit,'computed_at',computed_at)
      ORDER BY local_date,metric_key) FROM daily_metric_aggregates WHERE user_id=$1),'[]') AS daily_readings`,
      [session.user.id],
    );
    return Response.json(
      {
        version: 1,
        units: {
          steps: "count",
          move_kcal: "active kcal",
          rest_minutes: "minutes",
          breathwork_minutes: "minutes",
          readiness_score: "source score 0–100",
          energy: "rating 1–5",
          soreness: "rating 1–5",
          check_in_answers: "score 1–5 described by the field's score_labels; number in the field's unit",
          daily_readings: "hrv_sdnn in ms, resting_heart_rate in bpm (daily mean from Apple Health)",
        },
        date_convention: "Source local calendar date (YYYY-MM-DD)",
        ...rows[0],
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Disposition": 'attachment; filename="baseline-records.json"',
        },
      },
    );
  } catch {
    console.error("Unable to export account records.");
    return Response.json(
      { error: "Could not export your records. Please try again." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
