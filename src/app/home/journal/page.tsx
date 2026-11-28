import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestSession } from "@/lib/auth-session";
import { readDay, recentCheckIns, validDay } from "@/lib/journal";
import { listCheckInFields, readCheckIn, recentCheckInTags } from "@/lib/checkIns";
import { CheckInForm } from "./CheckInForm";
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
  const { metric } = selected
    ? await readDay(session.user.id, date)
    : { metric: undefined };
  const recent = await recentCheckIns(session.user.id);
  const [fields, saved, tags] = selected
    ? await Promise.all([
        listCheckInFields(session.user.id),
        readCheckIn(session.user.id, date),
        recentCheckInTags(session.user.id),
      ])
    : [[], null, []];
  const props = { date, owner: session.user.id };
  return (
    <div className={styles.page}>
      <h1>Daily journal</h1>
      <DayPicker date={selected ? date : ""} />
      {selected && (
        <>
          <h2>Daily totals</h2>
          {metric && (
            <p>
              Original source: {metric.source === "apple_health" ? "Apple Health" : metric.source}
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
                    defaultValue={metric?.[key] ?? ""}
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
          <h2 id="check-in">Check-in</h2>
          <p>
            Every field is optional. Leave anything you didn&apos;t notice empty.{" "}
            <Link href="/home/settings#check-in-fields">Change fields</Link>
          </p>
          <CheckInForm
            key={date + "check-in"}
            date={date}
            owner={session.user.id}
            fields={fields}
            answers={saved?.answers ?? {}}
            revision={saved?.revision}
            recentTags={tags}
          />
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
    </div>
  );
}
