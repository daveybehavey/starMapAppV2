import { defineConfig } from "@playwright/test";

const useProdServer = process.env.PW_USE_PROD === "true";
const withoutColorEnv = "env -u NO_COLOR -u FORCE_COLOR";
const webServerCommand = useProdServer
  ? `${withoutColorEnv} npm run build && ${withoutColorEnv} npm run start -- -H 127.0.0.1 -p 3004`
  : `${withoutColorEnv} npm run dev -- -H 127.0.0.1 -p 3004`;
const webServerEnv: NodeJS.ProcessEnv = { ...process.env };
delete webServerEnv.FORCE_COLOR;
delete webServerEnv.NO_COLOR;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: "http://127.0.0.1:3004",
    headless: true,
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: webServerCommand,
    url: "http://127.0.0.1:3004",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      ...webServerEnv,
      // Keep Stripe routes enabled without requiring real credentials.
      STRIPE_SECRET_KEY: "sk_test_playwright_dummy",
      STRIPE_WEBHOOK_SECRET: "whsec_playwright_dummy",
      NEXT_PUBLIC_DISABLE_PROMO_POPUP: "true",
      NEXT_DIST_DIR: ".next-playwright",
    },
  },
});
