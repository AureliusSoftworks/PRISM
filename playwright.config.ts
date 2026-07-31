import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: process.env.CI ? 90_000 : 30_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { outputFolder: "playwright-report" }]]
    : "list",
  use: {
    baseURL: process.env.PRISM_E2E_BASE_URL ?? "http://127.0.0.1:18788",
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "avatar-details-webkit",
      grep: /Avatar Details/,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "marquee-webkit",
      grep: /@marquee/,
      use: { ...devices["Desktop Safari"] },
    },
    ...(process.env.PRISM_DEBATE_PERF
      ? [
          {
            name: "debate-performance-webkit",
            grep: /@debate-perf/,
            use: {
              ...devices["Desktop Safari"],
              viewport: { width: 1728, height: 1117 },
              screen: { width: 1728, height: 1117 },
              deviceScaleFactor: 2,
              reducedMotion: "no-preference" as const,
            },
          },
        ]
      : []),
  ],
  webServer: process.env.PRISM_E2E_BASE_URL
    ? undefined
    : {
        command: process.env.PRISM_DEBATE_PERF
          ? "npm run build -w apps/web && cd apps/web && npx next start -p 18788"
          : "npm run dev:web",
        url: "http://127.0.0.1:18788",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
