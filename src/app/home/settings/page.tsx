import { DeleteAccount } from "./DeleteAccount";
import { DeleteAllData } from "./DeleteAllData";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { SignInMethods } from "./SignInMethods";
import { CheckInSettings } from "./CheckInSettings";
import { BetaInvites } from "./BetaInvites";
import { isOwnerEmail, listInvites, signUpLink } from "@/lib/betaInvites";
import { canEmailOthers } from "@/lib/accountEmail";
import { getCheckInTime, listCheckInFields } from "@/lib/checkIns";
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
  const owner = session.user.emailVerified && isOwnerEmail(session.user.email);
  const invites = owner
    ? (await listInvites()).map((invite) => ({
        ...invite,
        createdAt: invite.createdAt.toISOString(),
        emailedAt: invite.emailedAt?.toISOString() ?? null,
        link: signUpLink(invite.email),
      }))
    : [];
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
      <CheckInSettings
        owner={session.user.id}
        time={await getCheckInTime(session.user.id)}
        fields={await listCheckInFields(session.user.id, { includeRetired: true })}
      />
      {owner && <BetaInvites invites={invites} canEmail={canEmailOthers()} />}
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
