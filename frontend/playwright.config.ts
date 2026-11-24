import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * API-mode parity run: the Next app on :3000 with `NEXT_PUBLIC_DEMO_MODE=false`
 * and `NEXT_PUBLIC_DATA_SOURCE=api`, plus the Fastify backend on :4000.
 *
 * The demo run lives in `playwright.demo.config.ts`. They are separate configs
 * on purpose: `NEXT_PUBLIC_*` is inlined when the dev server starts, so one
 * config that flipped modes per project would silently test the wrong build.
 */
const cwd = process.cwd();
const frontendDir = path.basename(cwd) === "frontend" ? cwd : path.resolve(cwd, "frontend");
const repoRoot = path.resolve(frontendDir, "..");

const APP_PORT = 3000;
const APP_URL = `http://localhost:${APP_PORT}`;
const BACKEND_HEALTH_URL = "http://localhost:4000/health";

export default defineConfig({
  testDir: "./e2e/api",
  outputDir: "test-results/api",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/api", open: "never" }],
  ],
  use: {
    baseURL: APP_URL,
    acceptDownloads: true,
    viewport: { width: 1440, height: 950 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      // `start` (no --watch) on purpose: the suite never edits backend source,
      // and `tsx watch` parented a detached child that survived a failed boot.
      command: "npm run start --workspace @lumina/backend",
      cwd: repoRoot,
      url: BACKEND_HEALTH_URL,
      // The suite is a high-volume API client: the default 300/min limit rejects
      // later specs with 429 on `/health`. `scripts/smoke.ts` raises it the same way.
      // Mail guards: these values win over the backend env file (dotenv never
      // overrides variables that are already set), so the suite can never send
      // real mail. Invite links come back in admin responses in log mode.
      env: {
        RATE_LIMIT_MAX: "100000",
        AUTH_RATE_LIMIT_MAX: "100000",
        NODE_ENV: "development",
        MAIL_MAILER: "log",
        INVITE_RESEND_COOLDOWN_SECONDS: "0",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "node e2e/serve.mjs",
      cwd: frontendDir,
      url: APP_URL,
      env: { E2E_MODE: "api", E2E_PORT: String(APP_PORT) },
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
});
