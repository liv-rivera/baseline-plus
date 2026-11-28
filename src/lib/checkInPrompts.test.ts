import { describe, expect, it } from "vitest";
import {
  BANNED_PROMPT_WORDS,
  buildPrompts,
  leadSentence,
  linkedFields,
  metricChange,
  percentile,
  questionFor,
  type MetricDay,
} from "./checkInPrompts";
import { PROMPT_METRICS, SYMPTOM_SCORE_LABELS, type CheckInField } from "./checkInValues";

const DATE = "2026-11-28";

/** `count` days before DATE with values cycling through `values`, plus today's value. */
function series(values: number[], today: number | null, count = 28): MetricDay[] {
  const days: MetricDay[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(`${DATE}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    days.push({ date: d.toISOString().slice(0, 10), value: values[i % values.length] });
  }
  if (today !== null) days.push({ date: DATE, value: today });
  return days;
}

const field = (over: Partial<CheckInField>): CheckInField => ({
  id: over.label ?? "f",
  label: "Field",
  kind: "score",
  scoreLabels: SYMPTOM_SCORE_LABELS,
  unit: null,
  position: 0,
  systemKey: null,
  preset: null,
  promptMetrics: [],
  retired: false,
  ...over,
});

const energy = field({ id: "energy", label: "Energy", systemKey: "energy", promptMetrics: ["hrv", "resting_heart_rate", "sleep_duration"] });
const dizziness = field({ id: "dizziness", label: "Dizziness", position: 3, promptMetrics: ["resting_heart_rate"] });
const brainFog = field({ id: "fog", label: "Brain fog", position: 4, promptMetrics: ["sleep_duration"] });

describe("usual range", () => {
  it("interpolates percentiles", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([10, 20], 0.1)).toBe(11);
  });

  it("uses the middle 80% of the 28 days before, not today", () => {
    // 28 days of 1 to 28: the 10th and 90th percentiles are 3.7 and 25.3.
    const ramp = Array.from({ length: 28 }, (_, i) => i + 1);
    expect(metricChange(series(ramp, 3), DATE)).toMatchObject({ status: "below", value: 3, daysUsed: 28 });
    const range = metricChange(series(ramp, 26), DATE);
    expect(range).toMatchObject({ status: "above" });
    if (range.status === "above") {
      expect(range.low).toBeCloseTo(3.7);
      expect(range.high).toBeCloseTo(25.3);
    }
    // Today's own value never widens its range.
    expect(metricChange(series([40, 45, 50, 55, 60], 50), DATE)).toMatchObject({ status: "usual", size: 0 });
    expect(metricChange(series([40, 45, 50, 55, 60], 70), DATE)).toMatchObject({ status: "above" });
  });

  it("needs 14 earlier days and a value for the check-in date", () => {
    expect(metricChange(series([50], 30, 13), DATE)).toEqual({ status: "insufficient", daysUsed: 13 });
    expect(metricChange(series([50, 55], 30, 14), DATE)).toMatchObject({ status: "below", daysUsed: 14 });
    // Stale data: yesterday's reading isn't today's.
    expect(metricChange(series([50, 55], null), DATE)).toEqual({ status: "missing" });
    // Days older than 28 or after the check-in date don't count.
    const outside = [...series([50], null, 40), { date: "2026-11-29", value: 10 }, { date: DATE, value: 50 }];
    expect(metricChange(outside, DATE)).toMatchObject({ daysUsed: 28, status: "usual" });
  });
});

describe("wording", () => {
  it("matches the agreed examples", () => {
    expect(leadSentence("hrv", "below", 38, 45, 62)).toBe("HRV is lower than usual (38 ms, usual 45 to 62).");
    expect(questionFor("hrv", "below", energy)).toBe("Is your energy lower than usual today?");
    expect(questionFor("hrv", "above", energy)).toBe("Do you have more energy than usual today?");
    expect(leadSentence("resting_heart_rate", "above", 68, 56, 63)).toBe(
      "Resting heart rate is higher than usual (68 bpm, usual 56 to 63).",
    );
    expect(questionFor("resting_heart_rate", "above", dizziness)).toBe("Any more dizziness than usual today?");
    expect(questionFor("resting_heart_rate", "below", dizziness)).toBe("Any less dizziness than usual today?");
    expect(leadSentence("sleep_duration", "below", 310, 390, 480)).toBe("You slept 5 h 10 min, less than your usual 6.5 to 8 h.");
    expect(leadSentence("sleep_duration", "above", 540, 390, 480)).toBe("You slept 9 h, more than your usual 6.5 to 8 h.");
    expect(questionFor("sleep_duration", "above", energy)).toBe("How is your energy today?");
    expect(questionFor("sleep_duration", "below", brainFog)).toBe("How is your brain fog today?");
  });

  it("never uses advice, alarm or condition words, and always asks a question", () => {
    for (const metric of PROMPT_METRICS) {
      for (const direction of ["below", "above"] as const) {
        for (const f of [energy, dizziness, brainFog, field({ label: "Pain" })]) {
          const text = `${leadSentence(metric, direction, 50, 40, 60)} ${questionFor(metric, direction, f)}`;
          expect(text.endsWith("?"), text).toBe(true);
          for (const word of BANNED_PROMPT_WORDS)
            expect(new RegExp(`\\b${word}`, "i").test(text), `${text} contains ${word}`).toBe(false);
        }
      }
    }
  });
});

describe("prompts for a check-in", () => {
  it("links each metric to the right field, falling back when it's missing", () => {
    const fields = [energy, dizziness, brainFog];
    expect(linkedFields("resting_heart_rate", fields).map((f) => f.id)).toEqual(["dizziness", "energy"]);
    expect(linkedFields("sleep_duration", fields).map((f) => f.id)).toEqual(["energy", "fog"]);
    expect(linkedFields("hrv", fields).map((f) => f.id)).toEqual(["energy"]);
    // Hidden fields, non-score fields and unlinked fields don't take part.
    expect(linkedFields("resting_heart_rate", [{ ...dizziness, retired: true }, energy]).map((f) => f.id)).toEqual(["energy"]);
    expect(linkedFields("hrv", [{ ...energy, promptMetrics: [] }])).toEqual([]);
    expect(linkedFields("hrv", [{ ...energy, kind: "yes_no" }])).toEqual([]);
  });

  it("shows at most two, largest change first, one per metric", () => {
    const prompts = buildPrompts(
      DATE,
      {
        hrv: series([45, 50, 55, 60], 40), // a little below
        resting_heart_rate: series([56, 58, 60, 62], 80), // far above
        sleep_duration: series([400, 420, 440, 460], 300), // well below
      },
      [energy, dizziness, brainFog],
    );
    expect(prompts.map((p) => [p.metric, p.direction, p.fieldId])).toEqual([
      ["resting_heart_rate", "above", "dizziness"],
      ["sleep_duration", "below", "energy"],
    ]);
    expect(prompts[0].text).toMatch(/^Resting heart rate is higher than usual \(80 bpm, usual 56 to 62\)\. Any more dizziness/);
    expect(prompts[0].history).toHaveLength(29);
    expect(prompts[0]).toMatchObject({ daysUsed: 28, value: 80 });
  });

  it("stays quiet with usual values, too little data or nothing to link to", () => {
    expect(buildPrompts(DATE, { hrv: series([45, 50, 55], 50) }, [energy])).toEqual([]);
    expect(buildPrompts(DATE, { hrv: series([45, 50, 55], 10, 10) }, [energy])).toEqual([]);
    expect(buildPrompts(DATE, { hrv: series([45, 50, 55], 10) }, [dizziness])).toEqual([]);
    expect(buildPrompts(DATE, {}, [energy])).toEqual([]);
  });
});
