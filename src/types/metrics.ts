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

/** One answer from a field the owner added, such as Dizziness or Fluids. */
export type CheckInSymptom =
  | { label: string; kind: "score"; value: number; unit?: null }
  | { label: string; kind: "yes_no"; value: boolean; unit?: null }
  | { label: string; kind: "number"; value: number; unit?: string | null };

/** The check-in saved for the same local date as the day's metrics. */
export type DayCheckIn = {
  energy: number | null;
  soreness: number | null;
  /** Answers to every other field, in form order. Hidden fields keep their answers. */
  symptoms?: CheckInSymptom[];
  tags?: string[];
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
  checkIn?: DayCheckIn;
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
