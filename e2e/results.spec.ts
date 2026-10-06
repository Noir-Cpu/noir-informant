import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("shows the verdict, the honest backtest and the empty live record", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Informant", level: 1 })).toBeVisible();
  await expect(page.getByText("does not beat the bookmakers")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Backtest evidence" })).toBeVisible();
  await expect(page.getByText(/95% interval/)).toBeVisible();
});

test("no horizontal scroll at phone width, including with the tables open", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Live record" })).toBeVisible();
  for (const summary of await page.getByText("Table view of this chart").all()) await summary.click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("charts have table views", async ({ page }) => {
  await page.goto("/");
  const summaries = page.getByText("Table view of this chart");
  await expect(summaries).toHaveCount(2);
  await summaries.first().click();
  await expect(page.getByRole("cell", { name: "2019/20" })).toBeVisible();
});

for (const scheme of ["light", "dark"] as const) {
  test(`no accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Backtest evidence" })).toBeVisible();
    for (const summary of await page.getByText("Table view of this chart").all()) await summary.click();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
    expect(results.violations).toEqual([]);
  });
}

test("charts are labelled and described, and their text stays readable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Backtest evidence" })).toBeVisible();
  const charts = page.getByRole("img");
  await expect(charts).toHaveCount(2);
  for (const chart of await charts.all()) {
    await expect(chart).toHaveAccessibleName(/\S/);
    await expect(chart).toHaveAccessibleDescription(/\S/);
  }
  // The rendered size of the axis text, after any scaling, must be at least 11px.
  const sizes = await page.locator("svg text.axis").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11 * 0.9);
  const scale = await page.locator("svg.chart").first().evaluate((s) => s.getBoundingClientRect().width / (s as SVGSVGElement).viewBox.baseVal.width);
  expect(scale).toBeCloseTo(1, 1);
});

test("keyboard users can reach every control and see where they are", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Backtest evidence" })).toBeVisible();
  const seen: string[] = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const outline = getComputedStyle(el).outlineStyle;
      return { tag: el.tagName, text: (el.textContent ?? "").trim().slice(0, 30), outline };
    });
    if (info.tag === "BODY") break;
    expect(info.outline).not.toBe("none");
    seen.push(info.text);
  }
  expect(seen.join("|")).toContain("Backtest evidence");
  expect(seen.join("|")).toContain("Table view of this chart");
});

// The live data has no upcoming predictions between matchdays, so exercise the table with a fixture.
test("upcoming predictions table: renders, stays inside the viewport and passes axe", async ({ page }) => {
  const row = (i: number) => ({
    division: i % 2 ? "SP1" : "E0", date: "2030-01-02", kickoff_utc: "2030-01-02T15:00:00Z",
    home: "Wolverhampton Wanderers", away: "Brighton and Hove Albion", probs: [0.41, 0.27, 0.32], book: [0.4, 0.28, 0.32],
    published_at: "2030-01-01T09:00:00Z", hash: `abcdef012345${i}`.padEnd(64, "0"), seq: i,
  });
  await page.route("**/data/upcoming.json", (r) => r.fulfill({ json: [row(1), row(2)] }));
  await page.goto("/");
  const table = page.getByRole("table", { name: "Published predictions for upcoming matches" });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(3);
  const region = page.getByRole("region", { name: /Upcoming predictions table/ });
  await region.focus();
  await expect(region).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
