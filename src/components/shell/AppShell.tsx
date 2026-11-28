"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BookOpen, LayoutDashboard, Settings, Upload } from "lucide-react";
import { UserDetailsPopup } from "@/components/UserDetailsPopup";
import { SignOutButton } from "./SignOutButton";
import styles from "./AppShell.module.css";

const navItems = [
  { href: "/home", label: "Dashboard", icon: LayoutDashboard },
  { href: "/home/journal", label: "Journal", icon: BookOpen },
  { href: "/home/import", label: "Import", icon: Upload },
  { href: "/home/settings", label: "Settings", icon: Settings },
];

const isActive = (pathname: string, href: string) =>
  href === "/home"
    ? pathname === "/home" || ["/home/steps", "/home/move-calories", "/home/rest", "/home/breathwork"].includes(pathname)
    : pathname.startsWith(href);

/** Sidebar layout shared by every signed-in page and the read-only /demo. */
export function AppShell({ children, demo = false }: { children: ReactNode; demo?: boolean }) {
  const pathname = usePathname() ?? "";

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href={demo ? "/" : "/home"}>
          <span className={styles.mark} aria-hidden="true">B</span>
          Baseline+
        </Link>
        <nav className={styles.nav} aria-label="Main">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = demo ? href === "/home" : isActive(pathname, href);
            const content = (
              <>
                <Icon size={18} strokeWidth={2} aria-hidden="true" />
                {label}
              </>
            );
            if (demo) {
              return (
                <span
                  key={href}
                  className={active ? styles.active : styles.disabled}
                  aria-current={active ? "page" : undefined}
                  aria-disabled={active ? undefined : "true"}
                >
                  {content}
                </span>
              );
            }
            return (
              <Link key={href} href={href} className={active ? styles.active : styles.link} aria-current={active ? "page" : undefined}>
                {content}
              </Link>
            );
          })}
        </nav>
        <div className={styles.footer}>
          {demo ? (
            <>
              <p className={styles.demoNote}>Sample data · read-only</p>
              <Link className={styles.demoCta} href="/">Sign in</Link>
            </>
          ) : (
            <>
              <SignOutButton />
              <UserDetailsPopup />
            </>
          )}
        </div>
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
