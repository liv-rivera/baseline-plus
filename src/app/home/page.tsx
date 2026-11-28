"use client";

import Link from "next/link";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { useDailyMetrics } from "@/lib/useDailyMetrics";
import styles from "./page.module.css";

export default function Home() {
  const { metrics: dailyMetrics, averages, loading, error } = useDailyMetrics();
  const latest = dailyMetrics[dailyMetrics.length - 1];

  if (loading || error || !latest) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Dashboard</h1>
        <section className={styles.dataState} role={error ? "alert" : "status"}>
          <h2>{error ? "Could not load dashboard" : loading ? "Loading dashboard" : "No metric records yet"}</h2>
          <p>
            {error
              ? "Try loading your records again."
              : loading
                ? "Loading your records."
                : "Open the daily journal or import a file to add your first record."}
          </p>
          {!loading && !error && (
            <div className={styles.actions}>
              <Link className="button" href="/home/journal">Open the journal</Link>
              <Link className="button-secondary" href="/home/import">Import data</Link>
              <Link className="text-link" href="/demo">Explore a sample dashboard</Link>
            </div>
          )}
          {error && <button className="button" onClick={() => location.reload()}>Try again</button>}
        </section>
      </div>
    );
  }

  return <Dashboard metrics={dailyMetrics} averages={averages} />;
}
