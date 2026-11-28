import { Dashboard } from "@/components/dashboard/Dashboard";
import { AppShell } from "@/components/shell/AppShell";
import { averageMetrics, generateSampleMetrics } from "@/lib/sampleData";

// Re-render daily so the six sample weeks always end today.
export const revalidate = 3600;

export default function Demo() {
  const today = new Date().toISOString().slice(0, 10);
  const metrics = generateSampleMetrics(today);
  return (
    <AppShell demo>
      <Dashboard metrics={metrics} averages={averageMetrics(metrics)} demo />
    </AppShell>
  );
}
