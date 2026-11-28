import Link from "next/link";
import styles from "./page.module.css";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function Landing({searchParams}: {searchParams: Promise<{google?:string}>}) {
  const googleFailed = (await searchParams).google === "failed";
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.intro} aria-labelledby="page-title">
          <p className={styles.mark} aria-hidden="true">B</p>
          <p className={styles.kicker}>PERSONAL PERFORMANCE</p>
          <h1 id="page-title">Baseline+</h1>
          <p className={styles.description}>
            Your performance, in context.
          </p>
          <div className={styles.rule} aria-hidden="true" />
          <p className={styles.caption}>A clearer view of the work and recovery behind every day.</p>
        </section>
        <div>{googleFailed && <p role="alert">Google sign-in could not finish. Sign in with your password to check your linked account.</p>}<AuthForm googleEnabled={Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} /><p className={styles.demoLink}><Link className="text-link" href="/demo">Explore a sample dashboard</Link></p></div>
      </main>
      <footer className={styles.footer}>BASELINE <span aria-hidden="true">·</span> DAILY METRICS</footer>
    </div>
  );
}
