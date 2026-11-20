"use client";
import { useState } from "react";
import Link from "next/link";
import type { DailyMetrics } from "@/types/metrics";
import { personalRecap } from "@/lib/personalRecap";
const metrics = {
  steps: "Steps",
  moveCalories: "Move (kcal)",
  restMinutes: "Rest (minutes)",
  breatheMinutes: "Breathwork (minutes)",
};
export function PersonalRecap({
  rows,
  latest,
  demo = false,
}: {
  rows: DailyMetrics[];
  latest: DailyMetrics;
  demo?: boolean;
}) {
  const [window, setWindow] = useState<7 | 28>(7),
    [metric, setMetric] = useState<keyof typeof metrics>("steps");
  const { week, previousWeek, reference } = personalRecap(
    rows,
    latest,
    window,
    metric,
  );
  return (
    <section aria-labelledby="recap">
      <h2 id="recap">Personal comparisons</h2>
      <label>
        Metric{" "}
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as keyof typeof metrics)}
        >
          {Object.entries(metrics).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>{" "}
      <label>
        Prior window{" "}
        <select
          value={window}
          onChange={(e) => setWindow(e.target.value === "7" ? 7 : 28)}
        >
          <option value="7">7 days</option>
          <option value="28">28 days</option>
        </select>
      </label>
      <p>
        {latest.date}: {latest[metric]} · Source:{" "}
        {latest.source ?? "unspecified"}
        {latest.manuallyCorrected && " · Manually corrected"}
      </p>
      <p>
        {reference.median === null
          ? "Too few comparable days for a baseline."
          : `Prior median: ${reference.median}. Latest difference: ${latest[metric] - reference.median}.`}
      </p>
      <h3>Weekly recap</h3>
      <p>
        {week.median === null || previousWeek.median === null
          ? "Weekly change needs at least four observed days in each week."
          : `Median ${metrics[metric].toLowerCase()} changed from ${previousWeek.median} to ${week.median}.`}
      </p>
      <p>
        {week.checkInCount} of {week.observations.length} comparable days have a
        check-in this week. The previous week had {previousWeek.checkInCount} of{" "}
        {previousWeek.observations.length}.
      </p>
      {(
        [
          ["Baseline", reference],
          ["Latest week", week],
          ["Previous week", previousWeek],
        ] as const
      ).map(([label, period]) => (
        <details key={label}>
          <summary>
            {label}: {period.start} to {period.end} ·{" "}
            {period.observations.length} observed days
          </summary>
          <ul>
            {period.observations.map((o) => (
              <li key={o.date}>
                {demo ? (
                  o.date
                ) : (
                  <Link href={`/home/journal?date=${o.date}`}>{o.date}</Link>
                )}{" "}
                · {o.value}
                {o.checkedIn && " · Check-in saved"}
              </li>
            ))}
          </ul>
          {period.gaps.length > 0 && (
            <p>Missing or different entry method: {period.gaps.join(", ")}</p>
          )}
        </details>
      ))}
      <p>
        Comparisons use the same entry method. CSV files do not identify the
        device.
      </p>
    </section>
  );
}
