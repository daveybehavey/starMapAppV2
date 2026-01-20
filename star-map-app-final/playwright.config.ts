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
    timeout: 120_000,
  },
});
