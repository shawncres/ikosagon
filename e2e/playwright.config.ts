import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Loaded as CommonJS (the repo package.json is not "type": "module").
// __dirname is the e2e/ folder, so the paths below do not depend on the shell's cwd.
const root = path.resolve(__dirname, "..");
const host = process.env.E2E_HOST || "127.0.0.1";
const port = Number(process.env.E2E_PORT || 4173);
const origin = `http://${host}:${port}`;

/**
 * Offline IkoLearn browser harness.
 * webServer serves public/ (the static app). Tests mock /api/ikolearn themselves.
 * baseURL is the app at /ikolearn/, so a test opens it with page.goto("./").
 */
export default defineConfig({
  testDir: path.join(root, "e2e", "tests"),
  outputDir: path.join(root, "test-results"),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: path.join(root, "playwright-report") },
    ],
  ],
  use: {
    baseURL: `${origin}/ikolearn/`,
    timezoneId: "America/Toronto",
    locale: "en-CA",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "node e2e/serve.mjs",
    cwd: root,
    url: `${origin}/ikolearn/`,
    env: { PORT: String(port), HOST: host },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
