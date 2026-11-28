BEGIN;
ALTER TABLE daily_metrics ADD COLUMN manually_corrected boolean NOT NULL DEFAULT false;

CREATE TABLE daily_check_ins (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  energy smallint CHECK (energy BETWEEN 1 AND 5),
  soreness smallint CHECK (soreness BETWEEN 1 AND 5),
  note varchar(240) NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, local_date),
  CHECK (energy IS NOT NULL OR soreness IS NOT NULL OR note <> '')
);

-- Reset tokens are associated with a user by value rather than a foreign key.
CREATE FUNCTION remove_user_reset_tokens() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM auth_verifications WHERE value = OLD.id::text AND identifier LIKE 'reset-password:%';
  RETURN OLD;
END;
$$;
CREATE TRIGGER remove_user_reset_tokens AFTER DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION remove_user_reset_tokens();
COMMIT;
