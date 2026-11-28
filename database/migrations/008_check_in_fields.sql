-- Configurable daily check-in (T257).
-- Each account chooses its own check-in fields. Answers are stored per account, local date and field,
-- next to the existing daily_check_ins row, which keeps the date, revision and the legacy columns.
-- The legacy energy/soreness/note columns stay for one release and are mirrored into answers by a trigger,
-- so the current journal form keeps working until the new form (T258) replaces it.
BEGIN;

CREATE TABLE check_in_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label varchar(40) NOT NULL CHECK (btrim(label) <> ''),
  kind text NOT NULL CHECK (kind IN ('score', 'yes_no', 'number', 'notes')),
  -- Five descriptions, one per score from 1 to 5. Score fields only.
  score_labels text[] CHECK (
    (kind = 'score' AND cardinality(score_labels) = 5) OR (kind <> 'score' AND score_labels IS NULL)
  ),
  unit varchar(12) CHECK (kind = 'number' OR unit IS NULL),
  position smallint NOT NULL DEFAULT 0,
  -- Fields created by the app for every account ('energy', 'soreness', 'notes'); null for the owner's own fields.
  system_key text CHECK (system_key IN ('energy', 'soreness', 'notes')),
  -- Starter set the field came from, for example 'pots'.
  preset text,
  -- Metrics whose changes may prompt a question about this field (F103).
  prompt_metrics text[] NOT NULL DEFAULT '{}' CHECK (
    prompt_metrics <@ ARRAY['hrv', 'resting_heart_rate', 'sleep_duration']::text[]
  ),
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id, user_id),
  UNIQUE (user_id, system_key)
);
CREATE UNIQUE INDEX check_in_fields_active_label ON check_in_fields (user_id, lower(label))
  WHERE retired_at IS NULL;

CREATE TABLE check_in_answers (
  user_id uuid NOT NULL,
  local_date date NOT NULL,
  field_id uuid NOT NULL,
  score smallint CHECK (score BETWEEN 1 AND 5),
  yes_no boolean,
  number numeric(8, 2) CHECK (number >= 0),
  tags text[] CHECK (cardinality(tags) BETWEEN 1 AND 20),
  note varchar(240),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, local_date, field_id),
  FOREIGN KEY (user_id, local_date) REFERENCES daily_check_ins (user_id, local_date) ON DELETE CASCADE,
  FOREIGN KEY (field_id, user_id) REFERENCES check_in_fields (id, user_id) ON DELETE CASCADE,
  CHECK (num_nonnulls(score, yes_no, number, tags, note) >= 1)
);
CREATE INDEX check_in_answers_field ON check_in_answers (field_id);

CREATE TABLE check_in_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Evening check-ins describe the day just finished; morning check-ins describe the night before and today.
  check_in_time text NOT NULL DEFAULT 'evening' CHECK (check_in_time IN ('morning', 'evening')),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- A check-in may now hold only configurable answers, so the legacy "energy, soreness or note" rule goes.
-- The application refuses to save a check-in with nothing in it.
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'daily_check_ins'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%note%'
  LOOP
    EXECUTE format('ALTER TABLE daily_check_ins DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END;
$$;

CREATE FUNCTION ensure_default_check_in_fields(owner uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO check_in_fields (user_id, label, kind, score_labels, position, system_key, prompt_metrics)
  VALUES
    (owner, 'Energy', 'score', ARRAY[
      'Running on empty, hard to get through the day',
      'Low, everyday tasks take effort',
      'Okay, a normal day',
      'Good, could take on a bit more',
      'Great, full of energy'], 0, 'energy', ARRAY['hrv', 'resting_heart_rate', 'sleep_duration']),
    (owner, 'Soreness', 'score', ARRAY[
      'None',
      'Mild, easy to ignore',
      'Noticeable, but I can do what I planned',
      'Strong, I changed my plans for it',
      'Severe, it stopped me'], 1, 'soreness', '{}'),
    (owner, 'Notes', 'notes', NULL, 100, 'notes', '{}')
  ON CONFLICT (user_id, system_key) DO NOTHING;
$$;

CREATE FUNCTION add_default_check_in_fields() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ensure_default_check_in_fields(NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER add_default_check_in_fields AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION add_default_check_in_fields();

-- Mirror the legacy columns into answers for the system fields. Retired system fields are left alone.
CREATE FUNCTION mirror_legacy_check_in() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  energy_field uuid;
  soreness_field uuid;
  notes_field uuid;
BEGIN
  PERFORM ensure_default_check_in_fields(NEW.user_id);
  SELECT id INTO energy_field FROM check_in_fields
    WHERE user_id = NEW.user_id AND system_key = 'energy' AND retired_at IS NULL;
  SELECT id INTO soreness_field FROM check_in_fields
    WHERE user_id = NEW.user_id AND system_key = 'soreness' AND retired_at IS NULL;
  SELECT id INTO notes_field FROM check_in_fields
    WHERE user_id = NEW.user_id AND system_key = 'notes' AND retired_at IS NULL;

  IF energy_field IS NOT NULL THEN
    IF NEW.energy IS NULL THEN
      DELETE FROM check_in_answers
        WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND field_id = energy_field;
    ELSE
      INSERT INTO check_in_answers (user_id, local_date, field_id, score)
        VALUES (NEW.user_id, NEW.local_date, energy_field, NEW.energy)
        ON CONFLICT (user_id, local_date, field_id)
        DO UPDATE SET score = EXCLUDED.score, updated_at = clock_timestamp()
        WHERE check_in_answers.score IS DISTINCT FROM EXCLUDED.score;
    END IF;
  END IF;

  IF soreness_field IS NOT NULL THEN
    IF NEW.soreness IS NULL THEN
      DELETE FROM check_in_answers
        WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND field_id = soreness_field;
    ELSE
      INSERT INTO check_in_answers (user_id, local_date, field_id, score)
        VALUES (NEW.user_id, NEW.local_date, soreness_field, NEW.soreness)
        ON CONFLICT (user_id, local_date, field_id)
        DO UPDATE SET score = EXCLUDED.score, updated_at = clock_timestamp()
        WHERE check_in_answers.score IS DISTINCT FROM EXCLUDED.score;
    END IF;
  END IF;

  IF notes_field IS NOT NULL THEN
    IF NEW.note = '' THEN
      -- Keep any tags on the Notes answer; drop it only when nothing is left.
      UPDATE check_in_answers SET note = NULL, updated_at = clock_timestamp()
        WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND field_id = notes_field
          AND note IS NOT NULL AND cardinality(tags) > 0;
      DELETE FROM check_in_answers
        WHERE user_id = NEW.user_id AND local_date = NEW.local_date AND field_id = notes_field
          AND (tags IS NULL OR cardinality(tags) = 0);
    ELSE
      INSERT INTO check_in_answers (user_id, local_date, field_id, note)
        VALUES (NEW.user_id, NEW.local_date, notes_field, NEW.note)
        ON CONFLICT (user_id, local_date, field_id)
        DO UPDATE SET note = EXCLUDED.note, updated_at = clock_timestamp()
        WHERE check_in_answers.note IS DISTINCT FROM EXCLUDED.note;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mirror_legacy_check_in
  AFTER INSERT OR UPDATE OF energy, soreness, note ON daily_check_ins
  FOR EACH ROW EXECUTE FUNCTION mirror_legacy_check_in();

-- Backfill: default fields for every existing account, then answers for every existing check-in.
DO $$ BEGIN PERFORM ensure_default_check_in_fields(id) FROM users; END $$;

INSERT INTO check_in_answers (user_id, local_date, field_id, score, updated_at)
SELECT c.user_id, c.local_date, f.id, c.energy, c.updated_at
FROM daily_check_ins c JOIN check_in_fields f ON f.user_id = c.user_id AND f.system_key = 'energy'
WHERE c.energy IS NOT NULL;

INSERT INTO check_in_answers (user_id, local_date, field_id, score, updated_at)
SELECT c.user_id, c.local_date, f.id, c.soreness, c.updated_at
FROM daily_check_ins c JOIN check_in_fields f ON f.user_id = c.user_id AND f.system_key = 'soreness'
WHERE c.soreness IS NOT NULL;

INSERT INTO check_in_answers (user_id, local_date, field_id, note, updated_at)
SELECT c.user_id, c.local_date, f.id, c.note, c.updated_at
FROM daily_check_ins c JOIN check_in_fields f ON f.user_id = c.user_id AND f.system_key = 'notes'
WHERE c.note <> '';

COMMIT;
