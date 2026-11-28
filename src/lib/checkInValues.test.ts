import { describe, expect, it } from "vitest";
import { fieldDraftError, parseCheckInAnswer } from "./checkInValues";

describe("parseCheckInAnswer", () => {
  const score = { kind: "score" as const, label: "Energy" };
  const yesNo = { kind: "yes_no" as const, label: "Flare today" };
  const number = { kind: "number" as const, label: "Fluids" };
  const notes = { kind: "notes" as const, label: "Notes" };

  it("treats empty input as not recorded for every type", () => {
    for (const field of [score, yesNo, number, notes])
      for (const raw of ["", "  ", null, undefined]) expect(parseCheckInAnswer(field, raw)).toBeNull();
    expect(parseCheckInAnswer(notes, { tags: [], note: " " })).toBeNull();
  });

  it("accepts 1 to 5 scores only", () => {
    expect(parseCheckInAnswer(score, "3")).toEqual({ kind: "score", score: 3 });
    expect(parseCheckInAnswer(score, 5)).toEqual({ kind: "score", score: 5 });
    for (const raw of ["0", "6", "2.5", "high"]) expect(parseCheckInAnswer(score, raw)).toHaveProperty("error");
  });

  it("reads yes and no without defaulting", () => {
    expect(parseCheckInAnswer(yesNo, "yes")).toEqual({ kind: "yes_no", yesNo: true });
    expect(parseCheckInAnswer(yesNo, false)).toEqual({ kind: "yes_no", yesNo: false });
    expect(parseCheckInAnswer(yesNo, "maybe")).toHaveProperty("error");
  });

  it("keeps zero as a real number and limits decimals", () => {
    expect(parseCheckInAnswer(number, "0")).toEqual({ kind: "number", number: 0 });
    expect(parseCheckInAnswer(number, "2.25")).toEqual({ kind: "number", number: 2.25 });
    for (const raw of ["-1", "2.255", "1e3", "lots", "1000000"])
      expect(parseCheckInAnswer(number, raw)).toHaveProperty("error");
  });

  it("dedupes tags and enforces note and tag limits", () => {
    expect(parseCheckInAnswer(notes, { tags: [" heat", "heat", ""], note: "ok" })).toEqual({
      kind: "notes", tags: ["heat"], note: "ok",
    });
    expect(parseCheckInAnswer(notes, "just text")).toEqual({ kind: "notes", tags: [], note: "just text" });
    expect(parseCheckInAnswer(notes, { note: "x".repeat(241) })).toHaveProperty("error");
    expect(parseCheckInAnswer(notes, { tags: ["x".repeat(31)] })).toHaveProperty("error");
    expect(parseCheckInAnswer(notes, { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) })).toHaveProperty("error");
  });
});

describe("fieldDraftError", () => {
  it("requires a name and five score descriptions", () => {
    expect(fieldDraftError({ label: "Dizziness", kind: "score" })).toBeNull();
    expect(fieldDraftError({ label: " ", kind: "score" })).toMatch(/name/);
    expect(fieldDraftError({ label: "Pain", kind: "score", scoreLabels: ["a", "b"] })).toMatch(/1 to 5/);
  });

  it("keeps units and descriptions on the right field types", () => {
    expect(fieldDraftError({ label: "Fluids", kind: "number", unit: "L" })).toBeNull();
    expect(fieldDraftError({ label: "Flare", kind: "yes_no", unit: "L" })).toMatch(/unit/);
    expect(fieldDraftError({ label: "Flare", kind: "yes_no", scoreLabels: ["a", "b", "c", "d", "e"] })).toMatch(/score/);
  });
});
