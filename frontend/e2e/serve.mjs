/**
 * Starts `next dev` for one parity-suite mode with the mode env injected.
 *
 * npm scripts run under cmd.exe on Windows, so `VAR=value next dev` is not
 * portable. Playwright's `webServer.env` reaches this process and is forwarded
 * to Next, which inlines `NEXT_PUBLIC_*` at server start.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mode = process.env.E2E_MODE === "demo" ? "demo" : "api";
const port = process.env.E2E_PORT ?? (mode === "demo" ? "3100" : "3000");

const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_DEMO_MODE: mode === "demo" ? "true" : "false",
  NEXT_PUBLIC_DATA_SOURCE: mode === "demo" ? "local" : "api",
  NEXT_PUBLIC_API_URL:
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1",
};

const nextCandidates = [
  path.join(frontendDir, "node_modules", "next", "dist", "bin", "next"),
  path.join(frontendDir, "..", "node_modules", "next", "dist", "bin", "next"),
];
const nextBin = nextCandidates.find((candidate) => existsSync(candidate));
if (!nextBin) {
  console.error("[e2e] Could not find next/dist/bin/next. Run `npm install` first.");
  process.exit(1);
}

console.log(`[e2e] starting ${mode} mode on http://localhost:${port}`);
const child = spawn(process.execPath, [nextBin, "dev", "-p", String(port)], {
  cwd: frontendDir,
  env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code) => process.exit(code ?? 0));
