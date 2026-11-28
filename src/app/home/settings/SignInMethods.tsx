"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
export function SignInMethods({
  googleId,
  enabled,
  email,
}: {
  googleId?: string;
  enabled: boolean;
  email: string;
}) {
  const linked = Boolean(googleId);
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function change() {
    setBusy(true);
    setMessage("");
    try {
      const result = googleId
        ? await authClient.unlinkAccount({ accountId: googleId })
        : await authClient.linkSocial({
            provider: "google",
            callbackURL: "/home/settings",
            errorCallbackURL: "/home/settings?error=link",
          });
      if (result.error) throw new Error();
      if (linked) {
        setMessage("Google disconnected.");
        router.refresh();
      }
    } catch {
      setMessage(
        "Could not change sign-in methods. Sign out and sign back in with your password, then try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reauthenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setBusy(true);
    setMessage("");
    try {
      const result = await authClient.signIn.email({
        email,
        password: String(form.get("password")),
      });
      if (result.error) throw new Error();
      element.reset();
      setMessage("Sign-in refreshed. You can change your sign-in methods now.");
      router.refresh();
    } catch {
      setMessage("Could not verify your password. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Sign-in methods</h2>
      <p>Email and password</p>
      <p>Google: {linked ? "connected" : "disconnected"}</p>
      {(enabled || linked) && (
        <button disabled={busy} onClick={change}>
          {linked ? "Disconnect Google" : "Link Google"}
        </button>
      )}
      <details>
        <summary>Sign in again to change methods</summary>
        <form onSubmit={reauthenticate}>
          <label>
            Email{" "}
            <input
              type="email"
              autoComplete="username"
              value={email}
              readOnly
            />
          </label>
          <label>
            Current password{" "}
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button disabled={busy}>Verify password</button>
        </form>
      </details>
      <p role="status">{message}</p>
    </section>
  );
}
