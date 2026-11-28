import { afterEach, expect, it, vi } from "vitest";
const { createTransport, sendMail } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});
vi.mock("nodemailer", () => ({ default: { createTransport } }));
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

it("sends through Gmail with an app password and can reach invitees", async () => {
  vi.stubEnv("BASELINE_MAIL_TRANSPORT", "gmail");
  vi.stubEnv("GMAIL_USER", "baseline.fixture@gmail.com");
  vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
  sendMail.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("535 bad login"));
  expect(canEmailOthers()).toBe(true);
  await sendAccountEmail("invite", "sam@example.test", "https://baseline.example.test/?join=sam%40example.test");
  expect(createTransport).toHaveBeenCalledWith({
    service: "gmail",
    auth: { user: "baseline.fixture@gmail.com", pass: "abcdefghijklmnop" },
  });
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
    from: { name: "Baseline+", address: "baseline.fixture@gmail.com" },
    to: "sam@example.test",
    subject: "You're invited to try Baseline+",
  }));
  await expect(sendAccountEmail("verify", "sam@example.test", "x")).rejects.toThrow("Account email delivery failed.");
  vi.stubEnv("GMAIL_APP_PASSWORD", "");
  expect(canEmailOthers()).toBe(false);
  await expect(sendAccountEmail("verify", "sam@example.test", "x")).rejects.toThrow("unavailable");
});
