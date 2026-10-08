import path from "node:path";
import { defineConfig } from "@playwright/test";

const nextCli = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

const useProdServer = process.env.PW_USE_PROD === "true";
const deterministicCiFonts = ["1", "true"].includes(process.env.CI || "") &&
  process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES === path.join(process.cwd(), ".ci-fonts", "responses.json");
const webServerCommand = useProdServer
  ? `npm run build && node "${nextCli}" start -H 127.0.0.1 -p 3004`
  : `node "${nextCli}" dev${deterministicCiFonts ? " --webpack" : ""} -H 127.0.0.1 -p 3004`;

const forceNewWebServer = ["1", "true", "yes"].includes(String(process.env.PW_FORCE_NEW_SERVER || "").toLowerCase());

export default defineConfig({
  testDir: "./tests",
  /** Root `tsconfig.json` uses Next's TS plugin; Playwright transforms specs with this isolated config */
  tsconfig: "./tests/tsconfig.playwright.json",
  /** Windows / nested-repo setups: discover specs even if git-metadata tooling skips paths */
  respectGitIgnore: false,
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3004",
    headless: true,
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: webServerCommand,
    url: "http://127.0.0.1:3004",
    // Deterministic CI must use the server started with these fixtures.
    // Normal local runs retain the existing opt-in behavior.
    reuseExistingServer: !forceNewWebServer && !deterministicCiFonts,
    timeout: 300_000,
    env: {
      ...process.env,
      // Keep Stripe routes enabled without requiring real credentials.
      STRIPE_SECRET_KEY: "sk_test_playwright_dummy",
      STRIPE_WEBHOOK_SECRET: "whsec_playwright_dummy",
      NEXT_PUBLIC_DISABLE_PROMO_POPUP: "true",
      NEXT_DIST_DIR: ".next-playwright",
    },
  },
});
