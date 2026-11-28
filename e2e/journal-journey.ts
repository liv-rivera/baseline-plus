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
  const context = page.getByRole("form", { name: "Daily check-in" });
  await context.getByRole("radiogroup", { name: "Energy" }).getByRole("radio", { name: /^4:/ }).click();
  await context.getByRole("button", { name: "Save check-in" }).click();
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
  await page.getByRole("link", { name: "Edit check-in" }).click();
  await expect(page.getByLabel("Steps", { exact: true })).toHaveValue("2345");
}
