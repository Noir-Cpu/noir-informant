import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4173", trace: "on-first-retry" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
    // The narrowest width WCAG 1.4.10 (reflow) asks for.
    { name: "narrow", use: { ...devices["Pixel 7"], viewport: { width: 320, height: 640 } } },
  ],
  webServer: {
    command: "npm run build -w @noir/web && npm run preview -w @noir/web -- --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
