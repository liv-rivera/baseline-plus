"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { deleteAllData, type DeleteAllDataState } from "./actions";
import styles from "./DeleteAllData.module.css";

const initial: DeleteAllDataState = { ok: false, message: "" };

export function DeleteAllData({ owner }: { owner: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState(deleteAllData, initial);

  useEffect(() => {
    if (state.ok) dialog.current?.close();
  }, [state]);

  function open() {
    setTyped("");
    dialog.current?.showModal();
  }

  return (
    <section className={styles.root}>
      <h2>Delete all data</h2>
      <p>
        Clear every saved day, activity, import and check-in but keep your
        account, sign-in methods and check-in fields. Useful for starting over
        after a test import.
      </p>
      <button type="button" className={styles.trigger} onClick={open}>
        Delete all data
      </button>
      {state.ok && <p role="status">{state.message}</p>}

      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="delete-data-title"
        aria-describedby="delete-data-body"
        onClick={(event) => {
          if (event.target === event.currentTarget && !pending)
            dialog.current?.close();
        }}
      >
        <form action={action} className={styles.panel}>
          <h2 id="delete-data-title">Delete all your data?</h2>
          <p id="delete-data-body">
            This permanently removes every day of metrics, activities, Apple
            Health and CSV imports, and check-ins. It can&apos;t be undone.{" "}
            <a href="/api/export" download>
              Download your records
            </a>{" "}
            first if you want a copy.
          </p>
          <input type="hidden" name="owner" value={owner} />
          <label>
            Type DELETE to confirm
            <input
              name="confirm"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              required
            />
          </label>
          {!state.ok && state.message && (
            <p role="alert" className={styles.error}>
              {state.message}
            </p>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.cancel}
              autoFocus
              disabled={pending}
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.confirm}
              disabled={pending || typed !== "DELETE"}
            >
              {pending ? "Deleting…" : "Delete all data"}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
