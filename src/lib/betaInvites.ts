import "server-only";

import { getDatabasePool } from "@/lib/database";

/** Invite-only beta sign-up. The owner and listed addresses are the only ones that can register. */

export interface BetaInvite {
  email: string;
  note: string | null;
  createdAt: Date;
  emailedAt: Date | null;
  /** True once someone has created an account with this address. */
  joined: boolean;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ownerEmail(): string | null {
  const owner = normalizeEmail(process.env.BASELINE_OWNER_EMAIL ?? "");
  return owner || null;
}

export const isOwnerEmail = (email: string) => {
  const owner = ownerEmail();
  return owner !== null && normalizeEmail(email) === owner;
};

/** Whether a new account may be created for this address. */
export async function mayRegister(email: string): Promise<boolean> {
  // An empty owner address closes registration entirely, invites included.
  if (!ownerEmail()) return false;
  return isOwnerEmail(email) || inviteExists(email);
}

export function validateInviteEmail(raw: string): { ok: true; email: string } | { ok: false; message: string } {
  const email = normalizeEmail(raw);
  if (!email) return { ok: false, message: "Enter an email address." };
  if (email.length > 254 || !EMAIL_SHAPE.test(email))
    return { ok: false, message: "That doesn't look like an email address." };
  if (isOwnerEmail(email)) return { ok: false, message: "That's your own address. You can already sign in." };
  return { ok: true, email };
}

export async function listInvites(): Promise<BetaInvite[]> {
  const { rows } = await getDatabasePool().query<{
    email: string;
    note: string | null;
    created_at: Date;
    emailed_at: Date | null;
    joined: boolean;
  }>(
    `SELECT i.email, i.note, i.created_at, i.emailed_at,
            EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = i.email) AS joined
       FROM beta_invites i
      ORDER BY i.created_at DESC, i.email`,
  );
  return rows.map((row) => ({
    email: row.email,
    note: row.note,
    createdAt: row.created_at,
    emailedAt: row.emailed_at,
    joined: row.joined,
  }));
}

/** Adds an invite. Returns false when the address is already on the list. */
export async function addInvite(email: string, note: string | null, invitedBy: string): Promise<boolean> {
  const { rowCount } = await getDatabasePool().query(
    `INSERT INTO beta_invites (email, note, invited_by) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING`,
    [normalizeEmail(email), note?.trim().slice(0, 80) || null, invitedBy],
  );
  return (rowCount ?? 0) > 0;
}

export async function markInviteEmailed(email: string): Promise<void> {
  await getDatabasePool().query("UPDATE beta_invites SET emailed_at = now() WHERE email = $1", [
    normalizeEmail(email),
  ]);
}

/** Removes an invite. An account that already exists is left alone. */
export async function removeInvite(email: string): Promise<boolean> {
  const { rowCount } = await getDatabasePool().query("DELETE FROM beta_invites WHERE email = $1", [
    normalizeEmail(email),
  ]);
  return (rowCount ?? 0) > 0;
}

export async function inviteExists(email: string): Promise<boolean> {
  const { rowCount } = await getDatabasePool().query("SELECT 1 FROM beta_invites WHERE email = $1", [
    normalizeEmail(email),
  ]);
  return (rowCount ?? 0) > 0;
}

/** The link an invitee opens to land on the create-account form with their address filled in. */
export function signUpLink(email: string): string {
  const base = (process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/?join=${encodeURIComponent(normalizeEmail(email))}`;
}
