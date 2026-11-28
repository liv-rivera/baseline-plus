"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import styles from "./AppShell.module.css";

/** Always-visible sign out in the sidebar (also available inside the account popup). */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      router.replace("/");
      router.refresh();
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className={styles.signOut} onClick={signOut} disabled={pending}>
        <LogOut size={18} strokeWidth={2} aria-hidden="true" />
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {failed && <p role="alert" className={styles.signOutError}>Couldn&apos;t sign out. Try again.</p>}
    </>
  );
}
