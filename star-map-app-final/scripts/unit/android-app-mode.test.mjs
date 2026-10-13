import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("assetlinks.json delegates to the Play package with the upload key", () => {
  const links = JSON.parse(read("public/.well-known/assetlinks.json"));
  const target = links[0].target;
  assert.equal(target.namespace, "android_app");
  assert.equal(target.package_name, "app.starmapco.com");
  assert.ok(target.sha256_cert_fingerprints.every((fp) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fp)));
  assert.deepEqual(links[0].relation, ["delegate_permission/common.handle_all_urls"]);
});

test("web manifest is valid and has a maskable 512 icon", () => {
  const m = JSON.parse(read("public/site.webmanifest"));
  assert.equal(m.short_name, "StarMapCo");
  assert.ok(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(root, "public", i.src)));
});

test("checkout API enforces app mode on GET and POST", () => {
  const src = read("src/app/api/checkout/route.ts");
  assert.equal((src.match(/isAndroidAppModeRequest\(req\)/g) || []).length, 2);
  assert.match(src, /android_app_digital_unavailable/);
});

test("app-mode policy: only physical orders, never a digital add-on", () => {
  const src = read("src/lib/androidAppMode.ts");
  assert.match(src, /const physical = input\.orderType === "print" \|\| input\.hasMerch;/);
  assert.match(src, /includeDigitalAddOn: false/);
  const cookieLine = src.match(/document\.cookie="[^"]*"/)[0];
  assert.doesNotMatch(cookieLine, /max-age|expires/i);
});

test("layout boots the session flag and links the manifest", () => {
  const src = read("src/app/layout.tsx");
  assert.match(src, /ANDROID_APP_MODE_BOOTSTRAP/);
  assert.match(src, /manifest: "\/site\.webmanifest"/);
});
