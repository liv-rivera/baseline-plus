"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import styles from "./UserDetailsPopup.module.css";



export const UserDetailsPopup = () => {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [isOpen, setIsOpen] = useState(false);

  const [notice, setNotice] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      if (wasOpen.current) {
        triggerRef.current?.focus();
        wasOpen.current = false;
      }
      return;
    }

    wasOpen.current = true;
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const signOut = async () => {
    setSigningOut(true);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setNotice("Unable to sign out. Please try again.");
        setSigningOut(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setNotice("Unable to sign out. Please try again.");
      setSigningOut(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        className={styles.accountButton}
        type="button"
        aria-label="Open account details"
        title="Account details"
        onClick={() => setIsOpen(true)}
      >
        <UserRound aria-hidden="true" size={19} strokeWidth={1.8} />
      </button>

      {isOpen && (
        <div
          className={styles.overlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <div
            ref={panelRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-dialog-title"
          >
            <header className={styles.dialogHeader}>
              <div className={styles.profileIdentity}>
                <span className={styles.avatar} aria-hidden="true">
                  <UserRound size={22} strokeWidth={1.7} />
                </span>
                <div>
                  <p className={styles.eyebrow}>BASELINE ACCOUNT</p>
                  <h2 id="account-dialog-title">Account details</h2>
                </div>
              </div>
              <button
                ref={closeRef}
                className={styles.closeButton}
                type="button"
                aria-label="Close account details"
                onClick={() => setIsOpen(false)}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>

            <section className={styles.tabPanel}>
                <dl className={styles.detailsList}>
                  <div className={styles.detailRow}>
                    <dt>Name</dt>
                    <dd>{session?.user.name ?? "Loading account"}</dd>
                  </div>
                  <div className={styles.detailRow}>
                    <dt>Email</dt>
                    <dd>{session?.user.email ?? "—"}</dd>
                  </div>

                  <div className={styles.detailRow}>
                    <dt>Account status</dt>
                    <dd>
                      <span className={styles.statusDot} />
                      {session?.user.emailVerified ? "Verified" : "Pending verification"}
                    </dd>
                  </div>
                </dl>
                <div className={styles.actionRow}>
                  <div>
                    <h3>Sign-in security</h3>
                    <p>Your account is secured with email verification.</p>
                  </div>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    disabled={signingOut}
                    onClick={signOut}
                  >
                    {signingOut ? "Signing out..." : "Sign out"}
                  </button>
                </div>
              <a href="/home/settings">Manage sign-in methods</a>
            </section>
            {notice && <p className={styles.notice} role="status">{notice}</p>}
          </div>
        </div>
      )}
    </>
  );
};