// Build-time site metadata: canonical URL, social tags, JSON-LD, sitemap and font preloads.
// The site URL comes from noir.json and the dates from the data the Python jobs wrote, so nothing
// here goes stale between the scheduled deploys.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToString } from "react-dom/server";
import type { HtmlTagDescriptor, IndexHtmlTransformContext, Plugin } from "vite";
import { Shell } from "./src/Shell";

export function sitePlugin(root: string): Plugin[] {
  const readJson = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8")) as Record<string, any>;
  const site = readJson("../../noir.json").liveUrl as string;
  const url = site.replace(/\/$/, "") + "/";
  const meta = readJson("public/data/meta.json");
  const modified = String(meta.generated_at).slice(0, 10);
  const through = String(meta.results_through);

  const author = { "@type": "Person", name: "John Balogun", url: "https://github.com/Noir-Cpu" };
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Informant",
      alternateName: "Informant by John Balogun, NOIR",
      url,
      inLanguage: "en-GB",
      description: "Football match forecasts published before kickoff, with an honest backtest against the bookmakers.",
      author,
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "Informant: Premier League and La Liga forecasts and backtest",
      description:
        "Win, draw and loss probabilities from an Elo model, published before kickoff in a hash-chained ledger, plus a walk-forward backtest against Bet365 odds with the margin removed.",
      url,
      creator: author,
      dateModified: modified,
      temporalCoverage: `2016-08-01/${through}`,
      keywords: ["football", "forecasting", "Premier League", "La Liga", "Elo", "ranked probability score", "calibration"],
      isBasedOn: { "@type": "Dataset", name: "football-data.co.uk match results and odds", url: "https://www.football-data.co.uk" },
      distribution: ["backtest", "live", "upcoming", "meta"].map((n) => ({
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${url}data/${n}.json`,
      })),
    },
  ];

  return [
    {
      name: "informant-site-html",
      enforce: "post", // generateBundle must see the CSS asset that Vite emits
      // Fill placeholders and the static shell. Runs in dev and build.
      transformIndexHtml: {
        order: "pre",
        handler: (html: string) => html.replaceAll("%SITE_URL%", url).replace("<!--shell-->", renderToString(<Shell />)),
      },
      generateBundle(_options, bundle) {
        // 404.html is what Cloudflare serves for unknown paths (not_found_handling = "404-page").
        const css = Object.keys(bundle).find((f) => f.endsWith(".css"));
        if (css) {
          this.emitFile({ type: "asset", fileName: "404.html", source: readFileSync(resolve(root, "not-found.html"), "utf8").replace("%CSS%", `/${css}`) });
        }
        this.emitFile({
          type: "asset",
          fileName: "sitemap.xml",
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${url}</loc><lastmod>${modified}</lastmod></url>\n</urlset>\n`,
        });
      },
    },
    {
      name: "informant-site-head",
      // Post: needs the bundle to find the hashed font files.
      transformIndexHtml: {
        order: "post",
        handler(html: string, ctx: IndexHtmlTransformContext) {
          const tags: HtmlTagDescriptor[] = [
            { tag: "script", attrs: { type: "application/ld+json" }, children: JSON.stringify(ld).replaceAll("<", "\\u003c"), injectTo: "head" },
          ];
          // The two faces used above the fold: the display face for the heading and the body face.
          const critical = [/archivo-latin-wdth-normal-.*\.woff2$/, /ibm-plex-sans-latin-400-normal-.*\.woff2$/];
          for (const name of Object.keys(ctx.bundle ?? {})) {
            if (critical.some((r) => r.test(name))) {
              tags.push({ tag: "link", attrs: { rel: "preload", as: "font", type: "font/woff2", href: `/${name}`, crossorigin: "" }, injectTo: "head-prepend" });
            }
          }
          return { html, tags };
        },
      },
    },
  ];
}
