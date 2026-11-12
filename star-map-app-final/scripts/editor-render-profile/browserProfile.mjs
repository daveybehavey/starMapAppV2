/** Real production renderer in Chromium; no synthetic workloads. */
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = await build({
  entryPoints: [join(here, "browserEntry.mjs")],
  bundle: true, write: false, platform: "browser", format: "iife",
  globalName: "editorProfile", tsconfig: join(here, "../../tsconfig.json"),
});
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
try {
  const page = await browser.newPage();
  await page.setContent("<!doctype html><title>Production renderer profile</title>");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const payload = await page.evaluate(() => window.editorProfile.runProfile());
  const outDir = process.env.PROFILE_OUTPUT_DIR || here;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "browser-profile-results.json"), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
} finally {
  await browser.close();
}
