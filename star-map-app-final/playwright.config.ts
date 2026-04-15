import { defineConfig } from "@playwright/test";

const useProdServer = process.env.PW_USE_PROD === "true";
const webServerPort = Number.parseInt(process.env.PW_PORT ?? "3004", 10);
const webServerHost = "127.0.0.1";
const baseURL = `http://${webServerHost}:${webServerPort}`;
// Use a stable dist dir so Next doesn't keep rewriting tsconfig.json with per-port paths.
const nextDistDir = ".next-playwright";
const isWindows = process.platform === "win32";
// Unix `env -u` is unavailable on Windows cmd; rely on webServer.env to drop color vars.
const withoutColorEnv = "env -u NO_COLOR -u FORCE_COLOR";
const webServerCommand = useProdServer
  ? isWindows
    ? `npm run build && npm run start -- -H ${webServerHost} -p ${webServerPort}`
    : `${withoutColorEnv} npm run build && ${withoutColorEnv} npm run start -- -H ${webServerHost} -p ${webServerPort}`
  : isWindows
    ? `npm run dev -- -H ${webServerHost} -p ${webServerPort}`
    : `${withoutColorEnv} npm run dev -- -H ${webServerHost} -p ${webServerPort}`;
const webServerEnv: NodeJS.ProcessEnv = { ...process.env };
delete webServerEnv.FORCE_COLOR;
delete webServerEnv.NO_COLOR;

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL,
    headless: true,
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
    env: {
      ...webServerEnv,
      // Keep Stripe routes enabled without requiring real credentials.
      STRIPE_SECRET_KEY: "sk_test_playwright_dummy",
      STRIPE_WEBHOOK_SECRET: "whsec_playwright_dummy",
      NEXT_PUBLIC_DISABLE_PROMO_POPUP: "true",
      NEXT_DIST_DIR: nextDistDir,
    },
  },
});
