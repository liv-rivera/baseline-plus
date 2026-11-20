"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import styles from "./AuthForm.module.css";

export function RecoveryForm({ token, invalidLink = false, verify = false }: { token?: string; invalidLink?: boolean; verify?: boolean }) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const title = verify ? "Resend verification email" : token ? "Choose a new password" : "Reset your password";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const email = String(form.get("email") ?? "").trim().toLowerCase();
      const result = token
        ? await authClient.resetPassword({ token, newPassword: String(form.get("password")) })
        : verify
          ? await authClient.sendVerificationEmail({ email, callbackURL: "/home" })
          : await authClient.requestPasswordReset({ email, redirectTo: "/recover" });
      if (result.error) throw new Error();
      setDone(true);
    } catch {
      setError(token ? "Could not reset your password. Request a fresh link and try again." : "Could not send your request. Wait a minute and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.panel}>
      <h1>{title}</h1>
      {invalidLink && <p role="alert">This link is invalid or expired. Request a fresh link below.</p>}
      {done ? <p role="status">{token ? "Password updated. Log in with your new password." : verify ? "If this address needs verification, check your inbox for a new link." : "If an account uses this address, check your inbox for a reset link."}</p> : (
        <form method="post" className={styles.form} onSubmit={submit}>
          <label className={styles.field}>
            {token ? "New password (at least 12 characters)" : "Email"}
            {token ? <input name="password" type="password" minLength={12} autoComplete="new-password" required /> :
              <input name="email" type="email" autoComplete="email" required />}
          </label>
          {error && <p role="alert">{error} {token && <a href="/recover">Request a reset link</a>}</p>}
          <button className={styles.submit} disabled={pending}>{token ? "Save password" : verify ? "Send verification link" : "Send reset link"}</button>
        </form>
      )}
      <Link href="/">Back to login</Link>
    </section>
  );
}
