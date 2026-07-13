import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { outputFolder: "test-results/playwright" }]] : "list",
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
      name: "marquee-webkit",
      grep: /@marquee/,
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: process.env.PRISM_E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev:web",
        url: "http://127.0.0.1:18788",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
