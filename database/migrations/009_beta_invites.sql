-- Invite-only beta sign-up (T270).
-- The owner (BASELINE_OWNER_EMAIL) adds email addresses here from Settings > Beta invites.
-- Only the owner and listed addresses can create an account. Removing a row stops a sign-up
-- that hasn't happened yet; it never touches an account that already exists.
BEGIN;

CREATE TABLE beta_invites (
  email text PRIMARY KEY CHECK (email = lower(btrim(email)) AND email LIKE '%_@_%' AND length(email) <= 254),
  -- A private reminder for the owner, such as "Sam from run club". Never shown to the invitee.
  note varchar(80),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- When an invite email last went out, or null if the owner only copied the link.
  emailed_at timestamptz
);

COMMIT;
