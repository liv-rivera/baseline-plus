-- A missing source score is unknown. Existing scores and their range check are preserved.
ALTER TABLE daily_metrics ALTER COLUMN readiness_score DROP NOT NULL;
