-- Apple Health exports often have some days with steps but no sleep or mindful
-- minutes. A blank total means "not recorded"; 0 still means an observed zero.
ALTER TABLE daily_metrics
    ALTER COLUMN steps DROP NOT NULL,
    ALTER COLUMN move_calories DROP NOT NULL,
    ALTER COLUMN rest_minutes DROP NOT NULL,
    ALTER COLUMN breathwork_minutes DROP NOT NULL;

-- Every record still needs at least one total.
ALTER TABLE daily_metrics
    ADD CONSTRAINT daily_metrics_has_a_total_check CHECK (
        COALESCE(steps, move_calories, rest_minutes, breathwork_minutes) IS NOT NULL
    );

ALTER TABLE daily_metrics DROP CONSTRAINT daily_metrics_source_check;
ALTER TABLE daily_metrics
    ADD CONSTRAINT daily_metrics_source_check
    CHECK (source IN ('demo', 'import', 'manual', 'apple_health'));
