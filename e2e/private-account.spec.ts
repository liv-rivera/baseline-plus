import { exerciseJournal } from "./journal-journey";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const origin = "http://localhost:3300";
const inbox = "http://127.0.0.1:8025";
const owner = process.env.BASELINE_OWNER_EMAIL ?? "";

async function actionLink(subject: string) {
  let messageId: string | undefined;
  await expect
    .poll(async () => {
      const response = await fetch(
        `${inbox}/api/v1/search?${new URLSearchParams({ query: `to:${owner}` })}`,
      );
      expect(response.status).toBe(200);
      const { messages } = await response.json();
      messageId = messages.find(
        (m: { Subject: string }) => m.Subject === subject,
      )?.ID;
      return Boolean(messageId);
    })
    .toBe(true);
  const message = await (
    await fetch(`${inbox}/api/v1/message/${messageId}`)
  ).json();
  expect(
    message.To.map((recipient: { Address: string }) => recipient.Address),
  ).toEqual([owner]);
  const url = new URL(message.Text.match(/https?:\/\/\S+/)?.[0]);
  expect(url.origin).toBe(origin);
  return url;
}

test("a private owner verifies, imports a summary and recovers access on mobile", async ({
  page,
  request,
}) => {
  // The server and test must use the same fresh disposable fixture.
  if (
    !/^qa-[a-f0-9-]+@example\.test$/.test(owner) ||
    process.env.BASELINE_MAIL_TRANSPORT !== "mailpit"
  ) {
    throw new Error(
      "Start a disposable loopback server with Mailpit and a fresh qa-<uuid>@example.test owner.",
    );
  }
  const password = randomUUID();
  const newPassword = randomUUID();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Local fixture");
  await page.getByLabel("Email", { exact: true }).fill(owner);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("form").getByRole("button").click();
  await expect(page.getByRole("status")).toContainText("verification link");
  expect((await page.request.get("/api/metrics")).status()).toBe(401);
  await page.goto((await actionLink("Verify your Baseline account")).href);
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  const intakeStarted = performance.now();
  await page.getByRole("link", { name: "Import data" }).click();
  await expect(page.getByLabel("CSV file")).toBeEnabled();
  await page.getByLabel("CSV file").setInputFiles({
    name: "sample.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "date,steps,moveCalories,restMinutes,breatheMinutes\n2026-11-01,100,5,0,10",
    ),
  });
  await page.getByRole("button", { name: "Add records" }).click();
  await page.getByRole("link", { name: "View dashboard" }).click();
  await expect(
    page.getByText("No score recorded for this date."),
  ).toBeVisible();

  const imported = await (await page.request.get("/api/metrics")).json();
  expect(imported.metrics[0].date).toBe("2026-11-01");
  console.log(
    `Synthetic CSV intake completed in ${((performance.now() - intakeStarted) / 1000).toFixed(1)} seconds.`,
  );
  await page.getByRole("link", { name: "Import data" }).click();
  await expect(page.getByLabel("CSV file")).toBeEnabled();
  await page
    .getByLabel("CSV file")
    .setInputFiles({
      name: "repeat.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "date,steps,moveCalories,restMinutes,breatheMinutes\n2026-11-01,100,5,0,10",
      ),
    });
  await expect(
    page.getByRole("alert").filter({ hasText: "already exists" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add records" })).toHaveCount(
    0,
  );
  await page
    .getByLabel("CSV file")
    .setInputFiles({
      name: "malformed.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("date,steps\n2026-11-02,100"),
    });
  await expect(
    page.getByRole("alert").filter({ hasText: "Required columns" }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/metrics")).json()).metrics,
  ).toHaveLength(1);
  await page.getByRole("link", { name: "Back to dashboard" }).click();
  await expect(page).toHaveURL(origin + "/home");
  await expect(page.getByRole("link", { name: "Import data" })).toBeVisible();

  const localRecords = JSON.stringify([
    {
      date: "2026-10-31",
      steps: 0,
      moveCalories: 1,
      restMinutes: 5,
      breatheMinutes: 0,
      readinessScore: 0,
    },
  ]);
  await page.evaluate(
    (value) => localStorage.setItem("baseline.importedMetrics.v1", value),
    localRecords,
  );
  await page.reload();
  await page.getByRole("link", { name: "Import data" }).click();
  await page.getByText("Import earlier browser data").click();
  await page.getByRole("button", { name: "Preview browser totals" }).click();
  await expect(page.getByText(owner, { exact: false }).first()).toBeVisible();
  const before = await (await page.request.get("/api/metrics")).json();
  expect(before.metrics).toHaveLength(1);
  await page.getByRole("button", { name: "Add records" }).click();
  await expect(page.getByText(/1 record added/)).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("baseline.importedMetrics.v1"),
    ),
  ).toBe(localRecords);

  await exerciseJournal(page, origin);
  await expect(
    page.getByRole("heading", { name: "Daily journal" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/demo");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Back to sign in" }),
  ).toBeFocused();
  await page.getByLabel("Prior window").selectOption("28");
  await expect(page.getByText(/27 observed days/)).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });

  // A separate signed-out client requests the reset. The verified browser still has its original session.
  await request.post("/api/auth/request-password-reset", {
    data: { email: owner, redirectTo: "/recover" },
    headers: { origin },
  });
  const resetLink = await actionLink("Reset your Baseline password");
  await page.goto(resetLink.href);
  await page.getByLabel(/New password/).fill(newPassword);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated");
  expect((await page.request.get("/api/metrics")).status()).toBe(401);
  expect((await page.request.get("/home", { maxRedirects: 0 })).status()).toBe(
    307,
  );
  await page.goto(resetLink.href);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "This link is invalid or expired" }),
  ).toContainText("invalid or expired");
  await page.getByRole("link", { name: "Back to login" }).click();
  const login = page.getByRole("form", { name: "Log in form" });
  await login.getByLabel("Email").fill(owner);
  await login.getByLabel("Password").fill(password);
  await page.getByRole("form").getByRole("button").click();
  await expect(page.getByRole("form").getByRole("alert")).toContainText(
    "couldn't sign you in",
  );
  await page.getByLabel("Password").fill(newPassword);
  await page.getByRole("form").getByRole("button").click();
  await expect(
    page.getByText("No score recorded for this date."),
  ).toBeVisible();

  const outsider = `qa-${randomUUID()}@example.test`;
  await request.post("/api/auth/sign-up/email", {
    data: { email: outsider, name: "Other", password },
    headers: { origin },
  });
  const mailbox = await (
    await request.get(`${inbox}/api/v1/search`, {
      params: { query: `to:${outsider}` },
    })
  ).json();
  expect(mailbox.messages).toEqual([]);
});

test("the auth and metrics endpoints enforce the account lifecycle", async ({
  playwright,
}) => {
  if (
    !/^qa-[a-f0-9-]+@example\.test$/.test(owner) ||
    process.env.BASELINE_MAIL_TRANSPORT !== "mailpit"
  ) {
    throw new Error(
      "Use a disposable loopback server and synthetic owner fixture.",
    );
  }
  const client = await playwright.request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Origin: origin },
  });
  const password = randomUUID();
  const newPassword = randomUUID();
  try {
    const post = (path: string, data: object) =>
      client.post(`/api/auth/${path}`, { data });
    const signup = await post("sign-up/email", {
      email: owner,
      password,
      name: "Owner",
      callbackURL: "/home",
    });
    expect(signup.status()).toBe(200);
    expect((await post("sign-in/email", { email: owner, password })).ok()).toBe(
      false,
    );
    const resend = { email: owner, callbackURL: "/home" };
    expect((await post("send-verification-email", resend)).ok()).toBe(true);
    expect((await post("send-verification-email", resend)).status()).toBe(429);
    const verification = await actionLink("Verify your Baseline account");
    expect(
      (await client.get(verification.href, { maxRedirects: 0 })).status(),
    ).toBe(302);
    expect((await client.get("/api/metrics")).status()).toBe(200);

    const record = {
      date: "2026-11-02",
      steps: 0,
      moveCalories: 3,
      restMinutes: 20,
      breatheMinutes: 1,
      activities: [],
      stepActivities: [],
      restPeriods: [],
      breathworkSessions: [],
    };
    expect(
      (await client.post("/api/metrics", { data: [record] })).status(),
    ).toBe(201);
    expect(
      (await client.post("/api/metrics", { data: [record] })).status(),
    ).toBe(409);
    expect(
      (
        await post("request-password-reset", {
          email: owner,
          redirectTo: "/recover",
        })
      ).ok(),
    ).toBe(true);
    const reset = await actionLink("Reset your Baseline password");
    const callback = await client.get(reset.href, { maxRedirects: 0 });
    const redirect = new URL(callback.headers().location, origin);
    expect(redirect.origin).toBe(origin);
    const token = redirect.searchParams.get("token");
    expect(Boolean(token)).toBe(true);
    expect((await post("reset-password", { newPassword, token })).ok()).toBe(
      true,
    );
    expect((await post("reset-password", { newPassword, token })).ok()).toBe(
      false,
    );
    expect((await client.get("/api/metrics")).status()).toBe(401);
    expect((await post("sign-in/email", { email: owner, password })).ok()).toBe(
      false,
    );
    expect(
      (
        await post("sign-in/email", { email: owner, password: newPassword })
      ).ok(),
    ).toBe(true);
    const data = await (await client.get("/api/metrics")).json();
    expect(data.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ...record, readinessScore: null }),
      ]),
    );
    expect((await post("sign-out", {})).ok()).toBe(true);
    expect((await client.get("/api/metrics")).status()).toBe(401);
  } finally {
    await client.dispose();
  }
});
