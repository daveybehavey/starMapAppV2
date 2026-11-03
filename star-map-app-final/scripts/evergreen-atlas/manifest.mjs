/** Content hashes for reviewable proof assets, without host paths or volatile server logs. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
const out = resolve(process.argv[2]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const catalog = JSON.parse(readFileSync(join(out, "old-catalog-identity.json")));
catalog.sha256 = {
  baseline: hash(JSON.stringify(catalog.baseline)),
  candidate: hash(JSON.stringify(catalog.candidate)),
};
writeFileSync(join(out, "old-catalog-identity.json"), JSON.stringify(catalog, null, 2) + "\n");
const fontFiles = [];
for (const dir of readdirSync("src/fonts", { withFileTypes: true }).filter((e) => e.isDirectory()))
  for (const file of readdirSync(join("src/fonts", dir.name)).filter((f) => f.endsWith(".woff2")))
    fontFiles.push({
      file: `src/fonts/${dir.name}/${file}`,
      sha256: hash(readFileSync(join("src/fonts", dir.name, file))),
    });
const manifest = {
  baseline: "f420491c298c3b259f9e56973ee6a36c23f2770a",
  browser: execFileSync(process.env.CHROMIUM_PATH || "chromium", ["--version"], { encoding: "utf8" }).trim(),
  node: process.version,
  platform: process.platform,
  fonts: fontFiles,
  files: readdirSync(out)
    .filter((f) => f !== "manifest.json" && f !== "README.md" && !f.endsWith(".log"))
    .sort()
    .map((file) => ({ file, sha256: hash(readFileSync(join(out, file))) })),
};
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Hashed ${manifest.files.length} proof files and ${fontFiles.length} bundled font files`);
