"use client";
import { useActionState, useState } from "react";
import { manageInvite, type InviteState } from "./betaInviteActions";
import styles from "./betaInvites.module.css";

export interface InviteRow {
  email: string;
  note: string | null;
  createdAt: string;
  emailedAt: string | null;
  joined: boolean;
  link: string;
}

const initial: InviteState = { ok: false, message: "" };
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function status(invite: InviteRow) {
  if (invite.joined) return <span className={styles.joined}>Joined</span>;
  if (invite.emailedAt) return `Invite emailed ${day(invite.emailedAt)}`;
  return `Added ${day(invite.createdAt)}, not emailed`;
}

export function BetaInvites({ invites, canEmail }: { invites: InviteRow[]; canEmail: boolean }) {
  const [state, act, pending] = useActionState(manageInvite, initial);
  const [copied, setCopied] = useState("");

  async function copy(invite: InviteRow) {
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(invite.email);
    } catch {
      setCopied("");
      window.prompt("Copy this sign-up link", invite.link);
    }
  }

  return (
    <section id="beta-invites" className={styles.section}>
      <h2>Beta invites</h2>
      <p>
        Baseline+ is invite-only. Add someone&apos;s email address and they can create an account with that
        address. Nobody else can sign up. Only you see this section.
      </p>

      <form action={act} className={styles.add}>
        <input type="hidden" name="op" value="add" />
        <label>
          Email address
          <input name="email" type="email" autoComplete="off" maxLength={254} required />
        </label>
        <label>
          Note for you (optional)
          <input name="note" maxLength={80} placeholder="Sam from run club" />
        </label>
        {canEmail && (
          <label>
            <input type="checkbox" name="send" value="yes" defaultChecked />
            Email them their sign-up link now
          </label>
        )}
        <button disabled={pending}>Add invite</button>
      </form>
      {!canEmail && (
        <p>Invite emails are off until outside email is set up. Copy each person&apos;s sign-up link and send it yourself.</p>
      )}

      <p role="status" className={state.ok ? styles.ok : styles.problem}>
        {state.message}
      </p>

      {invites.length === 0 ? (
        <p className={styles.empty}>No invites yet.</p>
      ) : (
        <ul className={styles.list} aria-label="Invited people">
          {invites.map((invite) => (
            <li key={invite.email}>
              <div className={styles.who}>
                <span className={styles.email}>{invite.email}</span>
                <span className={styles.meta}>
                  {invite.note ? `${invite.note} · ` : ""}
                  {status(invite)}
                </span>
              </div>
              <div className={styles.row}>
                {!invite.joined && (
                  <button type="button" className={styles.quiet} onClick={() => copy(invite)}>
                    {copied === invite.email ? "Link copied" : "Copy sign-up link"}
                  </button>
                )}
                {!invite.joined && canEmail && (
                  <form action={act}>
                    <input type="hidden" name="op" value="resend" />
                    <input type="hidden" name="email" value={invite.email} />
                    <button className={styles.quiet} disabled={pending}>
                      {invite.emailedAt ? "Email again" : "Email link"}
                    </button>
                  </form>
                )}
                <form action={act}>
                  <input type="hidden" name="op" value="remove" />
                  <input type="hidden" name="email" value={invite.email} />
                  <button className={styles.quiet} disabled={pending} aria-label={`Remove invite for ${invite.email}`}>
                    Remove
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
