import { defineConfig } from "@playwright/test";

const useProdServer = process.env.PW_USE_PROD === "true";
const webServerCommand = useProdServer
  ? "npm run build && npm run start -- -H 127.0.0.1 -p 3004"
  : "npm run dev -- -H 127.0.0.1 -p 3004";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
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
      ...process.env,
      // Use in-memory KV for deterministic, fast API tests.
      KV_REST_API_URL: "",
      KV_REST_API_TOKEN: "",
      // Keep Stripe routes enabled without requiring real credentials.
      STRIPE_SECRET_KEY: "sk_test_playwright_dummy",
      STRIPE_WEBHOOK_SECRET: "whsec_playwright_dummy",
    },
  },
});
