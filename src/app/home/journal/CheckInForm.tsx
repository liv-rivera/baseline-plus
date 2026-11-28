"use client";
import { useActionState, useState } from "react";
import type { CheckInAnswer, CheckInField } from "@/lib/checkInValues";
import { type CheckInFormState, submitCheckIn } from "./checkInActions";
import styles from "./checkIn.module.css";

const initial: CheckInFormState = { ok: false, message: "" };

/**
 * The daily check-in: one screen, every field optional. Empty means "not recorded".
 * Field names: field_<id> for scores, yes/no and numbers; tag_<id> and note_<id> for Notes.
 */
export function CheckInForm({
  date,
  owner,
  fields,
  answers,
  revision,
  recentTags,
}: {
  date: string;
  owner: string;
  fields: CheckInField[];
  answers: Record<string, CheckInAnswer>;
  revision?: string;
  recentTags: string[];
}) {
  const [state, submit, pending] = useActionState(submitCheckIn, initial);
  const currentRevision = state.cleared ? "" : (state.revision ?? revision ?? "");
  return (
    <form action={submit} className={styles.form} aria-label="Daily check-in">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="owner" value={owner} />
      <input type="hidden" name="revision" value={currentRevision} />
      {fields.map((field) => {
        const answer = state.cleared ? undefined : answers[field.id];
        switch (field.kind) {
          case "score":
            return <ScoreField key={field.id + (state.cleared ? "-cleared" : "")} field={field} initial={answer?.kind === "score" ? answer.score : null} />;
          case "yes_no":
            return <YesNoField key={field.id + (state.cleared ? "-cleared" : "")} field={field} initial={answer?.kind === "yes_no" ? answer.yesNo : null} />;
          case "number":
            return (
              <label key={field.id + (state.cleared ? "-cleared" : "")} className={styles.number}>
                <span className={styles.label}>{field.label}</span>
                <span className={styles.numberInput}>
                  <input
                    name={`field_${field.id}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    defaultValue={answer?.kind === "number" ? answer.number : ""}
                  />
                  {field.unit && <span>{field.unit}</span>}
                </span>
              </label>
            );
          case "notes":
            return (
              <NotesField
                key={field.id + (state.cleared ? "-cleared" : "")}
                field={field}
                initial={answer?.kind === "notes" ? answer : { tags: [], note: "" }}
                recentTags={recentTags}
              />
            );
        }
      })}
      <div className={styles.actions}>
        <button name="intent" value="save" disabled={pending}>
          {pending ? "Saving…" : currentRevision ? "Save changes" : "Save check-in"}
        </button>
        <span role="status" className={state.ok ? styles.ok : styles.problem}>
          {state.message}
        </span>
      </div>
      {currentRevision && (
        <details className={styles.clear}>
          <summary>Clear this day</summary>
          <label className={styles.confirm}>
            <input type="checkbox" name="confirm" value="yes" /> Remove every answer for {date}
          </label>
          <button name="intent" value="clear" disabled={pending}>
            Clear day
          </button>
        </details>
      )}
    </form>
  );
}

function ScoreField({ field, initial }: { field: CheckInField; initial: number | null }) {
  const [value, setValue] = useState<number | null>(initial);
  const labels = field.scoreLabels ?? [];
  return (
    <fieldset className={styles.field}>
      <legend className={styles.label}>{field.label}</legend>
      <input type="hidden" name={`field_${field.id}`} value={value ?? ""} />
      <div className={styles.scale} role="radiogroup" aria-label={field.label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n}: ${labels[n - 1] ?? ""}`}
            className={value === n ? styles.selected : undefined}
            onClick={() => setValue(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
      <p className={styles.hint}>
        {value ? labels[value - 1] : `1 ${labels[0]?.toLowerCase() ?? ""} · 5 ${labels[4]?.toLowerCase() ?? ""}`}
      </p>
    </fieldset>
  );
}

function YesNoField({ field, initial }: { field: CheckInField; initial: boolean | null }) {
  const [value, setValue] = useState<boolean | null>(initial);
  return (
    <fieldset className={styles.field}>
      <legend className={styles.label}>{field.label}</legend>
      <input type="hidden" name={`field_${field.id}`} value={value === null ? "" : value ? "yes" : "no"} />
      <div className={styles.yesNo} role="radiogroup" aria-label={field.label}>
        {([true, false] as const).map((option) => (
          <button
            key={String(option)}
            type="button"
            role="radio"
            aria-checked={value === option}
            className={value === option ? styles.selected : undefined}
            onClick={() => setValue(value === option ? null : option)}
          >
            {option ? "Yes" : "No"}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function NotesField({
  field,
  initial,
  recentTags,
}: {
  field: CheckInField;
  initial: { tags: string[]; note: string };
  recentTags: string[];
}) {
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [draft, setDraft] = useState("");
  const offered = [...new Set([...tags, ...recentTags])];
  function add() {
    const tag = draft.trim().slice(0, 30);
    if (tag && !tags.includes(tag) && tags.length < 20) setTags([...tags, tag]);
    setDraft("");
  }
  return (
    <fieldset className={styles.field}>
      <legend className={styles.label}>{field.label}</legend>
      {tags.map((tag) => (
        <input key={tag} type="hidden" name={`tag_${field.id}`} value={tag} />
      ))}
      {offered.length > 0 && (
        <div className={styles.tags}>
          {offered.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-pressed={tags.includes(tag)}
              className={tags.includes(tag) ? styles.selected : undefined}
              onClick={() => setTags(tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag])}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
      <div className={styles.addTag}>
        <input
          aria-label="New tag"
          placeholder="Add a tag, like heat or travel"
          value={draft}
          maxLength={30}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className={styles.secondary} onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
      <textarea
        aria-label={`${field.label} text`}
        name={`note_${field.id}`}
        maxLength={240}
        placeholder="Anything else about today (optional)"
        defaultValue={initial.note}
      />
    </fieldset>
  );
}
