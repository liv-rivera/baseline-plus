"use client";
import { useActionState } from "react";
import { CHECK_IN_PRESETS } from "@/lib/checkInPresets";
import { type CheckInField, type CheckInTime, FACES, type FluidUnit } from "@/lib/checkInValues";
import { type ManageState, manageCheckIn } from "./checkInSettingsActions";
import styles from "./checkInSettings.module.css";

const initial: ManageState = { ok: false, message: "" };
const KIND_NAMES = { score: "Score 1 to 5", faces: "Faces 😞 to 😃", yes_no: "Yes / no", number: "Number", notes: "Notes" } as const;

export function CheckInSettings({
  owner,
  time,
  fluidUnit,
  fields,
}: {
  owner: string;
  time: CheckInTime;
  fluidUnit: FluidUnit;
  fields: CheckInField[];
}) {
  const [state, act, pending] = useActionState(manageCheckIn, initial);
  const active = fields.filter((field) => !field.retired);
  const retired = fields.filter((field) => field.retired);
  const hidden = (op: string, field?: string) => (
    <>
      <input type="hidden" name="owner" value={owner} />
      <input type="hidden" name="op" value={op} />
      {field && <input type="hidden" name="field" value={field} />}
    </>
  );
  return (
    <section id="check-in-fields" className={styles.section}>
      <h2>Daily check-in</h2>
      <form action={act} className={styles.time}>
        {hidden("time")}
        <fieldset>
          <legend>When do you usually check in?</legend>
          {(["evening", "morning"] as const).map((option) => (
            <label key={option}>
              <input type="radio" name="time" value={option} defaultChecked={time === option} />
              {option === "evening" ? "Evening, about the day I just had" : "Morning, about last night and today"}
            </label>
          ))}
        </fieldset>
        <button disabled={pending}>Save</button>
      </form>

      <form action={act} className={styles.time}>
        {hidden("fluid-unit")}
        <fieldset>
          <legend>Measure fluids in</legend>
          {(["L", "oz"] as const).map((option) => (
            <label key={option}>
              <input type="radio" name="fluidUnit" value={option} defaultChecked={fluidUnit === option} />
              {option === "L" ? "Litres (L)" : "US fluid ounces (oz)"}
            </label>
          ))}
        </fieldset>
        <p className={styles.note}>Amounts you&apos;ve already saved are converted, so your history stays the same.</p>
        <button disabled={pending}>Save</button>
      </form>

      <h3>Fields on your check-in</h3>
      <ol className={styles.fields}>
        {active.map((field, index) => (
          <li key={field.id}>
            <form action={act} className={styles.rename}>
              {hidden("rename", field.id)}
              <input name="label" aria-label={`Name for ${field.label}`} defaultValue={field.label} maxLength={40} required />
              <span className={styles.kind}>
                {KIND_NAMES[field.kind]}
                {field.unit ? ` (${field.unit})` : ""}
              </span>
              <button className={styles.quiet} disabled={pending}>Rename</button>
            </form>
            {field.kind === "faces" && field.scoreLabels && (
              <details className={styles.labels}>
                <summary>Edit descriptions</summary>
                <form action={act}>
                  {hidden("labels", field.id)}
                  {field.scoreLabels.map((label, i) => (
                    <label key={i}>
                      <span aria-hidden="true">{FACES[i]}</span>
                      <input
                        name="scoreLabel"
                        aria-label={`Description for ${FACES[i]}`}
                        defaultValue={label}
                        maxLength={80}
                        required
                      />
                    </label>
                  ))}
                  <button className={styles.quiet} disabled={pending}>Save descriptions</button>
                </form>
              </details>
            )}
            <div className={styles.row}>
              <form action={act}>
                {hidden("up", field.id)}
                <button className={styles.quiet} disabled={pending || index === 0} aria-label={`Move ${field.label} up`}>↑</button>
              </form>
              <form action={act}>
                {hidden("down", field.id)}
                <button className={styles.quiet} disabled={pending || index === active.length - 1} aria-label={`Move ${field.label} down`}>↓</button>
              </form>
              <form action={act}>
                {hidden("retire", field.id)}
                <button className={styles.quiet} disabled={pending}>Hide</button>
              </form>
            </div>
          </li>
        ))}
      </ol>

      <form action={act} className={styles.add}>
        {hidden("add")}
        <label>
          New field
          <input name="label" placeholder="For example Dizziness" maxLength={40} required />
        </label>
        <label>
          Type
          <select name="kind" defaultValue="score">
            <option value="score">Score 1 to 5</option>
            <option value="faces">Faces 😞 😐 🙂 😃</option>
            <option value="yes_no">Yes / no</option>
            <option value="number">Number</option>
          </select>
        </label>
        <label>
          Unit (numbers only)
          <input name="unit" placeholder="L, oz, mg" maxLength={12} />
        </label>
        <button disabled={pending}>Add field</button>
      </form>

      {CHECK_IN_PRESETS.filter((preset) =>
        preset.fields.some((f) => !active.some((a) => a.label.toLowerCase() === f.label.toLowerCase())),
      ).map((preset) => (
        <form key={preset.id} action={act} className={styles.preset}>
          {hidden("preset")}
          <input type="hidden" name="preset" value={preset.id} />
          <div>
            <strong>{preset.name}</strong>
            <p>{preset.description}</p>
          </div>
          <button className={styles.quiet} disabled={pending}>Add {preset.name}</button>
        </form>
      ))}

      {retired.length > 0 && (
        <details>
          <summary>Hidden fields ({retired.length})</summary>
          <p>Hidden fields keep their history. Bring one back, or delete it with all of its answers.</p>
          <ul className={styles.fields}>
            {retired.map((field) => (
              <li key={field.id}>
                <strong>{field.label}</strong> <span className={styles.kind}>{KIND_NAMES[field.kind]}</span>
                <div className={styles.row}>
                  <form action={act}>
                    {hidden("restore", field.id)}
                    <button className={styles.quiet} disabled={pending}>Show again</button>
                  </form>
                  {!field.systemKey && (
                    <form action={act} className={styles.delete}>
                      {hidden("delete", field.id)}
                      <label>
                        <input type="checkbox" name="confirm" value="yes" /> Delete with its answers
                      </label>
                      <button disabled={pending}>Delete</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p role="status" className={state.ok ? styles.ok : styles.problem}>
        {state.message}
      </p>
    </section>
  );
}
