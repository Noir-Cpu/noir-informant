// `vite preview` does not read Cloudflare's `_headers` file, so this applies the same rules to the
// preview server. That lets the Playwright suite run against the real Content-Security-Policy.
// Only the subset of the format that public/_headers uses is supported: a path line (with `*`
// as a splat) followed by indented `Name: value` lines.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";

export type Rule = { pattern: RegExp; headers: [string, string][] };

export function parseHeaders(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      const escaped = raw.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
      rules.push({ pattern: new RegExp(`^${escaped}$`), headers: [] });
    } else {
      const i = raw.indexOf(":");
      rules.at(-1)?.headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
    }
  }
  return rules;
}

export function headersFor(rules: Rule[], pathname: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rule of rules) {
    if (!rule.pattern.test(pathname)) continue;
    for (const [k, v] of rule.headers) out.set(k, out.has(k) ? `${out.get(k)}, ${v}` : v); // Cloudflare joins repeated names
  }
  return out;
}

export function previewHeaders(root: string): Plugin {
  const file = resolve(root, "public/_headers");
  return {
    name: "preview-headers",
    configurePreviewServer(server) {
      const rules = parseHeaders(readFileSync(file, "utf8"));
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "/").split("?")[0]!;
        for (const [k, v] of headersFor(rules, path)) res.setHeader(k, v);
        next();
      });
    },
  };
}
