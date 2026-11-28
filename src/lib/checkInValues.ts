// Pure types and validation for configurable check-in fields (T257). No database access here,
// so the rules can be unit tested and reused by the form (T258).

export const CHECK_IN_FIELD_KINDS = ["score", "yes_no", "number", "notes"] as const;
export type CheckInFieldKind = (typeof CHECK_IN_FIELD_KINDS)[number];

export const PROMPT_METRICS = ["hrv", "resting_heart_rate", "sleep_duration"] as const;
export type PromptMetric = (typeof PROMPT_METRICS)[number];

export type CheckInTime = "morning" | "evening";

export interface CheckInField {
  id: string;
  label: string;
  kind: CheckInFieldKind;
  /** Five descriptions for scores 1 to 5. Score fields only. */
  scoreLabels: string[] | null;
  unit: string | null;
  position: number;
  systemKey: "energy" | "soreness" | "notes" | null;
  preset: string | null;
  promptMetrics: PromptMetric[];
  retired: boolean;
}

export type CheckInAnswer =
  | { kind: "score"; score: number }
  | { kind: "yes_no"; yesNo: boolean }
  | { kind: "number"; number: number }
  | { kind: "notes"; tags: string[]; note: string };

/** Default descriptions for a new score field that measures a symptom (1 = none, 5 = severe). */
export const SYMPTOM_SCORE_LABELS = [
  "None",
  "Mild, easy to ignore",
  "Noticeable, but I can do what I planned",
  "Strong, I changed my plans for it",
  "Severe, it stopped me",
];

export const LIMITS = {
  label: 40,
  scoreLabel: 80,
  unit: 12,
  tags: 20,
  tag: 30,
  note: 240,
  number: 999_999.99,
} as const;

/**
 * Parse one submitted value for a field. Returns null when the field was left empty,
 * an answer when it is valid, or an error message.
 * Empty always means "not recorded": never the lowest score, "no" or zero.
 */
export function parseCheckInAnswer(
  field: Pick<CheckInField, "kind" | "label">,
  raw: unknown,
): CheckInAnswer | null | { error: string } {
  const text = typeof raw === "string" ? raw.trim() : raw;
  switch (field.kind) {
    case "score": {
      if (text === "" || text === null || text === undefined) return null;
      const score = Number(text);
      if (!Number.isInteger(score) || score < 1 || score > 5)
        return { error: `${field.label}: choose 1 to 5.` };
      return { kind: "score", score };
    }
    case "yes_no": {
      if (text === "" || text === null || text === undefined) return null;
      if (text === true || text === "yes" || text === "true") return { kind: "yes_no", yesNo: true };
      if (text === false || text === "no" || text === "false") return { kind: "yes_no", yesNo: false };
      return { error: `${field.label}: choose yes or no.` };
    }
    case "number": {
      if (text === "" || text === null || text === undefined) return null;
      if (typeof text !== "number" && !/^\d+(\.\d{1,2})?$/.test(String(text)))
        return { error: `${field.label}: enter a number with up to two decimals.` };
      const value = Number(text);
      if (!Number.isFinite(value) || value < 0 || value > LIMITS.number)
        return { error: `${field.label}: enter a number from 0 to ${LIMITS.number}.` };
      return { kind: "number", number: value };
    }
    case "notes": {
      if (text === "" || text === null || text === undefined) return null;
      const input = (typeof text === "string" ? { note: text } : text) as { tags?: unknown; note?: unknown };
      if (typeof input !== "object" || Array.isArray(input)) return { error: `${field.label}: invalid notes.` };
      const rawTags = Array.isArray(input.tags) ? input.tags : [];
      const tags = [...new Set(rawTags.map((tag) => String(tag).trim()).filter(Boolean))];
      const note = typeof input.note === "string" ? input.note.trim() : "";
      if (tags.length > LIMITS.tags) return { error: `${field.label}: use up to ${LIMITS.tags} tags.` };
      if (tags.some((tag) => tag.length > LIMITS.tag))
        return { error: `${field.label}: keep each tag under ${LIMITS.tag + 1} characters.` };
      if (note.length > LIMITS.note)
        return { error: `${field.label}: keep the note under ${LIMITS.note + 1} characters.` };
      if (!tags.length && !note) return null;
      return { kind: "notes", tags, note };
    }
  }
}

export interface FieldDraft {
  label: string;
  kind: CheckInFieldKind;
  scoreLabels?: string[] | null;
  unit?: string | null;
  promptMetrics?: PromptMetric[];
}

/** Validate a new or edited field definition. Returns an error message or null. */
export function fieldDraftError(draft: FieldDraft): string | null {
  const label = draft.label.trim();
  if (!label || label.length > LIMITS.label) return `Use a name of 1 to ${LIMITS.label} characters.`;
  if (!CHECK_IN_FIELD_KINDS.includes(draft.kind)) return "Choose a field type.";
  if (draft.kind === "score") {
    const labels = draft.scoreLabels ?? SYMPTOM_SCORE_LABELS;
    if (labels.length !== 5 || labels.some((l) => !l.trim() || l.length > LIMITS.scoreLabel))
      return `Describe each score from 1 to 5 in up to ${LIMITS.scoreLabel} characters.`;
  } else if (draft.scoreLabels) return "Only score fields have score descriptions.";
  if (draft.unit && (draft.kind !== "number" || draft.unit.trim().length > LIMITS.unit))
    return `Only number fields have a unit, up to ${LIMITS.unit} characters.`;
  if (draft.promptMetrics?.some((m) => !PROMPT_METRICS.includes(m))) return "Unknown metric.";
  return null;
}
