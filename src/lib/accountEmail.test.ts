import { afterEach, expect, it, vi } from "vitest";
import { canEmailOthers, sendAccountEmail } from "./accountEmail";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("sends the action and recipient to loopback and reports capture failures without revealing the link", async () => {
  vi.stubEnv("BASELINE_MAIL_TRANSPORT", "mailpit");
  const send = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
  vi.stubGlobal("fetch", send);
  const url = "http://localhost:3000/example-token";
  await expect(sendAccountEmail("verify", "one@example.test", url)).rejects.toThrow("Local account email delivery failed.");
  await sendAccountEmail("reset", "two@example.test", url);
  const [destination, options] = send.mock.calls[1];
  expect(destination).toBe("http://127.0.0.1:8025/api/v1/send");
  expect(options.redirect).toBe("error");
  expect(JSON.parse(options.body)).toMatchObject({ Subject: "Reset your Baseline password", To: [{ Email: "two@example.test" }], Text: expect.stringContaining(url) });
});

it("refuses the local mail transport in production", async () => {
  vi.stubEnv("BASELINE_MAIL_TRANSPORT", "mailpit");
  vi.stubEnv("NODE_ENV", "production");
  const send = vi.fn();
  vi.stubGlobal("fetch", send);
  await expect(sendAccountEmail("reset", "fixture@example.test", "fixture")).rejects.toThrow("unavailable");
  expect(send).not.toHaveBeenCalled();
});

it("sends invite emails with the sign-up link", async () => {
  vi.stubEnv("BASELINE_MAIL_TRANSPORT", "mailpit");
  const send = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", send);
  await sendAccountEmail("invite", "sam@example.test", "http://localhost:3000/?join=sam%40example.test");
  expect(JSON.parse(send.mock.calls[0][1].body)).toMatchObject({
    Subject: "You're invited to try Baseline+",
    Text: expect.stringContaining("http://localhost:3000/?join=sam%40example.test"),
  });
});

it("knows Resend's shared test sender can't reach invitees", () => {
  vi.stubEnv("BASELINE_MAIL_TRANSPORT", "resend");
  vi.stubEnv("RESEND_API_KEY", "re_fixture");
  vi.stubEnv("RESEND_FROM_EMAIL", "Baseline <onboarding@resend.dev>");
  expect(canEmailOthers()).toBe(false);
  vi.stubEnv("RESEND_FROM_EMAIL", "Baseline <hello@baseline.example.test>");
  expect(canEmailOthers()).toBe(true);
  vi.stubEnv("RESEND_API_KEY", "");
  expect(canEmailOthers()).toBe(false);
});
