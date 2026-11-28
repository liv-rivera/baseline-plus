// Fictional sample records shared by the /demo page and the demo account seed
// (scripts/generate-demo-seed.ts writes database/seed.sql from this file).
// Keep this file free of "@/" imports so Node can run the seed script directly.
import type { Averages, DailyMetrics } from "../types/metrics";

export const SAMPLE_DAYS = 42;

type Sport = "run" | "ride" | "swim" | "yoga" | "strength";

// One training week, Monday first. A rest day sits mid-week.
const weekPlan: Array<Sport | null> = ["run", "yoga", "ride", null, "strength", "run", "swim"];

const sessionNames: Record<Sport, string[]> = {
  run: ["Easy run", "Tempo run", "Long run"],
  ride: ["Zone 2 ride", "Hill ride"],
  swim: ["Pool swim", "Open-water swim"],
  yoga: ["Yoga flow", "Restorative yoga"],
  strength: ["Strength (light)", "Mobility and strength"],
};

const minutesBySport: Record<Sport, number> = { run: 42, ride: 70, swim: 35, yoga: 35, strength: 35 };
const kcalPerMinute: Record<Sport, number> = { run: 10, ride: 8, swim: 8, yoga: 3, strength: 5 };
const stepsPerMinute: Partial<Record<Sport, number>> = { run: 160 };

// Days 20 to 26 of the six weeks are a flare: less training, more rest, low readiness.
const FLARE_START = 20;
const FLARE_END = 26;

const addDays = (date: string, offset: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};

export const isSampleFlareDay = (index: number) => index >= FLARE_START && index <= FLARE_END;

/**
 * Six weeks of believable records for someone who runs, rides, swims, does yoga
 * and light strength work, with one flare week in the middle. The same end date
 * always produces the same records.
 */
export function generateSampleMetrics(endDate: string, days = SAMPLE_DAYS): DailyMetrics[] {
  let seed = 20261127;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const between = (min: number, max: number) => Math.round(min + random() * (max - min));
  const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];

  return Array.from({ length: days }, (_, index) => {
    const date = addDays(endDate, index - (days - 1));
    const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
    const flare = isSampleFlareDay(index);
    const planned = weekPlan[weekday];
    const id = (kind: string, n: number) => `sample-${date}-${kind}-${n}`;

    const sessions: Array<{ sport: Sport; minutes: number }> = [];
    if (flare) {
      if (index % 2 === 0) sessions.push({ sport: "yoga", minutes: between(15, 25) });
    } else if (planned) {
      const recovering = index > FLARE_END && index <= FLARE_END + 4;
      const scale = recovering ? 0.75 : 0.85 + random() * 0.35;
      sessions.push({ sport: planned, minutes: Math.round(minutesBySport[planned] * scale) });
    }

    const walkingSteps = flare ? between(2400, 4200) : between(4800, 7600);
    const activities = sessions.map((session, n) => ({
      id: id("move", n),
      name: pick(sessionNames[session.sport]),
      durationMinutes: session.minutes,
      calories: Math.round(session.minutes * kcalPerMinute[session.sport] * (0.9 + random() * 0.2)),
    }));
    const walkMinutes = Math.round(walkingSteps / 105);
    activities.push({ id: id("move", 9), name: "Everyday walking", durationMinutes: walkMinutes, calories: Math.round(walkMinutes * 3.4) });

    const stepActivities = [
      ...sessions.flatMap((session, n) => {
        const rate = stepsPerMinute[session.sport];
        return rate ? [{ id: id("steps", n), name: activities[n].name, durationMinutes: session.minutes, steps: session.minutes * rate }] : [];
      }),
      { id: id("steps", 9), name: "Everyday walking", durationMinutes: walkMinutes, steps: walkingSteps },
    ];

    const sleep = flare ? between(500, 590) : between(410, 500);
    const restPeriods = [{ id: id("rest", 0), name: "Overnight sleep", durationMinutes: sleep }];
    if (flare || random() < 0.2) restPeriods.push({ id: id("rest", 1), name: "Afternoon rest", durationMinutes: between(25, 60) });

    const breathworkSessions = random() < (flare ? 0.9 : 0.55)
      ? [{ id: id("breathe", 0), name: pick(["Box breathing", "Guided breathing", "Slow exhale"]), durationMinutes: between(5, 12) }]
      : [];

    const hardDay = planned === "ride" || planned === "run";
    const readinessScore = flare
      ? between(34, 52)
      : index > FLARE_END && index <= FLARE_END + 3
        ? between(55, 68)
        : between(66, 88) - (hardDay ? 4 : 0);

    // Check-ins are skipped on some ordinary days, as real people do.
    const checkIn = flare || random() < 0.7
      ? {
          energy: flare ? between(1, 2) : between(3, 5),
          soreness: flare ? between(3, 5) : hardDay ? between(2, 3) : between(1, 2),
          symptoms: [
            { label: "Dizziness", kind: "score" as const, value: flare ? between(3, 5) : between(1, 2) },
            { label: "Flare today", kind: "yes_no" as const, value: flare },
            { label: "Fluids", kind: "number" as const, value: between(18, 30) / 10, unit: "L" },
          ],
        }
      : undefined;

    return {
      date,
      source: "demo" as const,
      steps: stepActivities.reduce((sum, a) => sum + a.steps, 0),
      moveCalories: activities.reduce((sum, a) => sum + a.calories, 0),
      restMinutes: restPeriods.reduce((sum, r) => sum + r.durationMinutes, 0),
      breatheMinutes: breathworkSessions.reduce((sum, b) => sum + b.durationMinutes, 0),
      readinessScore,
      ...(checkIn && { checkIn }),
      activities,
      stepActivities,
      restPeriods,
      breathworkSessions,
    };
  });
}

/** Whole-history averages, matching what the metrics API returns for an account. */
export function averageMetrics(rows: DailyMetrics[]): Averages {
  const average = (key: keyof Averages) => {
    const values = rows.map((row) => row[key]).filter((value): value is number => typeof value === "number");
    return values.length ? Math.floor(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  };
  return { steps: average("steps"), moveCalories: average("moveCalories"), restMinutes: average("restMinutes"), breatheMinutes: average("breatheMinutes") };
}
