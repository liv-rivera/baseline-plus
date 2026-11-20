import { DeleteAccount } from "./DeleteAccount";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { SignInMethods } from "./SignInMethods";
import styles from "../journal/journal.module.css";
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  const accounts = await auth.api.listUserAccounts({
    headers: await headers(),
  });
  return (
    <main className={styles.page}>
      <Link href="/home">Back to dashboard</Link>
      <h1>Account settings</h1>
      {(await searchParams).error && (
        <p role="alert">
          The sign-in change could not finish. Your password still works.
        </p>
      )}
      <SignInMethods
        googleId={accounts.find((a) => a.providerId === "google")?.id}
        enabled={Boolean(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
        )}
      />
      <a href="/api/export" download>
        Download my records
      </a>
      <DeleteAccount owner={session.user.id} />
    </main>
  );
}
