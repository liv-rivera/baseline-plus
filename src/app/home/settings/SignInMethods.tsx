"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
export function SignInMethods({
  googleId,
  enabled,
}: {
  googleId?: string;
  enabled: boolean;
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
      <p role="status">{message}</p>
    </section>
  );
}
