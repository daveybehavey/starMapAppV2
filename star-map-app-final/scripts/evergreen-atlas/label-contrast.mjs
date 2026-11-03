/** Samples actual label ink at paint time over its real Canvas backing. */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, openSync } from "node:fs";
import { resolve, join } from "node:path";
const out = resolve(process.argv[2]);
const route = "src/app/atlas-label-local";
mkdirSync(route, { recursive: true });
writeFileSync(join(route, "page.tsx"), readFileSync("scripts/evergreen-atlas/harness.txt"));
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--webpack", "-H", "127.0.0.1", "-p", "3014"],
  {
    env: { ...process.env, NEXT_DIST_DIR: ".next-atlas-labels" },
    stdio: ["ignore", openSync(join(out, "labels-server.log"), "w"), "ignore"],
  }
);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  for (let i = 0; i < 120; i++) {
    try {
      await page.goto("http://127.0.0.1:3014/atlas-label-local", { timeout: 10000 });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  await page.waitForFunction(() => window.atlas, { timeout: 120000 });
  const font = readFileSync("src/fonts/montserrat/latin-400-normal.woff2").toString("base64");
  await page.evaluate(async (data) => {
    const f = new FontFace("Montserrat", `url(data:font/woff2;base64,${data})`, { weight: "400 500" });
    await f.load();
    document.fonts.add(f);
    await document.fonts.ready;
  }, font);
  const fixture = JSON.parse(readFileSync("scripts/evergreen-atlas/fixture.json"));
  const results = await page.evaluate((fixture) => {
    const a = window.atlas,
      results = [];
    const lum = (c) =>
      c
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((v, x, i) => v + x * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const tier of ["minimal", "polished", "custom"])
      for (const mode of ["astronomical", "enhanced", "illustrated"])
        for (const treatment of ["classic", "cinematic", "blueprint", "luxe"]) {
          const recipe = a.buildRecipeFromState({
            ...fixture,
            textBoxes: [],
            renderOptions: {
              ...a.applyStyleDefaults("evergreenAtlas", []).renderOptions,
              ...a.applyMapLookTier(tier, "evergreenAtlas"),
              shapeLayoutVersion: 2,
              visualMode: mode,
              starGlow: ["cinematic", "luxe"].includes(treatment),
              constellationLines: treatment === "blueprint" ? "thick" : "thin",
              planetEmphasis: treatment === "cinematic" ? "highlighted" : "normal",
              constellationLabels: true,
              planetLabels: true,
              showPlanets: true,
            },
          });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          const original = ctx.fillText.bind(ctx),
            labels = [];
          ctx.fillText = (text, x, y, ...rest) => {
            const m = ctx.measureText(text),
              t = ctx.getTransform();
            const x0 = Math.max(0, Math.floor(t.a * (x - m.actualBoundingBoxLeft) + t.e) - 2),
              y0 = Math.max(0, Math.floor(t.d * (y - m.actualBoundingBoxAscent) + t.f) - 2);
            const w = Math.min(
                canvas.width - x0,
                Math.ceil(t.a * (m.actualBoundingBoxLeft + m.actualBoundingBoxRight)) + 4
              ),
              h = Math.min(
                canvas.height - y0,
                Math.ceil(t.d * (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent)) + 4
              );
            if (w <= 0 || h <= 0) return original(text, x, y, ...rest);
            const bg = ctx.getImageData(x0, y0, w, h).data;
            const result = original(text, x, y, ...rest);
            const ink = ctx.getImageData(x0, y0, w, h).data;
            let strongest = 1,
              count = 0;
            for (let i = 0; i < ink.length; i += 4) {
              if (ink[i] === bg[i] && ink[i + 1] === bg[i + 1] && ink[i + 2] === bg[i + 2]) continue;
              count++;
              strongest = Math.max(
                strongest,
                ratio(Array.from(ink.slice(i, i + 3)), Array.from(bg.slice(i, i + 3)))
              );
            }
            if (count)
              labels.push({
                text,
                kind: /^(MERCURY|VENUS|MARS|JUPITER|SATURN|URANUS|NEPTUNE)$/.test(text)
                  ? "planet"
                  : "constellation",
                strongestInkContrast: strongest,
                changedPixels: count,
              });
            return result;
          };
          a.renderStarMap({
            recipe,
            canvas,
            width: 1200,
            height: 1200,
            quality: "export",
            watermark: false,
            includeText: false,
          });
          const values = labels.map((l) => l.strongestInkContrast).sort((a, b) => a - b);
          results.push({
            tier,
            mode,
            treatment,
            count: labels.length,
            minimumStrongestInk: values[0],
            medianStrongestInk: values[Math.floor(values.length / 2)],
            labels,
          });
        }
    return results;
  }, fixture);
  writeFileSync(
    join(out, "label-contrast.json"),
    JSON.stringify(
      {
        method:
          "Maximum measured ink/background contrast per label at its actual Canvas fillText paint pass, including antialiasing and shadow. Not a uniform glyph contrast guarantee; later sky content may overpaint constellation labels. 1200px, bundled Montserrat, fonts.ready.",
        results,
      },
      null,
      2
    )
  );
  console.log(`Measured actual label paint contrast in ${results.length} mode/tier cases`);
} finally {
  await browser.close();
  server.kill("SIGTERM");
  rmSync(route, { recursive: true, force: true });
}
