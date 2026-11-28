"use client";

import { useEffect, useRef, useState } from "react";
import { sportLabels, type Sport, type TrainingDay } from "@/lib/dashboardStats";
import styles from "./Dashboard.module.css";

const sports = Object.keys(sportLabels) as Sport[];
const MIN_HEIGHT = 240;
const MARGIN = { top: 12, right: 34, bottom: 26, left: 34 };

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 640, height: MIN_HEIGHT });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: Math.round(entry.contentRect.width), height: Math.max(MIN_HEIGHT, Math.round(entry.contentRect.height)) }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Stacked minutes by sport for each day, the readiness line on top, low-energy days shaded. */
export function TrainingChart({ days }: { days: TrainingDay[] }) {
  const [ref, { width, height: HEIGHT }] = useSize<HTMLDivElement>();
  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const slot = innerWidth / Math.max(days.length, 1);
  const dailyMinutes = days.map((day) => day.sessions.reduce((sum, s) => sum + s.minutes, 0));
  const maxMinutes = Math.max(60, Math.ceil(Math.max(...dailyMinutes, 0) / 30) * 30);
  const y = (minutes: number) => MARGIN.top + innerHeight - (minutes / maxMinutes) * innerHeight;
  const yReady = (score: number) => MARGIN.top + innerHeight - (score / 100) * innerHeight;
  const ticks = Array.from({ length: maxMinutes / 30 + 1 }, (_, i) => i * 30).filter((t, _, all) => all.length <= 5 || t % 60 === 0);
  const labelEvery = width < 520 ? 14 : 7;
  const readinessPoints = days
    .map((day, i) => (day.readiness === null ? null : `${MARGIN.left + i * slot + slot / 2},${yReady(day.readiness)}`))
    .filter(Boolean);
  const used = sports.filter((sport) => days.some((day) => day.sessions.some((s) => s.sport === sport)));
  const totalMinutes = dailyMinutes.reduce((sum, m) => sum + m, 0);
  const summary = `${totalMinutes.toLocaleString("en-US")} training minutes over ${days.length} days`;

  return (
    <>
      <div ref={ref} className={styles.chart}>
        <svg width="100%" height={HEIGHT} className={styles.chartSvg} role="img" aria-label={`Training minutes by sport and readiness. ${summary}.`}>
          {days.map((day, i) =>
            day.lowEnergy ? (
              <rect key={`low-${day.date}`} x={MARGIN.left + i * slot} y={MARGIN.top} width={slot + 0.5} height={innerHeight} fill="var(--warn-soft)">
                <title>{`${shortDate(day.date)}: ${day.checkIn}`}</title>
              </rect>
            ) : null,
          )}
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} stroke="var(--line)" />
              <text x={MARGIN.left - 8} y={y(tick) + 4} textAnchor="end" className={styles.axis}>{tick}</text>
            </g>
          ))}
          {[0, 50, 100].map((score) => (
            <text key={score} x={width - MARGIN.right + 8} y={yReady(score) + 4} className={styles.axis}>{score}</text>
          ))}
          {days.map((day, i) => {
            let top = MARGIN.top + innerHeight;
            return day.sessions.map((session, n) => {
              const h = (Math.min(session.minutes, maxMinutes) / maxMinutes) * innerHeight;
              top -= h;
              return (
                <rect
                  key={`${day.date}-${n}`}
                  x={MARGIN.left + i * slot + slot * 0.18}
                  y={top}
                  width={Math.max(slot * 0.64, 2)}
                  height={Math.max(h - 1, 1)}
                  rx={Math.min(3, slot * 0.2)}
                  fill={`var(--sport-${session.sport})`}
                >
                  <title>{`${shortDate(day.date)}: ${session.name}, ${session.minutes} min${day.checkIn ? `. Check-in: ${day.checkIn}` : ""}`}</title>
                </rect>
              );
            });
          })}
          {readinessPoints.length > 1 && (
            <polyline points={readinessPoints.join(" ")} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />
          )}
          {days.map((day, i) =>
            i % labelEvery === 0 ? (
              <text key={`x-${day.date}`} x={MARGIN.left + i * slot} y={HEIGHT - 6} className={styles.axis}>{shortDate(day.date)}</text>
            ) : null,
          )}
        </svg>
      </div>
      <ul className={styles.legend} aria-label="Chart key">
        {used.map((sport) => (
          <li key={sport}><i style={{ background: `var(--sport-${sport})` }} />{sportLabels[sport]}</li>
        ))}
        <li><i className={styles.legendLine} />Readiness (right scale)</li>
        {days.some((day) => day.lowEnergy) && <li><i style={{ background: "var(--warn-soft)" }} />Low-energy check-in</li>}
      </ul>
      {used.length === 0 && <p className={styles.chartNote}>No sport sessions in this range. Imported daily totals don&apos;t include individual workouts.</p>}
    </>
  );
}
