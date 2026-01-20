import fs from "node:fs";
import path from "node:path";

const starsPath = path.resolve("src/lib/data/stars.json");
const bvPath = path.resolve("/tmp/hip_bv.json");

if (!fs.existsSync(starsPath)) {
  throw new Error(`Missing stars.json at ${starsPath}`);
}
if (!fs.existsSync(bvPath)) {
  throw new Error(`Missing B-V file at ${bvPath}`);
}

const stars = JSON.parse(fs.readFileSync(starsPath, "utf8"));
const bvMap = JSON.parse(fs.readFileSync(bvPath, "utf8"));

if (!Array.isArray(stars)) {
  throw new Error("stars.json is not an array");
}

let merged = 0;
for (const star of stars) {
  if (!star || typeof star !== "object") continue;
  const hip = star.hip;
  if (typeof hip !== "number") continue;
  const key = String(hip);
  const bv = bvMap[key];
  if (typeof bv === "number" && Number.isFinite(bv)) {
    star.bv = bv;
    merged += 1;
  }
}

fs.writeFileSync(starsPath, JSON.stringify(stars, null, 2) + "\n");
console.log(`Merged B-V values into ${merged} stars`);
