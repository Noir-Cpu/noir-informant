import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("shows the verdict, the honest backtest and the empty live record", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Informant", level: 1 })).toBeVisible();
  await expect(page.getByText("does not beat the bookmakers")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Backtest evidence" })).toBeVisible();
  await expect(page.getByText(/95% interval/)).toBeVisible();
});

test("no horizontal scroll at phone width", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Live record" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("charts have table views", async ({ page }) => {
  await page.goto("/");
  const summaries = page.getByText("Table view");
  await expect(summaries).toHaveCount(2);
  await summaries.first().click();
  await expect(page.getByRole("cell", { name: "2019/20" })).toBeVisible();
});

test("no accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Backtest evidence" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
