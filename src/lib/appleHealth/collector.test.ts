import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AppleHealthCollector, collectAppleHealthXml, deviceLabel, parseTimestamp } from "./collector";

const fixture = readFileSync(path.join(__dirname, "..", "..", "test", "fixtures", "apple-health", "export.xml"), "utf8");

describe("collectAppleHealthXml with the synthetic export", () => {
  const { days } = collectAppleHealthXml(fixture);
  const byDate = Object.fromEntries(days.map((day) => [day.date, day]));

  it("returns one row per local date that had data, in order", () => {
    expect(days.map((day) => day.date)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
  });

  it("uses the Watch's steps when iPhone and Watch both counted", () => {
    expect(byDate["2026-11-02"].steps).toBe(5500);
    expect(byDate["2026-11-02"].sources.steps).toBe("Apple Watch");
  });

  it("falls back to the iPhone when the Watch has nothing for the day", () => {
    expect(byDate["2026-11-03"].steps).toBe(2100);
    expect(byDate["2026-11-03"].sources.steps).toBe("iPhone");
  });

  it("prefers the Activity ring total and treats Cal as kcal", () => {
    expect(byDate["2026-11-02"].moveCalories).toBe(411);
    expect(byDate["2026-11-02"].sources.moveCalories).toBe("Activity rings");
  });

  it("converts kJ and ignores a zero ring when energy records exist", () => {
    // (85 + 35.5) kJ / 4.184 = 28.8 kcal
    expect(byDate["2026-11-03"].moveCalories).toBe(29);
    expect(byDate["2026-11-03"].sources.moveCalories).toBe("iPhone");
    // 1255.2 kJ / 4.184 = 300 kcal
    expect(byDate["2026-11-04"].moveCalories).toBe(300);
  });

  it("credits sleep across midnight to the day of waking, counting only asleep stages", () => {
    // Core 140 + Deep 60 + REM 45 + Core 195. In Bed, Awake and the sleep app's copy are left out.
    expect(byDate["2026-11-02"].restMinutes).toBe(440);
    expect(byDate["2026-11-02"].sources.restMinutes).toBe("Apple Watch");
    expect(byDate["2026-11-05"].restMinutes).toBe(420);
  });

  it("uses each record's own time zone to pick the day", () => {
    // 00:30 +0900 is 15:30 on 3 Nov in UTC, but the steps belong to 4 Nov.
    expect(byDate["2026-11-04"].steps).toBe(6800);
  });

  it("adds mindful minutes across apps", () => {
    expect(byDate["2026-11-02"].breatheMinutes).toBe(15);
    expect(byDate["2026-11-02"].sources.breatheMinutes).toBe("Apple Watch, Sample Meditation & Breath");
  });

  it("leaves totals blank instead of zero when nothing was recorded", () => {
    expect(byDate["2026-11-03"]).toMatchObject({ restMinutes: null, breatheMinutes: null });
    expect(byDate["2026-11-05"]).toMatchObject({ moveCalories: null, breatheMinutes: null });
  });

  it("gives the same result when the file arrives in small pieces", () => {
    const collector = new AppleHealthCollector();
    for (let i = 0; i < fixture.length; i += 37) collector.push(fixture.slice(i, i + 37));
    expect(collector.finish().days).toEqual(days);
  });
});

describe("parseTimestamp", () => {
  it("keeps the local date and converts to an instant using the offset", () => {
    const parsed = parseTimestamp("2026-11-04 00:30:00 +0900");
    expect(parsed?.date).toBe("2026-11-04");
    expect(new Date(parsed!.ms).toISOString()).toBe("2026-11-03T15:30:00.000Z");
  });

  it("rejects anything else", () => {
    expect(parseTimestamp("2026-11-04T00:30:00Z")).toBeNull();
    expect(parseTimestamp(undefined)).toBeNull();
  });
});

describe("deviceLabel", () => {
  it("reads the device model, then falls back to the source name", () => {
    expect(deviceLabel({ device: "<<HKDevice: 0x1>, name:Apple Watch, model:Watch, hardware:Watch7,1>" })).toBe("Apple Watch");
    expect(deviceLabel({ device: "<<HKDevice: 0x2>, name:iPhone, model:iPhone>" })).toBe("iPhone");
    expect(deviceLabel({ sourceName: "Sam’s Apple Watch" })).toBe("Apple Watch");
    expect(deviceLabel({ sourceName: "Sam’s iPhone" })).toBe("iPhone");
    expect(deviceLabel({ sourceName: "Running App" })).toBe("Running App");
    expect(deviceLabel({})).toBe("Unknown source");
  });
});

describe("edge cases", () => {
  const record = (attributes: string) => `<Record ${attributes}/>`;

  it("caps minutes at a full day and picks the biggest third-party source", () => {
    const xml = [
      record('type="HKCategoryTypeIdentifierMindfulSession" sourceName="App" startDate="2026-01-01 00:00:00 +0000" endDate="2026-01-02 06:00:00 +0000"'),
      record('type="HKQuantityTypeIdentifierStepCount" sourceName="Small App" startDate="2026-01-01 10:00:00 +0000" endDate="2026-01-01 10:10:00 +0000" value="100"'),
      record('type="HKQuantityTypeIdentifierStepCount" sourceName="Big App" startDate="2026-01-01 10:00:00 +0000" endDate="2026-01-01 10:10:00 +0000" value="900"'),
    ].join("\n");
    const [day] = collectAppleHealthXml(xml).days;
    expect(day.breatheMinutes).toBe(1440);
    expect(day.steps).toBe(900);
    expect(day.sources.steps).toBe("Big App");
  });

  it("skips records with unknown energy units or broken dates", () => {
    const xml = [
      record('type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="A" unit="erg" startDate="2026-01-01 10:00:00 +0000" endDate="2026-01-01 10:10:00 +0000" value="100"'),
      record('type="HKQuantityTypeIdentifierStepCount" sourceName="A" startDate="yesterday" endDate="2026-01-01 10:10:00 +0000" value="100"'),
    ].join("\n");
    expect(collectAppleHealthXml(xml).days).toEqual([]);
  });

  it("splits two sleeps more than four hours apart into separate nights", () => {
    const sleep = (start: string, end: string) =>
      record(`type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" device="model:Watch" startDate="${start}" endDate="${end}" value="HKCategoryValueSleepAnalysisAsleepCore"`);
    const xml = [
      sleep("2026-01-01 23:00:00 +0000", "2026-01-02 07:00:00 +0000"),
      sleep("2026-01-02 14:00:00 +0000", "2026-01-02 14:30:00 +0000"),
      sleep("2026-01-02 23:30:00 +0000", "2026-01-03 06:30:00 +0000"),
    ].join("\n");
    const days = collectAppleHealthXml(xml).days;
    expect(days.map((day) => [day.date, day.restMinutes])).toEqual([["2026-01-02", 510], ["2026-01-03", 420]]);
  });
});
