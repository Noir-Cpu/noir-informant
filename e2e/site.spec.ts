import { expect, test } from "@playwright/test";

const SITE = "https://noir-informant.noir-cpu.workers.dev/";

test("loads with no console output and no Content-Security-Policy violation", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()}`));
  await page.addInitScript(() => {
    (window as any).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as any).__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`));
  });
  const res = await page.goto("/");
  // The policy must really be on the document, otherwise this test proves nothing.
  expect(res!.headers()["content-security-policy"]).toContain("default-src 'none'");
  await expect(page.getByRole("heading", { name: "Backtest evidence" })).toBeVisible();
  for (const summary of await page.getByText("Table view of this chart").all()) await summary.click();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Backtest evidence" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__csp)).toEqual([]);
  expect(problems).toEqual([]);
});

test("the CSP really blocks inline script and foreign origins", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const violations: string[] = [];
    document.addEventListener("securitypolicyviolation", (e) => violations.push(e.violatedDirective));
    const s = document.createElement("script");
    s.textContent = "window.__ran = true";
    document.head.append(s);
    await fetch("https://example.com/", { mode: "no-cors" }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 200));
    return { ran: (window as any).__ran === true, violations };
  });
  expect(result.ran).toBe(false);
  expect(result.violations).toEqual(expect.arrayContaining(["script-src-elem", "connect-src"]));
});

test("security and caching headers", async ({ request }) => {
  const home = await request.get("/");
  const h = home.headers();
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["cross-origin-opener-policy"]).toBe("same-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  const html = await home.text();
  const asset = html.match(/\/assets\/index-[^"]+\.js/)![0];
  expect((await request.get(asset)).headers()["cache-control"]).toContain("immutable");
  expect((await request.get("/data/live.json")).headers()["cache-control"]).toMatch(/max-age=300/);
});

test("the page works as plain HTML before any script runs", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain("<h1>Informant</h1>");
  expect(html).toContain("does <em>not</em> beat the bookmakers");
  expect(html).toMatch(/<link rel="preload" as="font"[^>]*archivo-latin-wdth-normal/);
  expect(html).toMatch(/<link rel="preload" as="font"[^>]*ibm-plex-sans-latin-400/);
});

test("search and social metadata", async ({ page, request }) => {
  await page.goto("/");
  const title = await page.title();
  expect(title).toContain("John Balogun, NOIR");
  expect(title.length).toBeLessThanOrEqual(60);
  const desc = await page.locator('meta[name="description"]').getAttribute("content");
  expect(desc!.length).toBeGreaterThan(120);
  expect(desc!.length).toBeLessThanOrEqual(160);
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", SITE);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${SITE}og.png`);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  expect(await page.locator("h1").count()).toBe(1);
  expect(await page.locator("main").count()).toBe(1);
  // Headings never skip a level.
  const levels = await page.locator("h1, h2, h3").evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
  levels.forEach((l, i) => { if (i > 0) expect(l - levels[i - 1]!).toBeLessThanOrEqual(1); });
  // JSON-LD parses and describes a WebSite and a Dataset.
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld.map((x: { "@type": string }) => x["@type"])).toEqual(["WebSite", "Dataset"]);
  expect(ld[1].dateModified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  // The files the tags point at exist.
  const png = await request.get("/og.png");
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toBe("image/png");
  expect(await (await request.get("/robots.txt")).text()).toContain(`Sitemap: ${SITE}sitemap.xml`);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`<loc>${SITE}</loc>`);
  expect((await request.get("/favicon.svg")).status()).toBe(200);
});

test("the 404 page is served, not indexed, and styled", async ({ page }) => {
  await page.goto("/404.html");
  await expect(page.getByRole("heading", { name: "Not found", level: 1 })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await expect(page.getByRole("link", { name: "Informant home page" })).toHaveAttribute("href", "/");
  const font = await page.locator("h1").evaluate((e) => getComputedStyle(e).fontFamily);
  expect(font).toContain("Archivo");
});
