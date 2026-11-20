import Link from "next/link";
import { PersonalRecap } from "@/components/PersonalRecap";
import type { DailyMetrics } from "@/types/metrics";
import styles from "../home/journal/journal.module.css";

const example: DailyMetrics[] = Array.from({ length: 28 }, (_, i) => ({
  date: `2026-02-${String(i + 1).padStart(2, "0")}`,
  source: "demo",
  steps: 3200 + ((i * 1600) % 5100),
  moveCalories: 150 + ((i * 55) % 290),
  restMinutes: 400 + ((i * 27) % 105),
  breatheMinutes: (i % 4) * 5,
  readinessScore: null,
  ...(i % 3 === 0 && { checkIn: { energy: 3, soreness: null } }),
  activities: [],
  stepActivities: [],
  restPeriods: [],
  breathworkSessions: [],
}));

export default function Demo() {
  return (
    <main className={styles.page}>
      <Link href="/">Back to sign in</Link>
      <h1>Sample dashboard</h1>
      <p>
        Explore four weeks of fictional daily totals. This sample is read-only.
      </p>
      <PersonalRecap rows={example} latest={example[example.length - 1]} demo />
    </main>
  );
}
