import { expect, type Page } from "@playwright/test";

export async function exerciseJournal(page: Page, origin: string) {
  const date = "2026-11-04";
  await page.goto(origin + "/home/journal?date=" + date);
  const totals = page
    .locator("form")
    .filter({ has: page.getByLabel("Steps", { exact: true }) });
  await totals.getByLabel("Steps").fill("1234");
  await totals.getByLabel("Move (kcal)").fill("25");
  await totals.getByLabel("Rest (minutes)").fill("10");
  await totals.getByLabel("Breathwork (minutes)").fill("0");
  await totals.getByRole("button", { name: "Save" }).click();
  await expect(totals.getByRole("status")).toHaveText("Saved.");
  const context = page
    .locator("form")
    .filter({ has: page.getByLabel("Optional note") });
  await context.getByLabel(/Energy/).selectOption("4");
  await context.getByRole("button", { name: "Save" }).click();
  await expect(context.getByRole("status")).toHaveText("Saved.");
  await totals.getByLabel("Steps").fill("2345");
  await totals.getByRole("button", { name: "Save" }).click();
  await expect
    .poll(
      async () =>
        (
          await (await page.request.get(origin + "/api/export")).json()
        ).metrics.find((m: { date: string }) => m.date === date)?.steps,
    )
    .toBe(2345);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Dashboard" }).click();
  await expect(page.getByRole("img", { name: "Energy 4 of 5" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Soreness skipped" })).toBeVisible();
  await page.getByRole("link", { name: "Open this day" }).click();
  await expect(page.getByLabel("Steps", { exact: true })).toHaveValue("2345");
}
