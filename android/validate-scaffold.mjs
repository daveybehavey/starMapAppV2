import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const json = (path) => JSON.parse(read(path));
const web = json('star-map-app-final/public/site.webmanifest');
const twa = json('android/twa-manifest.template.json');
const links = json('android/assetlinks.template.json');
assert.equal(web.short_name, 'StarMapCo');
assert.equal(web.name, twa.name);
assert.equal(web.short_name, twa.launcherName);
assert.equal(web.id, '/');
assert.equal(web.scope, '/');
assert.equal(web.start_url, '/?source=pwa');
assert.equal(web.display, 'standalone');
assert.equal(twa.display, web.display);
assert.equal(twa.orientation, web.orientation);
assert.equal(twa.startUrl, '/?source=android-app');
const origin = `https://${twa.host}`;
assert.equal(origin, 'https://starmapco.com');
assert.equal(twa.fullScopeUrl, new URL(web.scope, origin).href);
assert.equal(twa.webManifestUrl, `${origin}/site.webmanifest`);
for (const key of ['themeColor', 'themeColorDark', 'navigationColor', 'navigationColorDark', 'backgroundColor']) {
  assert.equal(twa[key], '#050915');
}
assert.equal(web.theme_color, twa.themeColor);
assert.equal(web.background_color, twa.backgroundColor);
for (const icon of web.icons) {
  assert.equal(icon.type, 'image/png');
  const bytes = read(`star-map-app-final/public${icon.src}`);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
}
for (const [purpose, size, url] of [['any', '512x512', twa.iconUrl], ['maskable', '512x512', twa.maskableIconUrl]]) {
  assert.ok(web.icons.some((icon) => icon.purpose === purpose && icon.sizes === size && new URL(icon.src, origin).href === url));
}
const apple = read('star-map-app-final/public/apple-touch-icon.png');
assert.equal(apple.readUInt32BE(16), 180);
assert.equal(apple.readUInt32BE(20), 180);
const layout = read('star-map-app-final/src/app/layout.tsx').toString();
assert.match(layout, /manifest: "\/site\.webmanifest"/);
assert.match(layout, /apple: "\/apple-touch-icon\.png"/);
assert.match(layout, /themeColor: "#050915"/);
assert.match(layout, /<ServiceWorkerRegistration\s*\/>/);
assert.match(read('star-map-app-final/src/components/ServiceWorkerRegistration.tsx').toString(), /serviceWorker\.register\("\/sw\.js"\)/);
assert.equal(twa.signingKey.path, 'OWNER_REQUIRED_ABSOLUTE_UPLOAD_KEYSTORE_PATH');
assert.equal(twa.signingKey.alias, 'OWNER_REQUIRED_UPLOAD_KEY_ALIAS');
assert.deepEqual(twa.fingerprints, []);
assert.equal(links.length, 1);
assert.deepEqual(links[0].relation, ['delegate_permission/common.handle_all_urls']);
assert.equal(links[0].target.namespace, 'android_app');
assert.equal(links[0].target.package_name, twa.packageId);
assert.deepEqual(links[0].target.sha256_cert_fingerprints, ['OWNER_REQUIRED_PLAY_APP_SIGNING_CERTIFICATE_SHA256']);
assert.equal(twa.enableNotifications, false);
assert.deepEqual(twa.features, {});
assert.deepEqual(twa.additionalTrustedOrigins, []);
console.log('PASS: PWA assets/metadata and TWA template consistency; signing and live installation remain unverified.');
