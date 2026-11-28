"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { ReadinessGauge } from "@/components/readinessGauge";
import { calculateChange, calculateTrend } from "@/lib/metricCalculations";
import {
  formatMinutes,
  formatNumber,
  formatSigned,
  percentChange,
  priorMedian,
  recentSessions,
  sportLabels,
  symptomText,
  trainingDays,
  type MetricKey,
} from "@/lib/dashboardStats";
import type { Averages, DailyMetrics } from "@/types/metrics";
import { TrainingChart } from "./TrainingChart";
import styles from "./Dashboard.module.css";

type DashboardProps = {
  metrics: DailyMetrics[];
  averages: Averages;
  /** Read-only sample: no links into account pages. */
  demo?: boolean;
};

const ranges = [
  { days: 14, label: "2 weeks" },
  { days: 42, label: "6 weeks" },
  { days: 90, label: "3 months" },
] as const;

const kpis: Array<{ key: MetricKey; label: string; href?: string; format: (v: number | null) => string; unit?: string }> = [
  { key: "steps", label: "Steps", href: "/home/steps", format: formatNumber },
  { key: "moveCalories", label: "Move", href: "/home/move-calories", format: formatNumber, unit: "kcal" },
  { key: "restMinutes", label: "Rest", href: "/home/rest", format: formatMinutes },
  { key: "breatheMinutes", label: "Breathwork", href: "/home/breathwork", format: formatNumber, unit: "min" },
];

const comparisonRows: Array<{ key: Exclude<MetricKey, "readinessScore">; label: string }> = [
  { key: "steps", label: "Steps" },
  { key: "moveCalories", label: "Move calories" },
  { key: "restMinutes", label: "Rest (min)" },
  { key: "breatheMinutes", label: "Breathwork (min)" },
];

const longDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function readinessDescription(latest: DailyMetrics) {
  if (latest.readinessScore === null) return "No score recorded for this date.";
  if (latest.source === "import") return "Score supplied in your import";
  if (latest.source === "demo") return "Example score";
  return "Recorded score";
}

type Band = { tone: "bandGood" | "bandSteady" | "bandLow" | "bandNone"; headline: string; detail: string };

/** Turns the readiness score into one line someone can take in at a glance. */
function readinessBand(rows: DailyMetrics[], latest: DailyMetrics): Band {
  const score = latest.readinessScore;
  if (score === null) {
    return { tone: "bandNone", headline: "No readiness score today", detail: "Your other numbers for the day are below." };
  }
  const baseline = priorMedian(rows, latest, "readinessScore");
  const diff = baseline === null ? null : Math.round(score - baseline);
  const versus =
    diff === null
      ? "Not enough recent days to compare with your usual yet."
      : diff === 0
        ? "Right at your 28-day median."
        : `${Math.abs(diff)} ${Math.abs(diff) === 1 ? "point" : "points"} ${diff > 0 ? "above" : "below"} your 28-day median.`;
  if (score >= 70) return { tone: "bandGood", headline: "Ready to train", detail: versus };
  if (score >= 50) return { tone: "bandSteady", headline: "Take it steady", detail: versus };
  return { tone: "bandLow", headline: "Recovery day", detail: versus };
}

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return <p className={styles.deltaMuted}>Not enough days for a baseline</p>;
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  return (
    <p className={pct >= 0 ? styles.deltaUp : styles.deltaDown}>
      <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
      {Math.abs(pct)}% vs 28-day median
    </p>
  );
}

function Scale({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className={styles.scaleRow}>
      <span>{label}</span>
      <span className={styles.scaleCells} role="img" aria-label={value ? `${label} ${value} of 5` : `${label} skipped`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <i key={n} className={value && n <= value ? styles.scaleOn : undefined} />
        ))}
      </span>
      <span className={styles.scaleValue}>{value ?? "–"}</span>
    </div>
  );
}

/** The whole signed-in dashboard. /demo renders this same component with sample records. */
export function Dashboard({ metrics, averages, demo = false }: DashboardProps) {
  const [range, setRange] = useState<number>(42);
  const latest = metrics[metrics.length - 1];
  const trends = calculateTrend(metrics);
  const changes = calculateChange(averages, latest);
  const days = trainingDays(metrics, latest, range);
  const sessions = recentSessions(metrics);
  const journalHref = `/home/journal?date=${latest.date}`;
  const band = readinessBand(metrics, latest);

  return (
    <div className={styles.dashboard}>
      <section className={`${styles.hero} ${styles[band.tone]}`} aria-labelledby="readiness-title">
        <div className={styles.heroScore}>
          {latest.readinessScore !== null ? (
            <div className={styles.gauge}><ReadinessGauge score={latest.readinessScore} /></div>
          ) : (
            <p className={styles.heroEmpty} aria-hidden="true">—</p>
          )}
        </div>
        <div className={styles.heroText}>
          <p className={styles.heroDate}>
            Readiness · <time dateTime={latest.date}>{longDate(latest.date)}</time>
          </p>
          <h1 id="readiness-title">{band.headline}</h1>
          <p className={styles.heroDetail}>{band.detail}</p>
          <p className={styles.heroSource}>{readinessDescription(latest)}</p>
        </div>
        <div className={styles.heroSide}>
          {latest.checkIn && (
            <div className={styles.scales}>
              <Scale label="Energy" value={latest.checkIn.energy} />
              <Scale label="Soreness" value={latest.checkIn.soreness} />
              {latest.checkIn.symptoms
                ?.filter((s) => s.kind === "score")
                .map((s) => <Scale key={s.label} label={s.label} value={s.value as number} />)}
            </div>
          )}
          {latest.checkIn?.symptoms?.some((s) => s.kind !== "score") && (
            <p className={styles.heroSource}>
              {latest.checkIn.symptoms.filter((s) => s.kind !== "score").map(symptomText).join(" · ")}
            </p>
          )}
          {!latest.checkIn && <p className={styles.heroSource}>No check-in for {shortDate(latest.date)}.</p>}
          {!demo && (
            <div className={styles.headerActions}>
              <Link className="button" href={journalHref}>{latest.checkIn ? "Edit check-in" : "Add a check-in"}</Link>
              <Link className="button-secondary" href="/home/import">Import data</Link>
            </div>
          )}
        </div>
      </section>

      <section className={styles.kpis} aria-label="Latest values">
        {kpis.map(({ key, label, href, format, unit }) => {
          const value = typeof latest[key] === "number" ? (latest[key] as number) : null;
          const pct = percentChange(value, priorMedian(metrics, latest, key));
          const body = (
            <>
              <p className={styles.kpiLabel}>{label}</p>
              <p className={styles.kpiValue}>
                {format(value)}
                {unit && value !== null && <small> {unit}</small>}
              </p>
              <Delta pct={pct} />
            </>
          );
          return href && !demo ? (
            <Link key={key} href={href} className={`${styles.kpi} ${styles.kpiLink}`} aria-label={`${label}: ${format(value)}. View details`}>
              {body}
            </Link>
          ) : (
            <div key={key} className={styles.kpi}>{body}</div>
          );
        })}
      </section>

      <div className={styles.mainRow}>
        <section className={`${styles.panel} ${styles.chartPanel}`} aria-labelledby="training-title">
          <div className={styles.panelHeading}>
            <div>
              <h2 id="training-title">Training</h2>
            </div>
            <div className={styles.segmented} role="group" aria-label="Chart range">
              {ranges.map((option) => (
                <button
                  key={option.days}
                  type="button"
                  aria-pressed={range === option.days}
                  className={range === option.days ? styles.segmentOn : styles.segment}
                  onClick={() => setRange(option.days)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <TrainingChart days={days} />
        </section>

        <section className={styles.panel} aria-labelledby="sessions-title">
          <h2 id="sessions-title">Recent</h2>
          {sessions.length === 0 ? (
            <p className={styles.subtle}>No sport sessions recorded yet.</p>
          ) : (
            <ul className={styles.sessions}>
              {sessions.map((session, i) => (
                <li key={`${session.date}-${i}`}>
                  <i style={{ background: `var(--sport-${session.sport})` }} aria-hidden="true" />
                  <span>
                    {session.name}
                    <span className={styles.visuallyHidden}> ({sportLabels[session.sport]})</span>
                    {session.checkIn && <span className={styles.sessionCheckIn}>{session.checkIn}</span>}
                  </span>
                  <span className={styles.sessionMeta}>{session.minutes} min · {shortDate(session.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div>
        <section className={styles.panel} aria-labelledby="compare-title">
          <h2 id="compare-title">Comparisons</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Metric</th>
                  <th scope="col">Latest</th>
                  <th scope="col">Vs previous</th>
                  <th scope="col">Vs average</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(({ key, label }) => {
                  const value = typeof latest[key] === "number" ? (latest[key] as number) : null;
                  return (
                    <tr key={key}>
                      <th scope="row">{label}</th>
                      <td>{formatNumber(value)}</td>
                      <td className={(trends[key] ?? 0) >= 0 ? styles.up : styles.down}>{formatSigned(trends[key])}</td>
                      <td className={(changes[key] ?? 0) >= 0 ? styles.up : styles.down}>{formatSigned(changes[key])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
