export type Activity = {
  id: string;
  name: string;
  durationMinutes: number;
  calories: number;
};

export type StepActivity = {
  id: string;
  name: string;
  durationMinutes: number;
  steps: number;
};

export type RestPeriod = {
  id: string;
  name: string;
  durationMinutes: number;
};

export type BreathworkSession = {
  id: string;
  name: string;
  durationMinutes: number;
};

export type MetricDetailEntry = {
  id: string;
  name: string;
  detail: string;
  value: number;
};

export type MetricDetailRecord = {
  date: string;
  total: number | null;
  entries: MetricDetailEntry[];
};

export type MetricSource = "demo" | "import" | "manual" | "apple_health";

export type DailyMetrics = {
  date: string;
  source?: MetricSource;
  /** null means nothing was recorded that day. 0 is an observed zero. */
  steps: number | null;
  moveCalories: number | null;
  restMinutes: number | null;
  breatheMinutes: number | null;
  readinessScore: number | null;
  manuallyCorrected?: boolean;
  checkIn?: { energy: number | null; soreness: number | null };
  activities: Activity[];
  stepActivities: StepActivity[];
  restPeriods: RestPeriod[];
  breathworkSessions: BreathworkSession[];
};

export type Averages = {
  steps: number;
  moveCalories: number;
  restMinutes: number;
  breatheMinutes: number;
}

export type Trends = {
  steps: number | null;
  moveCalories: number | null;
  restMinutes: number | null;
  breatheMinutes: number | null;
}

export type Changes = {
  steps: number | null;
  moveCalories: number | null;
  restMinutes: number | null;
  breatheMinutes: number | null;
}
