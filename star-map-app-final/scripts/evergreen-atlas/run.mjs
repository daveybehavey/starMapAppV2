/** Actual application rendering, same browser/fonts in baseline and candidate.
 * Usage: node scripts/evergreen-atlas/run.mjs /absolute/baseline/app /absolute/proof/output
 * Uses system Chromium when CHROMIUM_PATH is set. No external service access.
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const candidate = process.cwd();
const baseline = resolve(process.argv[2]);
const out = resolve(process.argv[3]);
mkdirSync(out, { recursive: true });
const fixture = JSON.parse(readFileSync("scripts/evergreen-atlas/fixture.json"));
const harness = readFileSync("scripts/evergreen-atlas/harness.txt", "utf8");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});
const fonts = [];
const families = {
  "cormorant-garamond": "Cormorant Garamond",
  montserrat: "Montserrat",
  cinzel: "Cinzel",
  "eb-garamond": "EB Garamond",
  "crimson-text": "Crimson Text",
  "libre-baskerville": "Libre Baskerville",
  lora: "Lora",
  raleway: "Raleway",
  "great-vibes": "Great Vibes",
  "playfair-display": "Playfair Display",
  "bebas-neue": "Bebas Neue",
  "dancing-script": "Dancing Script",
  parisienne: "Parisienne",
};
for (const [dir, family] of Object.entries(families))
  for (const weight of [400, 600, 700]) {
    try {
      fonts.push({
        family,
        weight,
        data: readFileSync(`src/fonts/${dir}/latin-${weight}-normal.woff2`).toString("base64"),
      });
    } catch {
      /* only bundled weights */
    }
  }
async function withTree(tree, port, action) {
  const route = join(tree, "src/app/atlas-proof-local");
  mkdirSync(route, { recursive: true });
  writeFileSync(join(route, "page.tsx"), harness);
  const log = await import("node:fs").then((fs) => fs.openSync(join(out, `server-${port}.log`), "w"));
  const server = spawn(
    process.execPath,
    [
      join(candidate, "node_modules/next/dist/bin/next"),
      "dev",
      "--webpack",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      cwd: tree,
      env: { ...process.env, NEXT_DIST_DIR: ".next-atlas-proof", NEXT_PUBLIC_DISABLE_PROMO_POPUP: "true" },
      stdio: ["ignore", log, log],
    }
  );
  const page = await browser.newPage();
  try {
    let ready = false;
    for (let i = 0; i < 240; i++) {
      try {
        await page.goto(`http://127.0.0.1:${port}/atlas-proof-local`, { timeout: 3000 });
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    assert.ok(ready, "server readiness");
    await page.waitForFunction(() => window.atlas, { timeout: 120000 });
    await page.evaluate(async (fonts) => {
      for (const f of fonts) {
        const face = new FontFace(f.family, `url(data:font/woff2;base64,${f.data})`, {
          weight: String(f.weight),
        });
        await face.load();
        document.fonts.add(face);
      }
      await document.fonts.ready;
    }, fonts);
    return await action(page);
  } finally {
    await page.close();
    server.kill("SIGTERM");
    rmSync(route, { recursive: true, force: true });
  }
}
async function render(page, spec, png) {
  const result = await page.evaluate(
    async ({ fixture, spec, png }) => {
      const a = window.atlas;
      const style = spec.style || fixture.selectedStyle;
      const preset = a.proPresets.find((p) => p.style === "evergreenAtlas");
      const oldBoxes = fixture.text.map((text, i) => ({
        id: ["title", "subtitle", "dedication"][i],
        label: "Text",
        text,
        fontFamily: "cinzel",
        color: "#d7b56c",
        size: [48, 20, 22][i],
        align: "center",
        position: { x: 0.5, y: [0.12, 0.18, 0.88][i] },
        textStyleBinding: { color: "automatic", fontFamily: "automatic", fontWeight: "automatic" },
      }));
      let boxes =
        style === "evergreenAtlas" ? preset.textBoxes.map(a.cloneTextBoxWithNormalizedBinding) : oldBoxes;
      if (spec.rows)
        boxes = boxes.map((b, i) => ({
          ...b,
          text: spec.rows === "long" ? "A".repeat(64) : "A".repeat(10),
          align: spec.align,
          position: { x: 0.5, y: [0.12, 0.18, 0.88][i] },
        }));
      const tier = spec.tier || "polished";
      boxes = a.applyTierTypographyProtected(tier, style, boxes);
      const options = {
        ...a.applyStyleDefaults(style, []).renderOptions,
        ...(spec.tier ? a.applyMapLookTier(tier, style) : {}),
        shapeLayoutVersion: 2,
        ...spec.options,
      };
      if (spec.legacy) delete options.shapeLayoutVersion;
      const recipe = a.buildRecipeFromState({
        ...fixture,
        selectedStyle: style,
        shape: spec.shape || "circle",
        aspectRatio: spec.aspect || "square",
        textBoxes: boxes,
        renderOptions: options,
      });
      const width = spec.width || 600;
      const ratio = { square: 1, "4:5": 0.8, "3:4": 0.75, "2:3": 2 / 3 }[recipe.aspectRatio];
      const height = Math.round(width / ratio);
      const canvas = document.createElement("canvas");
      a.renderStarMap({
        recipe,
        canvas,
        width,
        height,
        watermark: false,
        quality: spec.quality || "export",
        premium: !!spec.premium,
        includeText: spec.includeText !== false,
      });
      const ctx = canvas.getContext("2d");
      const raw = ctx.getImageData(0, 0, width, height).data;
      const hash = async (bytes) =>
        Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) =>
          b.toString(16).padStart(2, "0")
        ).join("");
      const pixel = await hash(raw);
      const recipeHash = await hash(new TextEncoder().encode(JSON.stringify(recipe)));
      document.getElementById("proof").replaceChildren(canvas);
      canvas.style.maxWidth = "100%";
      canvas.style.height = "auto";
      return {
        pixel,
        recipeHash,
        width,
        height,
        recipe,
        png: png ? canvas.toDataURL("image/png").split(",")[1] : undefined,
      };
    },
    { fixture, spec, png: !!png }
  );
  if (png) {
    writeFileSync(join(out, png), Buffer.from(result.png, "base64"));
    delete result.png;
  }
  return result;
}
const oldSpecs = [];
for (const style of ["navyGold", "vintageEngraving", "parchmentScroll", "midnightMinimal"])
  for (const tier of ["minimal", "polished", "custom"])
    for (const mode of ["astronomical", "enhanced", "illustrated"])
      for (const legacy of [false, true])
        for (const quality of ["preview", "og", "export"])
          for (const premium of [false, true])
            oldSpecs.push({
              style,
              tier,
              legacy,
              quality,
              premium,
              options: { visualMode: mode },
              shape: legacy ? "rectangle" : "circle",
              aspect: legacy ? "4:5" : "square",
            });
try {
  const before = await withTree(baseline, 3011, async (page) => {
    const r = [];
    for (const spec of oldSpecs) r.push(await render(page, spec));
    return r;
  });
  writeFileSync(
    join(out, "baseline.json"),
    JSON.stringify(
      before.map(({ pixel, recipeHash, width, height }, i) => ({
        spec: oldSpecs[i],
        pixel,
        recipeHash,
        width,
        height,
      })),
      null,
      2
    )
  );
  await withTree(candidate, 3012, async (page) => {
    const catalog = async (page) =>
      page.evaluate(() => {
        const a = window.atlas;
        const styles = ["navyGold", "vintageEngraving", "parchmentScroll", "midnightMinimal"];
        return {
          presets: a.proPresets.filter((p) => styles.includes(p.style)),
          defaults: styles.map((id) => a.applyStyleDefaults(id, [])),
          tiers: styles.map((id) => ["minimal", "polished", "custom"].map((t) => a.applyMapLookTier(t, id))),
        };
      });
    const oldCatalog = await withTree(baseline, 3013, catalog);
    const newCatalog = await catalog(page);
    assert.deepEqual(newCatalog, oldCatalog);
    writeFileSync(
      join(out, "old-catalog-identity.json"),
      JSON.stringify({ baseline: oldCatalog, candidate: newCatalog }, null, 2)
    );
    const identity = [];
    for (let i = 0; i < oldSpecs.length; i++) {
      const after = await render(page, oldSpecs[i]);
      identity.push({
        spec: oldSpecs[i],
        baseline: before[i].pixel,
        candidate: after.pixel,
        recipeBaseline: before[i].recipeHash,
        recipeCandidate: after.recipeHash,
      });
      assert.equal(after.pixel, before[i].pixel);
      assert.equal(after.recipeHash, before[i].recipeHash);
    }
    writeFileSync(join(out, "identity.json"), JSON.stringify(identity, null, 2));
    const matrix = [];
    for (const shape of ["rectangle", "circle", "heart", "star", "diamond"])
      for (const aspect of ["square", "3:4", "2:3", "4:5"])
        for (const legacy of [false, true])
          for (const rows of ["short", "long"])
            for (const align of ["left", "center", "right"])
              for (const frame of [false, true]) {
                const spec = {
                  shape,
                  aspect,
                  legacy,
                  rows,
                  align,
                  width: 300,
                  options: { frameEnabled: frame },
                };
                const r = await render(
                  page,
                  spec,
                  rows === "short" && align === "center" && frame
                    ? `shape-${shape}-${aspect.replace(":", "x")}-${legacy ? "legacy" : "v2"}.png`
                    : undefined
                );
                matrix.push({ spec, pixel: r.pixel, recipeHash: r.recipeHash });
              }
    writeFileSync(join(out, "shape-matrix.json"), JSON.stringify(matrix, null, 2));
    const modes = [];
    for (const tier of ["minimal", "polished", "custom"])
      for (const mode of ["astronomical", "enhanced", "illustrated"])
        for (const treatment of ["classic", "cinematic", "blueprint", "luxe"]) {
          // Editor render-mode mapping at intensity 65; visualMode is then explicitly selected.
          const spec = {
            tier,
            width: 600,
            options: {
              visualMode: mode,
              starGlow: ["cinematic", "luxe"].includes(treatment),
              constellationLines: treatment === "blueprint" ? "thick" : "thin",
              planetEmphasis: treatment === "cinematic" ? "highlighted" : "normal",
              constellationLabels: true,
              planetLabels: true,
            },
          };
          const r = await render(page, spec, `mode-${tier}-${mode}-${treatment}.png`);
          modes.push({ tier, mode, treatment, pixel: r.pixel });
        }
    for (const premium of [false, true])
      for (const stars of ["off", "subtle", "realistic"]) {
        const spec = { premium, options: { premiumStars: stars, starGlow: true } };
        const r = await render(page, spec, `stars-${premium}-${stars}.png`);
        modes.push({ spec, pixel: r.pixel });
      }
    writeFileSync(join(out, "mode-matrix.json"), JSON.stringify(modes, null, 2));
    for (const style of [
      "evergreenAtlas",
      "navyGold",
      "vintageEngraving",
      "parchmentScroll",
      "midnightMinimal",
    ])
      for (const [shape, aspect] of [
        ["circle", "square"],
        ["rectangle", "4:5"],
      ])
        await render(page, { style, shape, aspect, width: 1200 }, `${style}-${shape}.png`);
    const big = await render(page, { width: 6000 }, "evergreenAtlas-6000.png");
    writeFileSync(
      join(out, "digital-6000.json"),
      JSON.stringify({ pixel: big.pixel, width: big.width, height: big.height }, null, 2)
    );
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await render(page, { width: 1200 });
      await page.screenshot({ path: join(out, `proof-${width}.png`), fullPage: true });
    }
    const selected = await render(page, {});
    writeFileSync(join(out, "fixture-recipe.json"), JSON.stringify(selected.recipe, null, 2));
    // Pixel samples from sky-only output are compared to a no-sky background render below.
    const contrast = await page.evaluate(async (recipe) => {
      const a = window.atlas;
      const w = 1200;
      function draw(skipSkyCompute) {
        const c = document.createElement("canvas");
        a.renderStarMap({
          recipe,
          canvas: c,
          width: w,
          height: w,
          quality: "export",
          watermark: false,
          includeText: false,
          skipSkyCompute,
        });
        return c.getContext("2d").getImageData(0, 0, w, w).data;
      }
      const sky = draw(false),
        bg = draw(true);
      const lum = (c) =>
        c
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((v, x, i) => v + x * [0.2126, 0.7152, 0.0722][i], 0);
      const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
      const text = {};
      for (const color of ["#E8F0DF", "#C8D8BB"]) {
        const rgb = color.match(/[0-9a-f]{2}/gi).map((v) => parseInt(v, 16));
        let min = Infinity,
          max = 0;
        for (let i = 0; i < bg.length; i += 4) {
          if (bg[i + 3] !== 255) continue;
          const r = ratio(rgb, Array.from(bg.slice(i, i + 3)));
          min = Math.min(min, r);
          max = Math.max(max, r);
        }
        text[color] = { min, max };
      }
      const samples = [];
      for (let y = 220; y < 980; y++)
        for (let x = 220; x < 980; x++) {
          const i = (y * w + x) * 4;
          const fore = Array.from(sky.slice(i, i + 3)),
            back = Array.from(bg.slice(i, i + 3));
          const diff = fore.reduce((s, v, j) => s + Math.abs(v - back[j]), 0);
          if (diff > 5) samples.push({ x, y, foreground: fore, background: back, ratio: ratio(fore, back) });
        }
      samples.sort((a, b) => a.ratio - b.ratio);
      const bounds = new Map();
      const textCanvas = document.createElement("canvas");
      a.renderStarMap({
        recipe,
        canvas: textCanvas,
        width: w,
        height: w,
        quality: "export",
        watermark: false,
        textBounds: bounds,
      });
      const rowBacking = {};
      for (const box of recipe.textBoxes) {
        const rect = bounds.get(box.id);
        const rgb = box.color.match(/[0-9a-f]{2}/gi).map((v) => parseInt(v, 16));
        const values = [];
        for (let y = Math.max(0, Math.floor(rect.y)); y < Math.min(w, rect.y + rect.height); y++)
          for (let x = Math.max(0, Math.floor(rect.x)); x < Math.min(w, rect.x + rect.width); x++) {
            const i = (y * w + x) * 4;
            values.push(ratio(rgb, Array.from(sky.slice(i, i + 3))));
          }
        values.sort((a, b) => a - b);
        rowBacking[box.id] = {
          bounds: rect,
          min: values[0],
          p01: values[Math.floor(values.length * 0.01)],
          p05: values[Math.floor(values.length * 0.05)],
          median: values[Math.floor(values.length * 0.5)],
        };
      }
      // Observe ordinary fixed-colour star fills in the actual Canvas renderer.
      const starCanvas = document.createElement("canvas");
      const context = starCanvas.getContext("2d");
      const originalArc = context.arc.bind(context),
        originalFill = context.fill.bind(context);
      let arc;
      const starCores = [];
      context.arc = (...args) => {
        arc = args;
        return originalArc(...args);
      };
      context.fill = (...args) => {
        let sample;
        if (arc && context.fillStyle.toLowerCase() === "#eef5e8" && arc[2] < 10) {
          const t = context.getTransform();
          const x = Math.floor(t.a * arc[0] + t.c * arc[1] + t.e),
            y = Math.floor(t.b * arc[0] + t.d * arc[1] + t.f);
          if (x >= 0 && x < w && y >= 0 && y < w)
            sample = {
              x,
              y,
              radius: arc[2],
              alpha: context.globalAlpha,
              background: Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3)),
            };
        }
        const result = originalFill(...args);
        if (sample) {
          sample.foreground = Array.from(context.getImageData(sample.x, sample.y, 1, 1).data.slice(0, 3));
          sample.ratio = ratio(sample.foreground, sample.background);
          if (sample.ratio > 1) starCores.push(sample);
        }
        arc = null;
        return result;
      };
      a.renderStarMap({
        recipe,
        canvas: starCanvas,
        width: w,
        height: w,
        quality: "export",
        watermark: false,
        includeText: false,
      });
      starCores.sort((a, b) => a.alpha - b.alpha);
      const observedStars = {
        count: starCores.length,
        faint: starCores[0],
        p10: starCores[Math.floor(starCores.length * 0.1)],
        median: starCores[Math.floor(starCores.length * 0.5)],
        bright: starCores.at(-1),
      };
      return {
        rowBacking,
        observedStars,
        text,
        skyChangedPixels: samples.length,
        changedSkySamples: [
          samples[0],
          samples[Math.floor(samples.length * 0.1)],
          samples[Math.floor(samples.length * 0.5)],
          samples.at(-1),
        ],
        note: "Sky samples include antialiasing, constellation lines, Milky Way and planets; not all are isolated star cores. Text ratios use foreground fill against every opaque background pixel.",
      };
    }, selected.recipe);
    writeFileSync(join(out, "contrast.json"), JSON.stringify(contrast, null, 2));
  });
  console.log(
    `PASS: ${oldSpecs.length} old recipe/pixel identities; 480 shape cases; 36 mode/tier cases; 6000px proof`
  );
} finally {
  await browser.close();
}
