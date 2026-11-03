import base from "../../playwright.config";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  ...base,
  webServer: { ...(base.webServer as { command: string }), cwd: process.cwd() },
  testDir: "../../tests",
  tsconfig: "../../tests/tsconfig.playwright.json",
  use: {
    ...base.use,
    video: "off",
    launchOptions: { executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] },
  },
});
