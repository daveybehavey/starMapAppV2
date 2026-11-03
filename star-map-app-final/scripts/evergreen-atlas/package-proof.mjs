/** Lossless proof packaging: contact sheets and an SVG containing actual rendered pixels. */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
const out = resolve(process.argv[2]);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  async function sheet(files, filename, columns, tileWidth, tileHeight) {
    const inputs = files.map((file) => ({ file, data: readFileSync(join(out, file)).toString("base64") }));
    const png = await page.evaluate(
      async ({ inputs, columns, tileWidth, tileHeight }) => {
        const c = document.createElement("canvas");
        c.width = columns * tileWidth;
        c.height = Math.ceil(inputs.length / columns) * tileHeight;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#10151c";
        ctx.fillRect(0, 0, c.width, c.height);
        for (let i = 0; i < inputs.length; i++) {
          const img = new Image();
          img.src = `data:image/png;base64,${inputs[i].data}`;
          await img.decode();
          const x = (i % columns) * tileWidth,
            y = Math.floor(i / columns) * tileHeight;
          const scale = Math.min((tileWidth - 12) / img.width, (tileHeight - 42) / img.height);
          ctx.drawImage(
            img,
            x + (tileWidth - img.width * scale) / 2,
            y + 32,
            img.width * scale,
            img.height * scale
          );
          ctx.fillStyle = "#ffffff";
          ctx.font = "11px sans-serif";
          ctx.fillText(inputs[i].file.replace(".png", ""), x + 6, y + 17, tileWidth - 12);
        }
        return c.toDataURL("image/png").split(",")[1];
      },
      { inputs, columns, tileWidth, tileHeight }
    );
    writeFileSync(join(out, filename), Buffer.from(png, "base64"));
  }
  const styles = ["evergreenAtlas", "navyGold", "vintageEngraving", "parchmentScroll", "midnightMinimal"];
  await sheet(
    ["circle", "rectangle"].flatMap((shape) => styles.map((style) => `${style}-${shape}.png`)),
    "contact-sheet.png",
    5,
    240,
    340
  );
  await sheet(
    readdirSync(out)
      .filter((f) => f.startsWith("mode-") && f.endsWith(".png"))
      .sort(),
    "mode-contact-sheet.png",
    6,
    200,
    250
  );
  const shapes = readdirSync(out)
    .filter((f) => f.startsWith("shape-") && f.endsWith(".png"))
    .sort();
  if (shapes.length) await sheet(shapes, "shape-contact-sheet.png", 8, 150, 240);
  const actual = readFileSync(join(out, "evergreenAtlas-circle.png")).toString("base64");
  writeFileSync(
    "public/presets/preset-evergreenAtlas-signature.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1200 1200"><title>Evergreen Atlas — actual Victoria fixture render</title><image width="1200" height="1200" xlink:href="data:image/png;base64,${actual}"/></svg>\n`
  );
  console.log("Packaged actual-render contact sheets and pixel-faithful SVG thumbnail");
} finally {
  await browser.close();
}
