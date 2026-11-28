import { describe, expect, it } from "vitest";
import { CHECK_IN_PRESETS, findPreset } from "./checkInPresets";
import { fieldDraftError } from "./checkInValues";

describe("check-in presets", () => {
  it("only contains fields that pass the same rules as hand-made ones", () => {
    for (const preset of CHECK_IN_PRESETS) {
      for (const field of preset.fields) expect(fieldDraftError(field), field.label).toBeNull();
      const labels = preset.fields.map((field) => field.label.toLowerCase());
      expect(new Set(labels).size).toBe(labels.length);
      // Energy, Soreness and Notes come with every account, so a preset never repeats them.
      expect(labels.some((label) => ["energy", "soreness", "notes"].includes(label))).toBe(false);
    }
  });

  it("finds the POTS starter set by id", () => {
    expect(findPreset("pots")?.fields.map((field) => field.label)).toEqual([
      "Dizziness",
      "Brain fog",
      "Flare today",
      "Fluids",
      "Salt",
      "Compression worn",
      "Meds taken",
    ]);
    expect(findPreset("missing")).toBeUndefined();
  });

  it("measures salt with four faces, each with an approximate amount", () => {
    expect(findPreset("pots")?.fields.find((field) => field.label === "Salt")).toEqual({
      label: "Salt",
      kind: "faces",
      scoreLabels: ["About 10 mg to 1 g", "About 1 to 3 g", "About 3 to 6 g", "About 6 to 10 g"],
    });
  });
});
