import { DeleteAccount } from "./DeleteAccount";
import { DeleteAllData } from "./DeleteAllData";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
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
    <div className={styles.page}>
      <h1>Account settings</h1>
      {(await searchParams).error && (
        <p role="alert">
          The sign-in change could not finish. Your password still works.
        </p>
      )}
      <SignInMethods
        email={session.user.email}
        googleId={accounts.find((a) => a.providerId === "google")?.id}
        enabled={Boolean(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
        )}
      />
      <section>
        <h2>Your data</h2>
        <p>Download everything Baseline+ stores for you as a JSON file.</p>
        <a className="button-secondary" style={{ justifySelf: "start" }} href="/api/export" download>
          Download my records
        </a>
      </section>
      <DeleteAllData owner={session.user.id} />
      <div className={styles.danger}>
        <DeleteAccount owner={session.user.id} />
      </div>
    </div>
  );
}
