"use client";

import { useEffect, useState } from "react";
import type { Averages, DailyMetrics } from "@/types/metrics";

type MetricsResponse = {
  metrics: DailyMetrics[];
  averages: Averages;
};

const emptyAverages: Averages = {
  steps: 0,
  moveCalories: 0,
  restMinutes: 0,
  breatheMinutes: 0,
};

export function useDailyMetrics() {
  const [metrics, setMetrics] = useState<DailyMetrics[]>([]);
  const [averages, setAverages] = useState<Averages>(emptyAverages);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    const loadMetrics = async () => {
      try {
        const response = await fetch("/api/metrics", { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as MetricsResponse | { error?: string };
        if (!response.ok) {
          throw new Error("error" in payload && payload.error ? payload.error : "Could not load metrics.");
        }

        const data = payload as MetricsResponse;
        setMetrics(data.metrics);
        setAverages(data.averages);
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === "AbortError") {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Could not load metrics.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadMetrics();

    return () => controller.abort();
  }, [refreshKey]);

  return {
    metrics,
    averages,
    loading,
    error,
    refresh: () => {
      setLoading(true);
      setError(null);
      setRefreshKey((key) => key + 1);
    },
  };
}