"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

export function DeleteAccount({ owner }: { owner: string }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("confirm") !== "DELETE") return;
    setPending(true);
    try {
      const result = await authClient.deleteUser({
        password: String(form.get("password")),
        fetchOptions: { headers: { "x-baseline-confirm-deletion": owner } },
      });
      if (result.error) throw new Error();
      window.location.replace("/");
    } catch {
      setMessage(
        "Could not delete the account. Check your current password and try again.",
      );
      setPending(false);
    }
  }

  return (
    <details>
      <summary>Delete my account</summary>
      <p>
        Deleting your account removes your saved records, check-ins and sign-in
        methods and ends every session. Download any records you want to keep
        first.
      </p>
      <form onSubmit={remove}>
        <label>
          Current password{" "}
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          Type DELETE to confirm{" "}
          <input name="confirm" pattern="DELETE" required />
        </label>
        <button disabled={pending}>Permanently delete account</button>
        <p role="status">{message}</p>
      </form>
    </details>
  );
}
