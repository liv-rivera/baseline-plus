import { RecoveryForm } from "@/components/RecoveryForm";
import styles from "../page.module.css";

export default async function Recover({ searchParams }: {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[]; action?: string }>;
}) {
  const { token, error, action } = await searchParams;
  return (
    <main className={styles.page}>
      <RecoveryForm token={typeof token === "string" && !error ? token : undefined} invalidLink={Boolean(error)} verify={action === "verify" && !token} />
    </main>
  );
}
