// Explicit Chromium integration check, separate from the browser-free unit suite.
import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

test("browser profile measures production draw-volume changes and completed pixels", async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("./browserEntry.mjs", import.meta.url))],
    bundle: true, write: false, platform: "browser", format: "iife", globalName: "editorProfile",
    tsconfig: fileURLToPath(new URL("../../tsconfig.json", import.meta.url)),
  });
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const [full, noCaptions] = await page.evaluate(() => {
      const { runProfile, REFERENCE_SCENE } = window.editorProfile;
      // Small canvases keep this regression check cheap; the CLI uses full sizes.
      const scene = { ...REFERENCE_SCENE, previewSize: { width: 180, height: 180 }, previewExportWidth: 200, hdWidth: 240 };
      return [runProfile(scene), runProfile({ ...scene, textBoxes: [] })];
    });
    assert.equal(full.metric, "render_plus_full_readback_ms");
    for (const [name, result] of Object.entries(full.timings)) {
      assert.ok(result.first.drawCalls.arc > 0);
      assert.ok(result.warm[0].drawCalls.fillText > noCaptions.timings[name].warm[0].drawCalls.fillText, name);
      for (const sample of [result.first, ...result.warm]) {
        assert.equal(sample.readbackBytes, result.size * result.size * 4);
        assert.ok(Number.isFinite(sample.ms) && sample.ms > 0);
      }
    }
  } finally {
    await browser.close();
  }
});
