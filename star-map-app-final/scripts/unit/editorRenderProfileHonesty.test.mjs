import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { measureBrowserRender } from "../editor-render-profile/measureBrowserRender.mjs";

test("browser workload bundles the production renderer, astronomy and reference scene", async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("../editor-render-profile/browserEntry.mjs", import.meta.url))],
    bundle: true, write: false, platform: "browser", format: "iife", metafile: true,
    tsconfig: fileURLToPath(new URL("../../tsconfig.json", import.meta.url)),
  });
  const inputs = Object.keys(bundle.metafile.inputs).map((p) => p.replaceAll("\\", "/"));
  for (const suffix of ["src/lib/renderSky.ts", "src/lib/astronomy.ts", "src/lib/data/stars.json", "editor-render-profile/referenceScene.mjs"]) {
    assert.ok(inputs.some((p) => p.endsWith(suffix)), suffix);
  }
  assert.match(bundle.outputFiles[0].text, /renderStarMap\(/);
  assert.doesNotMatch(bundle.outputFiles[0].text, /paintDenseSynthetic/);
});

test("browser timer includes full-canvas readback after production draw commands", () => {
  const events = [];
  let clock = 0;
  const canvas = {
    width: 3, height: 2,
    getContext: () => ({ getImageData: (...args) => {
      events.push(["readback", ...args]);
      clock += 11;
      return { data: new Uint8ClampedArray(24) };
    } }),
  };
  const result = measureBrowserRender(canvas, () => { events.push("render"); clock += 7; }, () => clock);
  assert.deepEqual(events, ["render", ["readback", 0, 0, 3, 2]]);
  assert.deepEqual(result, { ms: 18, readbackBytes: 24 });
});

test("profile keystrokes include base sky and overlay; late HD probe is labelled warm", () => {
  const out = mkdtempSync(join(tmpdir(), "render-honesty-"));
  try {
    execFileSync(process.execPath, [fileURLToPath(new URL("../editor-render-profile/profile.mjs", import.meta.url))], {
      env: { ...process.env, TZ: "UTC", PROFILE_OUTPUT_DIR: out, PROFILE_ARTIFACT_DIR: "" },
      stdio: "pipe",
    });
    const report = JSON.parse(readFileSync(join(out, "profile-results.json"), "utf8"));
    const stroke = report.triggerClasses.text_keystroke_base_plus_text;
    assert.equal(stroke.n, 12);
    assert.equal(stroke.base_ms.n, 12);
    assert.equal(stroke.text_overlay_ms.n, 12);
    assert.ok(stroke.base_draw_categories.stars_and_discs_fill_arc > 4000);
    assert.ok(stroke.base_draw_categories.constellation_line_strokes > 0);
    assert.ok(stroke.text_draw_categories.fillText_labels_and_captions >= 4);
    assert.equal(stroke.base_draw_categories.drawCalls_total, report.scenarios.preview_base_sky_only.draw_categories.drawCalls_total);
    assert.ok(report.scenarios.preview_text_layer_only);
    assert.equal(report.triggerClasses.text_keystroke_text_layer_only, undefined);
    assert.equal(report.previewVsHd.hd_astronomy_cold_ms, undefined);
    assert.ok(Number.isFinite(report.previewVsHd.hd_astronomy_post_export_warm_ms));
    assert.match(report.previewVsHd.note, /warmed by export/);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
