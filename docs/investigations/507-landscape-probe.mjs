// Offline investigation, not application code. Run from repository root.
// Uses committed fonts, real layout helpers, and a local browser; no service calls.
import fs from "node:fs";
import { register } from "node:module";
import { fileURLToPath } from "node:url";
register("../../star-map-app-final/scripts/unit/tsAliasLoader.mjs", import.meta.url);
const app = new URL("../../star-map-app-final/", import.meta.url);
const { chromium } = await import(new URL("node_modules/playwright/index.mjs", app));
const { resolveTextLineLayout, resolveDefaultTextBoxRows } = await import(new URL("src/lib/textFit.ts", app));
const { resolveShapeMaskFootprint, resolveShapeClipTransform } = await import(new URL("src/lib/shapeLayout.ts", app));
const { resolveShapeTextProfile } = await import(new URL("src/lib/shapeTextProfile.ts", app));
const { aspectRatioToNumber } = await import(new URL("src/lib/aspectRatio.ts", app));
const fontsRoot = new URL("src/fonts/", app);
const fonts = fs.readdirSync(fontsRoot).filter(name => fs.statSync(new URL(`${name}/`, fontsRoot)).isDirectory()).map(name => {
  const dir = new URL(`${name}/`, fontsRoot);
  const files = fs.readdirSync(dir);
  const file = files.includes("latin-600-normal.woff2") ? "latin-600-normal.woff2" : "latin-400-normal.woff2";
  return { name, weight: file.includes("600") ? "600" : "400", data: fs.readFileSync(new URL(file, dir)).toString("base64") };
});
const browser = await chromium.launch(process.env.ASTRA_BROWSER_PATH ? { executablePath: process.env.ASTRA_BROWSER_PATH } : {});
try {
  const page = await browser.newPage();
  const metrics = await page.evaluate(async fonts => {
    const ctx = document.createElement("canvas").getContext("2d");
    const output = [];
    for (const [index, font] of fonts.entries()) {
      const name = `probe${index}`;
      const face = await new FontFace(name, `url(data:font/woff2;base64,${font.data})`, { weight: font.weight }).load();
      document.fonts.add(face);
      for (const size of [10, 64]) {
        ctx.font = `600 ${size}px ${name}`;
        for (const [sample, text] of Object.entries({ wide: "W".repeat(240), prose: "Together under the stars, our story begins. ".repeat(6).slice(0, 240) })) {
          output.push({ font: font.name, size, sample, length: text.length, measuredWidthPx: ctx.measureText(text).width });
        }
      }
    }
    return output;
  }, fonts);
  const groups = {};
  const examples = [];
  let total = 0;
  for (const height of [1200, 900, 800]) {
    for (const version of [1, 2]) {
      const footprint = resolveShapeMaskFootprint(1200, height, version);
      for (const shape of ["rectangle", "circle", "heart", "star", "diamond", "birthdaycake"]) {
        const rows = resolveDefaultTextBoxRows(shape, footprint, height);
        const profile = resolveShapeTextProfile(shape);
        for (const metric of metrics) {
          const key = `${height}/${version}/${shape}/${metric.size}`;
          const group = groups[key] ??= { cases: 0, overflow: 0, floor: 0, minScale: 1, maxWidth: 0 };
          for (const [row, y] of Object.entries(rows)) {
            for (const align of ["left", "center", "right"]) {
              const layout = resolveTextLineLayout({ shape, frameEnabled: true, shapeMaskFootprint: footprint, shapeTextProfile: profile,
                position: { x: 0.5, y }, defaultX: 0.5, defaultY: y, align,
                measuredWidthPx: metric.measuredWidthPx, baseFontSizePx: metric.size, width: 1200, height });
              group.cases++; total++;
              if (layout.overflow) group.overflow++;
              if (layout.fitScale === 0.5) group.floor++;
              group.minScale = Math.min(group.minScale, layout.fitScale);
              group.maxWidth = Math.max(group.maxWidth, layout.textWidthPx);
              if (height === 800 && version === 2 && metric.font === "cinzel" && metric.sample === "wide" && row === "title" && align === "center") {
                examples.push({ shape, ...metric, ...layout });
              }
            }
          }
        }
      }
    }
  }
  const output = {
    node: process.version, browser: browser.version(), source: "main 0343e2d9", fonts: fonts.map(f => f.name), total,
    unknownAspectResult: aspectRatioToNumber("3:2"),
    transforms: [1200,900,800].flatMap(height => [1,2].map(version => ({width:1200,height,version,
      transform:resolveShapeClipTransform([0,0,100,100],1200,height,version),footprint:resolveShapeMaskFootprint(1200,height,version)}))),
    groups, examples,
  };
  const target = new URL("507-landscape-results.json", import.meta.url);
  fs.writeFileSync(target, JSON.stringify(output, null, 2) + "\n");
  console.log(JSON.stringify({ total, fonts:fonts.length, browser:output.browser, output:fileURLToPath(target) }));
} finally { await browser.close(); }
