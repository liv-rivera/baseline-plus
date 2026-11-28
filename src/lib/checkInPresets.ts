import type { CheckInFieldKind, PromptMetric } from "./checkInValues";

// Starter sets of check-in fields (T259). Each preset is plain data, so another condition
// can be added here without touching the database code. A preset only adds fields the
// owner doesn't already have; it never changes or removes existing ones.

export interface PresetField {
  label: string;
  kind: Exclude<CheckInFieldKind, "notes">;
  unit?: string;
  scoreLabels?: string[];
  promptMetrics?: PromptMetric[];
}

export interface CheckInPreset {
  id: string;
  name: string;
  description: string;
  fields: PresetField[];
}

export const CHECK_IN_PRESETS: CheckInPreset[] = [
  {
    id: "pots",
    name: "POTS starter set",
    description:
      "Adds dizziness, brain fog, flare, fluids, salt, compression and meds to Energy, Soreness and Notes. It's a starting point, not a clinical list, so change anything you like afterwards.",
    fields: [
      { label: "Dizziness", kind: "score", promptMetrics: ["resting_heart_rate"] },
      { label: "Brain fog", kind: "score", promptMetrics: ["sleep_duration"] },
      { label: "Flare today", kind: "yes_no" },
      { label: "Fluids", kind: "number", unit: "L" },
      { label: "Salt", kind: "number", unit: "g" },
      { label: "Compression worn", kind: "yes_no" },
      { label: "Meds taken", kind: "yes_no" },
    ],
  },
];

export function findPreset(id: string): CheckInPreset | undefined {
  return CHECK_IN_PRESETS.find((preset) => preset.id === id);
}
