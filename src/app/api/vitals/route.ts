import { NextResponse } from "next/server";
import { getRequestSession } from "@/lib/auth-session";
import { saveVitals, type DayVitals } from "@/lib/vitalsRepository";

export const runtime = "nodejs";

const MAX_DAYS = 5000;
const MAX_BYTES = 1024 * 1024;

const realDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const reading = (value: unknown, min: number, max: number) =>
  value === null || (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max);

function parse(payload: unknown): DayVitals[] | string {
  if (!Array.isArray(payload) || payload.length === 0 || payload.length > MAX_DAYS)
    return `Send between 1 and ${MAX_DAYS.toLocaleString("en-US")} days at a time.`;
  const dates = new Set<string>();
  const days: DayVitals[] = [];
  for (const item of payload) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return "Each day must be an object.";
    const { date, hrv, restingHeartRate } = item as Record<string, unknown>;
    if (!realDate(date)) return "Dates must be real calendar dates in YYYY-MM-DD format.";
    if (dates.has(date)) return `The import contains more than one entry for ${date}.`;
    dates.add(date);
    if (!reading(hrv, 1, 300)) return "HRV must be between 1 and 300 ms.";
    if (!reading(restingHeartRate, 20, 250)) return "Resting heart rate must be between 20 and 250 bpm.";
    days.push({ date, hrv: hrv as number | null, restingHeartRate: restingHeartRate as number | null });
  }
  return days;
}

/** Saves Apple Health HRV and resting heart rate by day. Re-sending a day replaces it. */
export async function POST(request: Request) {
  let session;
  try {
    session = await getRequestSession(request.headers);
  } catch {
    return NextResponse.json({ error: "Your records are temporarily unavailable. Please try again." }, { status: 503 });
  }
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const previewOwner = request.headers.get("X-Baseline-Preview-Owner");
  if (previewOwner !== null && previewOwner !== session.user.id)
    return NextResponse.json({ error: "Your account changed. Preview the records again." }, { status: 409 });

  let days: DayVitals[] | string;
  try {
    const text = await request.text();
    if (text.length > MAX_BYTES) return NextResponse.json({ error: "Send smaller batches." }, { status: 413 });
    days = parse(JSON.parse(text));
  } catch {
    days = "The import payload is invalid.";
  }
  if (typeof days === "string") return NextResponse.json({ error: days }, { status: 400 });

  try {
    return NextResponse.json(await saveVitals(session.user.id, days), { status: 201 });
  } catch {
    console.error("Unable to save heart readings.");
    return NextResponse.json({ error: "Your records are temporarily unavailable. Please try again." }, { status: 503 });
  }
}
