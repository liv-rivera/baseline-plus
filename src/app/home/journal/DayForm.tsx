"use client";
import { useActionState, type ReactNode } from "react";
import { saveDay } from "./actions";
import styles from "./journal.module.css";
export function DayForm({
  children,
  date,
  owner,
  revision = "",
  action,
}: {
  children?: ReactNode;
  date: string;
  owner: string;
  revision?: string;
  action: string;
}) {
  const [message, submit, pending] = useActionState(saveDay, "");
  const deleting = action.startsWith("delete-");
  return (
    <form action={submit} className={styles.form}>
      {Object.entries({ date, owner, revision, action }).map(
        ([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ),
      )}
      {children}
      {deleting && (
        <label>
          <input type="checkbox" name="confirm" value="yes" required /> Confirm
          removal of{" "}
          {action === "delete-metric"
            ? "totals and their activities"
            : "this check-in"}{" "}
          for {date}
        </label>
      )}
      <button disabled={pending}>
        {pending ? "Saving…" : deleting ? "Remove" : "Save"}
      </button>
      <span role="status">{message}</span>
    </form>
  );
}
