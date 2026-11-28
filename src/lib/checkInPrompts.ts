import type { CheckInField, PromptMetric } from "./checkInValues";

// Metric-aware check-in prompts (T264 rules, T265 calculation). Pure functions with no
// database access, so every rule and every sentence can be unit tested.
//
// The rules, as agreed in the T256 design:
// - Metrics: HRV (SDNN, as Apple Health records it), resting heart rate and last night's sleep.
// - Usual range: the middle 80% (10th to 90th percentile) of the previous 28 days, not counting today.
// - Enough data: at least 14 of those 28 days need a value.
// - Fresh data: the metric needs a value for the check-in date itself.
// - Both directions: a prompt can appear when a metric looks worse or better than usual.
// - Cap: at most two prompts per check-in, largest change first, one per metric.
// - Prompts are questions about how the person feels. They never give advice or fill in an answer.

export const PROMPT_RULES = {
  windowDays: 28,
  minDays: 14,
  lowPercentile: 0.1,
  highPercentile: 0.9,
  maxPrompts: 2,
} as const;

/** Words a prompt must never use (T267 checks every sentence against this list). */
export const BANNED_PROMPT_WORDS = [
  "should",
  "must",
  "warning",
  "risk",
  "danger",
  "alert",
  "recommend",
  "advice",
  "doctor",
  "pots",
  "dysautonomia",
  "tachycardia",
  "illness",
  "disease",
  "sick",
  "overtraining",
];

export type MetricDay = { date: string; value: number };

export type MetricChange =
  | { status: "insufficient"; daysUsed: number }
  | { status: "missing" }
  | {
      status: "usual" | "below" | "above";
      value: number;
      low: number;
      high: number;
      daysUsed: number;
      /** How far outside the range, as a share of the median. 0 when inside. */
      size: number;
    };

export type CheckInPrompt = {
  metric: PromptMetric;
  direction: "below" | "above";
  fieldId: string;
  text: string;
  /** For the "Why?" link: the value, the usual range and the days behind it. */
  value: number;
  low: number;
  high: number;
  daysUsed: number;
  history: MetricDay[];
};

const dayNumber = (date: string) =>
  Math.round(Date.parse(`${date}T12:00:00Z`) / 86_400_000);

/** Linear-interpolated percentile of sorted values, p from 0 to 1. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) throw new Error("percentile of nothing");
  const at = (sorted.length - 1) * p;
  const lower = Math.floor(at);
  const upper = Math.ceil(at);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (at - lower);
}

/**
 * Compares the check-in date's value with the 28 days before it. Days outside that
 * window, and days after the check-in date, are ignored.
 */
export function metricChange(days: MetricDay[], date: string): MetricChange {
  const end = dayNumber(date);
  const prior = days
    .filter((d) => {
      const offset = end - dayNumber(d.date);
      return (
        offset >= 1 &&
        offset <= PROMPT_RULES.windowDays &&
        Number.isFinite(d.value)
      );
    })
    .map((d) => d.value)
    .sort((a, b) => a - b);
  if (prior.length < PROMPT_RULES.minDays)
    return { status: "insufficient", daysUsed: prior.length };
  const today = days.find((d) => d.date === date && Number.isFinite(d.value));
  if (!today) return { status: "missing" };
  const low = percentile(prior, PROMPT_RULES.lowPercentile);
  const high = percentile(prior, PROMPT_RULES.highPercentile);
  const median = percentile(prior, 0.5);
  const value = today.value;
  const status = value < low ? "below" : value > high ? "above" : "usual";
  const distance =
    status === "below" ? low - value : status === "above" ? value - high : 0;
  return {
    status,
    value,
    low,
    high,
    daysUsed: prior.length,
    size: median > 0 ? distance / median : distance,
  };
}

// Which direction reads as "worse" for each metric. Sleep above range is neither, so its
// question stays neutral.
const WORSE: Record<PromptMetric, "below" | "above"> = {
  hrv: "below",
  resting_heart_rate: "above",
  sleep_duration: "below",
};

const formatHours = (minutes: number) => {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
};

const formatSleep = (minutes: number) => {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
};

export const METRIC_NAMES: Record<PromptMetric, string> = {
  hrv: "HRV",
  resting_heart_rate: "resting heart rate",
  sleep_duration: "sleep",
};

/** A metric value with its unit, for the "Why?" details. */
export function formatMetricValue(metric: PromptMetric, value: number) {
  if (metric === "hrv") return `${Math.round(value)} ms`;
  if (metric === "resting_heart_rate") return `${Math.round(value)} bpm`;
  return formatSleep(value);
}

/** The first sentence: what moved, today's value and the usual range. */
export function leadSentence(
  metric: PromptMetric,
  direction: "below" | "above",
  value: number,
  low: number,
  high: number,
) {
  const word = direction === "below" ? "lower" : "higher";
  if (metric === "hrv")
    return `HRV is ${word} than usual (${Math.round(value)} ms, usual ${Math.round(low)} to ${Math.round(high)}).`;
  if (metric === "resting_heart_rate")
    return `Resting heart rate is ${word} than usual (${Math.round(value)} bpm, usual ${Math.round(low)} to ${Math.round(high)}).`;
  return `You slept ${formatSleep(value)}, ${direction === "below" ? "less" : "more"} than your usual ${formatHours(low)} to ${formatHours(high)} h.`;
}

/** The question about the linked field. Always a question, never a conclusion. */
export function questionFor(
  metric: PromptMetric,
  direction: "below" | "above",
  field: Pick<CheckInField, "label" | "systemKey">,
) {
  const worse = direction === WORSE[metric];
  const neutral = metric === "sleep_duration";
  if (field.systemKey === "energy") {
    if (neutral) return "How is your energy today?";
    if (metric === "hrv")
      return worse
        ? "Is your energy lower than usual today?"
        : "Do you have more energy than usual today?";
    return worse
      ? "Is your energy lower than usual today?"
      : "Is your energy any different from usual today?";
  }
  const name = field.label.toLowerCase();
  if (neutral) return `How is your ${name} today?`;
  return worse
    ? `Any more ${name} than usual today?`
    : `Any less ${name} than usual today?`;
}

/**
 * Fields a metric can ask about, best first. Energy comes first for HRV and sleep. For
 * resting heart rate a symptom linked to it (such as Dizziness) comes before Energy.
 * Only active score fields that list the metric take part.
 */
export function linkedFields(
  metric: PromptMetric,
  fields: CheckInField[],
): CheckInField[] {
  const linked = fields.filter(
    (f) => !f.retired && f.kind === "score" && f.promptMetrics.includes(metric),
  );
  const energyFirst = metric !== "resting_heart_rate";
  return [...linked].sort((a, b) => {
    const ea = a.systemKey === "energy" ? 0 : 1;
    const eb = b.systemKey === "energy" ? 0 : 1;
    if (ea !== eb) return energyFirst ? ea - eb : eb - ea;
    return a.position - b.position;
  });
}

/**
 * Prompts are for a check-in about today or yesterday. Allows a day either side of the
 * server's UTC date so every time zone's "today" and "yesterday" count.
 */
export function isPromptDate(date: string, now: Date) {
  const today = Math.round(Date.parse(`${now.toISOString().slice(0, 10)}T12:00:00Z`) / 86_400_000);
  const offset = today - dayNumber(date);
  return offset >= -1 && offset <= 2;
}

/** Up to two prompts for a check-in date, largest change first. */
export function buildPrompts(
  date: string,
  history: Partial<Record<PromptMetric, MetricDay[]>>,
  fields: CheckInField[],
): CheckInPrompt[] {
  const candidates: Array<{ prompt: CheckInPrompt; size: number }> = [];
  for (const metric of Object.keys(history) as PromptMetric[]) {
    const days = history[metric] ?? [];
    const change = metricChange(days, date);
    if (change.status !== "below" && change.status !== "above") continue;
    const [field] = linkedFields(metric, fields);
    if (!field) continue;
    const end = dayNumber(date);
    candidates.push({
      size: change.size,
      prompt: {
        metric,
        direction: change.status,
        fieldId: field.id,
        text: `${leadSentence(metric, change.status, change.value, change.low, change.high)} ${questionFor(metric, change.status, field)}`,
        value: change.value,
        low: change.low,
        high: change.high,
        daysUsed: change.daysUsed,
        history: days
          .filter(
            (d) =>
              end - dayNumber(d.date) >= 0 &&
              end - dayNumber(d.date) <= PROMPT_RULES.windowDays,
          )
          .sort((a, b) => a.date.localeCompare(b.date)),
      },
    });
  }
  return candidates
    .sort((a, b) => b.size - a.size)
    .slice(0, PROMPT_RULES.maxPrompts)
    .map(({ prompt }) => prompt);
}
