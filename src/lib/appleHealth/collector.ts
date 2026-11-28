// Turns the records in an Apple Health export.xml into Baseline daily totals.
// Runs in the browser: the export itself never leaves the person's computer.

export type MetricKey = "steps" | "moveCalories" | "restMinutes" | "breatheMinutes";

export type AppleHealthDay = {
  date: string;
  steps: number | null;
  moveCalories: number | null;
  restMinutes: number | null;
  breatheMinutes: number | null;
  /** Which device or app each total came from, for the preview. */
  sources: Partial<Record<MetricKey, string>>;
};

/** One day's heart readings, kept apart from the totals because a day can have only these. */
export type AppleHealthVitals = {
  date: string;
  /** Mean HRV (SDNN) in ms from the preferred device, or null. */
  hrv: number | null;
  /** Resting heart rate in bpm from the preferred device, or null. */
  restingHeartRate: number | null;
};

export type AppleHealthSummary = {
  days: AppleHealthDay[];
  vitals: AppleHealthVitals[];
  recordsUsed: number;
};

const STEPS = "HKQuantityTypeIdentifierStepCount";
const ACTIVE_ENERGY = "HKQuantityTypeIdentifierActiveEnergyBurned";
const SLEEP = "HKCategoryTypeIdentifierSleepAnalysis";
const MINDFUL = "HKCategoryTypeIdentifierMindfulSession";
const HRV = "HKQuantityTypeIdentifierHeartRateVariabilitySDNN";
const RESTING_HR = "HKQuantityTypeIdentifierRestingHeartRate";
const wantedTypes = new Set([STEPS, ACTIVE_ENERGY, SLEEP, MINDFUL, HRV, RESTING_HR]);
// Readings outside these are sensor glitches, not physiology.
const HRV_RANGE = [1, 300] as const;
const RESTING_HR_RANGE = [20, 250] as const;

// Core, Deep and REM, plus the older "Asleep" values from before watchOS 9
// and third-party apps that don't record stages. In Bed and Awake are left out.
const asleepValues = new Set([
  "HKCategoryValueSleepAnalysisAsleep",
  "HKCategoryValueSleepAnalysisAsleepUnspecified",
  "HKCategoryValueSleepAnalysisAsleepCore",
  "HKCategoryValueSleepAnalysisAsleepDeep",
  "HKCategoryValueSleepAnalysisAsleepREM",
]);

// Sleep segments closer together than this belong to the same night.
const NIGHT_GAP_MS = 4 * 60 * 60 * 1000;
const MAX_MINUTES = 1440;
const MAX_INTEGER = 2147483647;

type Instant = { date: string; ms: number };
type Interval = { start: number; end: number; endDate: string };

const timestampPattern = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/;

/** Apple writes "2026-11-20 08:15:00 -0800": local wall time plus its offset. */
export function parseTimestamp(value: string | undefined): Instant | null {
  const match = value ? timestampPattern.exec(value.trim()) : null;
  if (!match) return null;
  const [, y, mo, d, h, mi, s, sign, oh, om] = match;
  const offsetMinutes = (sign === "-" ? -1 : 1) * (Number(oh) * 60 + Number(om));
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - offsetMinutes * 60_000;
  return Number.isFinite(ms) ? { date: `${y}-${mo}-${d}`, ms } : null;
}

/** Groups records by the device that made them, so iPhone and Watch copies of the same walk aren't added together. */
export function deviceLabel(attributes: Record<string, string>): string {
  const device = attributes.device ?? "";
  const source = attributes.sourceName ?? "";
  if (/model:\s*Watch/i.test(device)) return "Apple Watch";
  if (/model:\s*iPhone/i.test(device)) return "iPhone";
  if (/apple\s*watch/i.test(source)) return "Apple Watch";
  if (/iphone/i.test(source)) return "iPhone";
  return source.trim() || "Unknown source";
}

/** Watch first, then iPhone, then whichever other app recorded the most. */
function pickPreferred(totals: Map<string, number>): [string, number] | null {
  for (const label of ["Apple Watch", "iPhone"]) {
    const value = totals.get(label);
    if (value !== undefined) return [label, value];
  }
  let best: [string, number] | null = null;
  for (const entry of totals) if (!best || entry[1] > best[1]) best = entry;
  return best;
}

function toKilocalories(value: number, unit: string | undefined): number | null {
  const normalized = (unit ?? "").trim().toLowerCase();
  if (normalized === "kcal" || normalized === "cal") return value;
  if (normalized === "kj") return value / 4.184;
  return null;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      if (interval.end > last.end) {
        last.end = interval.end;
        last.endDate = interval.endDate;
      }
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

const minutes = (interval: Interval) => (interval.end - interval.start) / 60_000;

function addTo<K>(map: Map<K, Map<string, number>>, key: K, label: string, amount: number) {
  let inner = map.get(key);
  if (!inner) map.set(key, (inner = new Map()));
  inner.set(label, (inner.get(label) ?? 0) + amount);
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodeEntities = (value: string) =>
  value.includes("&")
    ? value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (whole, name: string) => {
        if (name[0] !== "#") return entities[name.toLowerCase()] ?? whole;
        const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
      })
    : value;

export function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of tag.matchAll(/([A-Za-z_][\w.:-]*)\s*=\s*"([^"]*)"/g)) {
    attributes[match[1]] = decodeEntities(match[2]);
  }
  return attributes;
}

/** Index of the ">" that closes the tag opened at `start`, or -1 if it hasn't arrived yet. */
function findTagEnd(text: string, start: number): number {
  let quoted = false;
  for (let i = start + 1; i < text.length; i++) {
    const char = text.charCodeAt(i);
    if (char === 34) quoted = !quoted;
    else if (char === 62 && !quoted) return i;
  }
  return -1;
}

const isSpace = (char: string | undefined) => char === " " || char === "\n" || char === "\t" || char === "\r";

/**
 * Reads export.xml text a piece at a time. Only `<Record>` and
 * `<ActivitySummary>` tags for the four Baseline totals are kept, so memory
 * stays small even for exports of several hundred megabytes.
 */
export class AppleHealthCollector {
  private buffer = "";
  private recordsUsed = 0;
  private steps = new Map<string, Map<string, number>>();
  private energy = new Map<string, Map<string, number>>();
  private summaries = new Map<string, number>();
  private sleep = new Map<string, Interval[]>();
  private mindful = new Map<string, Interval[]>();
  private mindfulSources = new Map<string, Set<string>>();
  // date -> device -> [sum, count]
  private hrv = new Map<string, Map<string, [number, number]>>();
  private restingHr = new Map<string, Map<string, [number, number]>>();

  private addReading(map: Map<string, Map<string, [number, number]>>, date: string, label: string, value: number) {
    let byDevice = map.get(date);
    if (!byDevice) map.set(date, (byDevice = new Map()));
    const [sum, count] = byDevice.get(label) ?? [0, 0];
    byDevice.set(label, [sum + value, count + 1]);
  }

  push(text: string) {
    const buffer = this.buffer + text;
    let position = 0;
    while (true) {
      const open = buffer.indexOf("<", position);
      if (open === -1) {
        position = buffer.length;
        break;
      }
      // Keep a short tail until we can tell which tag it is.
      if (buffer.length - open < 18) {
        position = open;
        break;
      }
      const isRecord = buffer.startsWith("<Record", open) && isSpace(buffer[open + 7]);
      const isSummary = !isRecord && buffer.startsWith("<ActivitySummary", open) && isSpace(buffer[open + 16]);
      if (!isRecord && !isSummary) {
        position = open + 1;
        continue;
      }
      const close = findTagEnd(buffer, open);
      if (close === -1) {
        position = open;
        break;
      }
      const tag = buffer.slice(open, close + 1);
      if (isRecord) this.handleRecord(tag);
      else this.handleSummary(tag);
      position = close + 1;
    }
    this.buffer = buffer.slice(position);
  }

  private handleRecord(tag: string) {
    const type = /\btype="([^"]*)"/.exec(tag)?.[1];
    if (!type || !wantedTypes.has(type)) return;
    const attributes = parseAttributes(tag);
    const start = parseTimestamp(attributes.startDate);
    const end = parseTimestamp(attributes.endDate);
    if (!start || !end || end.ms < start.ms) return;
    const label = deviceLabel(attributes);

    if (type === STEPS || type === ACTIVE_ENERGY) {
      const value = Number(attributes.value);
      if (!Number.isFinite(value) || value < 0) return;
      if (type === STEPS) {
        addTo(this.steps, start.date, label, value);
      } else {
        const kcal = toKilocalories(value, attributes.unit);
        if (kcal === null) return;
        addTo(this.energy, start.date, label, kcal);
      }
    } else if (type === HRV || type === RESTING_HR) {
      const value = Number(attributes.value);
      const [min, max] = type === HRV ? HRV_RANGE : RESTING_HR_RANGE;
      const unitOk = type === HRV ? attributes.unit === "ms" : attributes.unit === "count/min";
      if (!unitOk || !Number.isFinite(value) || value < min || value > max) return;
      this.addReading(type === HRV ? this.hrv : this.restingHr, start.date, label, value);
    } else if (type === SLEEP) {
      if (!asleepValues.has(attributes.value)) return;
      pushTo(this.sleep, label, { start: start.ms, end: end.ms, endDate: end.date });
    } else {
      pushTo(this.mindful, start.date, { start: start.ms, end: end.ms, endDate: end.date });
      let labels = this.mindfulSources.get(start.date);
      if (!labels) this.mindfulSources.set(start.date, (labels = new Set()));
      labels.add(label);
    }
    this.recordsUsed++;
  }

  private handleSummary(tag: string) {
    const attributes = parseAttributes(tag);
    const date = attributes.dateComponents;
    const value = Number(attributes.activeEnergyBurned);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value) || value < 0) return;
    const kcal = toKilocalories(value, attributes.activeEnergyBurnedUnit);
    if (kcal === null) return;
    this.summaries.set(date, kcal);
    this.recordsUsed++;
  }

  finish(): AppleHealthSummary {
    const days = new Map<string, AppleHealthDay>();
    const day = (date: string) => {
      let entry = days.get(date);
      if (!entry) {
        entry = { date, steps: null, moveCalories: null, restMinutes: null, breatheMinutes: null, sources: {} };
        days.set(date, entry);
      }
      return entry;
    };

    for (const [date, totals] of this.steps) {
      const picked = pickPreferred(totals);
      if (!picked) continue;
      const entry = day(date);
      entry.steps = Math.min(Math.round(picked[1]), MAX_INTEGER);
      entry.sources.steps = picked[0];
    }

    // The Activity ring total is what the Fitness app shows, so it wins when
    // present. A zero ring with no energy records usually means the watch
    // wasn't worn, so it doesn't count as an observed zero.
    const energyDates = new Set([...this.energy.keys(), ...this.summaries.keys()]);
    for (const date of energyDates) {
      const summary = this.summaries.get(date);
      const records = this.energy.get(date);
      let total: number;
      let source: string;
      if (summary !== undefined && (summary > 0 || !records)) {
        if (summary === 0) continue;
        total = summary;
        source = "Activity rings";
      } else {
        const picked = records && pickPreferred(records);
        if (!picked) continue;
        [source, total] = picked;
      }
      const entry = day(date);
      entry.moveCalories = Math.min(Math.round(total), MAX_INTEGER);
      entry.sources.moveCalories = source;
    }

    // A night of sleep is credited to the day you wake up.
    const sleepByDate = new Map<string, Map<string, number>>();
    for (const [label, intervals] of this.sleep) {
      let night: Interval[] = [];
      const closeNight = () => {
        if (!night.length) return;
        const total = night.reduce((sum, interval) => sum + minutes(interval), 0);
        addTo(sleepByDate, night[night.length - 1].endDate, label, total);
        night = [];
      };
      for (const interval of mergeIntervals(intervals)) {
        const last = night[night.length - 1];
        if (last && interval.start - last.end > NIGHT_GAP_MS) closeNight();
        night.push(interval);
      }
      closeNight();
    }
    for (const [date, totals] of sleepByDate) {
      const picked = pickPreferred(totals);
      if (!picked) continue;
      const entry = day(date);
      entry.restMinutes = Math.min(Math.round(picked[1]), MAX_MINUTES);
      entry.sources.restMinutes = picked[0];
    }

    // Mindful sessions from different apps are separate sessions, so they add
    // up. Overlaps are only counted once.
    for (const [date, intervals] of this.mindful) {
      const total = mergeIntervals(intervals).reduce((sum, interval) => sum + minutes(interval), 0);
      const entry = day(date);
      entry.breatheMinutes = Math.min(Math.round(total), MAX_MINUTES);
      entry.sources.breatheMinutes = [...(this.mindfulSources.get(date) ?? [])].sort().join(", ");
    }

    // Heart readings: the mean of the day's readings from the preferred device.
    const vitals = new Map<string, AppleHealthVitals>();
    const mean = (byDevice: Map<string, [number, number]>) => {
      const counts = new Map([...byDevice].map(([label, [, count]]) => [label, count]));
      const picked = pickPreferred(counts);
      if (!picked) return null;
      const [sum, count] = byDevice.get(picked[0])!;
      return Math.round((sum / count) * 10) / 10;
    };
    for (const [key, map] of [["hrv", this.hrv], ["restingHeartRate", this.restingHr]] as const) {
      for (const [date, byDevice] of map) {
        const value = mean(byDevice);
        if (value === null) continue;
        let entry = vitals.get(date);
        if (!entry) vitals.set(date, (entry = { date, hrv: null, restingHeartRate: null }));
        entry[key] = value;
      }
    }

    return {
      days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      vitals: [...vitals.values()].sort((a, b) => a.date.localeCompare(b.date)),
      recordsUsed: this.recordsUsed,
    };
  }
}

export function collectAppleHealthXml(xml: string): AppleHealthSummary {
  const collector = new AppleHealthCollector();
  collector.push(xml);
  return collector.finish();
}
