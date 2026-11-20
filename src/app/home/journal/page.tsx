import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestSession } from "@/lib/auth-session";
import { readDay, recentCheckIns, validDay } from "@/lib/journal";
import { DayForm } from "./DayForm";
import { DayPicker } from "./DayPicker";
import styles from "./journal.module.css";
export default async function Journal({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getRequestSession(await headers());
  if (!session) redirect("/");
  const date = (await searchParams).date ?? "";
  const selected = validDay(date);
  const { metric, checkIn } = selected
    ? await readDay(session.user.id, date)
    : { metric: undefined, checkIn: undefined };
  const recent = await recentCheckIns(session.user.id);
  const props = { date, owner: session.user.id };
  return (
    <main className={styles.page}>
      <Link href="/home">Back to dashboard</Link>
      <h1>Daily journal</h1>
      <DayPicker date={selected ? date : ""} />
      {selected && (
        <>
          <h2>Daily totals</h2>
          {metric && (
            <p>
              Original source: {metric.source}
              {metric.manually_corrected && " · Manually corrected"}
            </p>
          )}
          {metric?.detailed ? (
            <p>
              {metric.steps} steps · {metric.calories} kcal · {metric.rest} rest
              minutes · {metric.breathe} breathwork minutes. These totals
              include individual activities.
            </p>
          ) : (
            <DayForm
              key={date + "metrics"}
              {...props}
              action="metric"
              revision={metric?.revision}
            >
              {(
                [
                  ["steps", "Steps"],
                  ["calories", "Move (kcal)"],
                  ["rest", "Rest (minutes)"],
                  ["breathe", "Breathwork (minutes)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    name={key}
                    min="0"
                    max={
                      key === "rest" || key === "breathe" ? 1440 : 2147483647
                    }
                    required
                    defaultValue={metric?.[key]}
                  />
                </label>
              ))}
            </DayForm>
          )}
          {metric && (
            <DayForm
              {...props}
              revision={metric.revision}
              action="delete-metric"
            />
          )}
          <h2>Optional check-in</h2>
          <DayForm
            key={date + "context"}
            {...props}
            revision={checkIn?.revision}
            action="context"
          >
            {(["energy", "soreness"] as const).map((key) => (
              <label key={key}>
                {key === "energy" ? "Energy" : "Soreness"} (1 low, 5 high)
                <select name={key} defaultValue={checkIn?.[key] ?? ""}>
                  <option value="">Skip</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              Optional note
              <textarea
                name="note"
                maxLength={240}
                defaultValue={checkIn?.note}
              />
            </label>
          </DayForm>
          {checkIn && (
            <DayForm
              {...props}
              revision={checkIn.revision}
              action="delete-context"
            />
          )}
        </>
      )}
      {recent.length > 0 && (
        <section>
          <h2>Recent check-ins</h2>
          <ul>
            {recent.map((c) => (
              <li key={c.date}>
                <Link href={`/home/journal?date=${c.date}`}>{c.date}</Link> ·
                Energy {c.energy ?? "skipped"} · Soreness{" "}
                {c.soreness ?? "skipped"}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p>
        <a href="/api/export" download>
          Export my records (JSON)
        </a>
      </p>
    </main>
  );
}
