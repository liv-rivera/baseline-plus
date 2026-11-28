"use client";
import { useState } from "react";
import type { CheckInPrompt as Prompt } from "@/lib/checkInPrompts";
import { formatMetricValue, METRIC_NAMES } from "@/lib/checkInPrompts";
import styles from "./checkIn.module.css";

/**
 * One question above the field it relates to. It never fills anything in: the person
 * answers the field below or dismisses the question.
 */
export function CheckInPrompt({ prompt, onDismiss }: { prompt: Prompt; onDismiss: () => void }) {
  const [why, setWhy] = useState(false);
  const name = METRIC_NAMES[prompt.metric];
  const show = (value: number) => formatMetricValue(prompt.metric, value);
  return (
    <div className={styles.prompt} role="note" aria-label={`Question about ${name}`}>
      <p>{prompt.text}</p>
      <div className={styles.promptActions}>
        <button type="button" className={styles.link} aria-expanded={why} onClick={() => setWhy(!why)}>
          Why?
        </button>
        <button type="button" className={styles.dismiss} aria-label={`Dismiss the ${name} question`} onClick={onDismiss}>
          ×
        </button>
      </div>
      {why && (
        <div className={styles.why}>
          <p>
            Your {name} for this day was {show(prompt.value)}. Your usual range is {show(prompt.low)} to{" "}
            {show(prompt.high)}, the middle 80% of your readings on {prompt.daysUsed} of the previous 28 days.
            This is a comparison with your own history, not a judgement.
          </p>
          <Sparkline prompt={prompt} />
        </div>
      )}
    </div>
  );
}

function Sparkline({ prompt }: { prompt: Prompt }) {
  const width = 240;
  const height = 48;
  const values = prompt.history.map((d) => d.value);
  const min = Math.min(...values, prompt.low);
  const max = Math.max(...values, prompt.high);
  const span = max - min || 1;
  const y = (v: number) => height - 4 - ((v - min) / span) * (height - 8);
  const x = (i: number) => (prompt.history.length < 2 ? width / 2 : (i / (prompt.history.length - 1)) * width);
  const points = prompt.history.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const last = prompt.history.length - 1;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${METRIC_NAMES[prompt.metric]} over ${prompt.history.length} days, with the usual range shaded`}
    >
      <rect x={0} y={y(prompt.high)} width={width} height={Math.max(y(prompt.low) - y(prompt.high), 1)} fill="var(--surface)" />
      <polyline points={points} fill="none" stroke="var(--muted)" strokeWidth={1.5} />
      {last >= 0 && <circle cx={x(last)} cy={y(prompt.history[last].value)} r={3.5} fill="var(--ink)" />}
    </svg>
  );
}
