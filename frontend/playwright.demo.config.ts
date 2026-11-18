import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * Demo-mode regression run: the same Next app on :3100 with the browser store
 * (`.env.local`-style defaults: `NEXT_PUBLIC_DEMO_MODE` unset/true and no `api`
 * data source). No backend is required, which is the point of the check.
 */
const cwd = process.cwd();
const frontendDir = path.basename(cwd) === "frontend" ? cwd : path.resolve(cwd, "frontend");

const APP_PORT = 3100;
const APP_URL = `http://localhost:${APP_PORT}`;

export default defineConfig({
  testDir: "./e2e/demo",
  outputDir: "test-results/demo",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/demo", open: "never" }],
  ],
  use: {
    baseURL: APP_URL,
    acceptDownloads: true,
    viewport: { width: 1440, height: 950 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "node e2e/serve.mjs",
    cwd: frontendDir,
    url: APP_URL,
    env: { E2E_MODE: "demo", E2E_PORT: String(APP_PORT) },
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
