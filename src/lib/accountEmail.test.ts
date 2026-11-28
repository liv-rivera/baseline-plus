import { afterEach, expect, it, vi } from "vitest";
import { sendAccountEmail } from "./accountEmail";

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
