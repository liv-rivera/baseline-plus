import "server-only";

import { Resend } from "resend";

type Action = "verify" | "reset";

export async function sendAccountEmail(action: Action, email: string, url: string) {
  const subject = action === "verify" ? "Verify your Baseline account" : "Reset your Baseline password";
  const text = `${subject} by opening this link:\n\n${url}\n\nIf you did not request this email, you can ignore it.`;
  const transport = process.env.BASELINE_MAIL_TRANSPORT ?? "resend";

  if (transport === "mailpit" && process.env.NODE_ENV !== "production") {
    // Fixed loopback destination. Never forward a message to a redirect target.
    const response = await fetch("http://127.0.0.1:8025/api/v1/send", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        From: { Email: "baseline@example.test" }, To: [{ Email: email }], Subject: subject, Text: text,
      }),
    });
    if (!response.ok) throw new Error("Local account email delivery failed.");
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (transport !== "resend" || !apiKey || !from) {
    throw new Error("Account email delivery is unavailable.");
  }
  const { error } = await new Resend(apiKey).emails.send({ from, to: [email], subject, text });
  if (error) throw new Error("Account email delivery failed.");
}
