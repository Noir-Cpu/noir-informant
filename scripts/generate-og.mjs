// Renders apps/web/public/og.png (1200x630) from the site's own fonts and colours.
// Run `npm run og` after changing the brand text; the image carries no live numbers, so it never goes stale.
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const font = (p) => pathToFileURL(resolve("node_modules", p)).href;
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: "Archivo"; src: url("${font("@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2")}"); font-weight: 100 900; font-stretch: 62% 125%; }
@font-face { font-family: "Plex Mono"; src: url("${font("@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2")}"); }
@font-face { font-family: "Plex Sans"; src: url("${font("@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2")}"); }
* { margin: 0; box-sizing: border-box; }
body { width: 1200px; height: 630px; background: #efebe2; color: #110f0d; padding: 64px 72px; display: flex; flex-direction: column; justify-content: space-between; border-top: 16px solid #d0422f; }
.meta { font: 400 24px "Plex Mono"; letter-spacing: 0.08em; text-transform: uppercase; color: #5d5750; }
h1 { font: 900 190px/0.9 "Archivo"; font-stretch: 75%; text-transform: uppercase; letter-spacing: -0.04em; }
p { font: 400 36px/1.35 "Plex Sans"; max-width: 1000px; }
.by { font: 400 26px "Plex Mono"; letter-spacing: 0.08em; text-transform: uppercase; }
</style>
<div class="meta">[ 003 ] Case / Informant</div>
<div><h1>Informant</h1><p>Football forecasts published before kickoff, hash&#8209;chained, with an honest backtest against the bookmakers.</p></div>
<div class="by">John Balogun, NOIR</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
// A file: page (not setContent) so the file: font URLs are allowed to load.
const file = join(mkdtempSync(join(tmpdir(), "og-")), "og.html");
writeFileSync(file, html);
await page.goto(pathToFileURL(file).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "apps/web/public/og.png" });
await browser.close();
console.log("wrote apps/web/public/og.png");
