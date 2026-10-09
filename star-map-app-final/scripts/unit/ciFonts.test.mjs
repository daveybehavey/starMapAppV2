import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EXPECTED, parseCli, prepare, responseFor, sha256, validateManifest } from '../prepare-ci-fonts.mjs';

const require = createRequire(import.meta.url);
const { fetchCSSFromGoogleFonts } = require('next/dist/compiled/@next/font/dist/google/fetch-css-from-google-fonts');
const { fetchFontFile } = require('next/dist/compiled/@next/font/dist/google/fetch-font-file');

function fixture() {
  // Synthetic header bytes exercise validation only; never application fixtures.
  const bytes = Buffer.alloc(64);
  bytes.write('wOF2');
  bytes.writeUInt32BE(bytes.length, 8);
  const hash = sha256(bytes);
  const cinzel = EXPECTED.find(spec => spec.family === 'Cinzel');
  const spec = { ...cinzel, assets: [cinzel.assets[0]] };
  const css = spec.weights.map(weight => `/* latin */\n@font-face {\n  font-family: '${spec.family}';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url(/fonts/${hash}.woff2) format('woff2');\n}\n`).join('');
  const asset = { url: spec.assets[0], file: `${hash}.woff2`, sha256: hash, bytes: bytes.length };
  return { bytes, asset, expected: [spec], manifest: {
    schemaVersion: 1, responses: { [spec.url]: css }, provenance: [{
      family: spec.family, url: spec.url, sourceCssSha256: sha256('synthetic source'), replayCssSha256: sha256(css), assets: [asset],
    }],
  } };
}

async function temporary(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ci-fonts-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function cached(root, f) {
  const directory = path.join(root, '.ci-fonts', 'fonts');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, f.asset.file), f.bytes);
}

const offline = () => { throw new Error('Network forbidden in test'); };

test('CLI requires explicit CI and accepts only the fixed acquisition flag', () => {
  for (const CI of [undefined, '', 'false', 'yes', 'TRUE']) assert.throws(() => parseCli([], { CI, NODE_ENV: 'test' }), /CI=/);
  assert.deepEqual(parseCli([], { CI: '1', NODE_ENV: 'production' }), { acquire: false });
  assert.deepEqual(parseCli(['--acquire'], { CI: 'true' }), { acquire: true });
  for (const args of [['--root', '/tmp'], ['--acquire', '--acquire'], ['--command']]) assert.throws(() => parseCli(args, { CI: 'true' }), /Only --acquire/);
});

test('pinned extensionless live-error URL shape reproduces the locked loader failure', () => {
  // The supplied diagnosis pins this URL shape, not the unavailable kit value.
  const url = 'https://fonts.gstatic.com/l/font?kit=...&skey=...&v=v31';
  assert.throws(() => /\.(woff|woff2|eot|ttf|otf)$/.exec(url)[1], TypeError);
  assert.equal(/\.(woff|woff2|eot|ttf|otf)$/.exec(EXPECTED[3].assets[0])[1], 'woff2');
});

test('manifest rejects unknown/missing responses, bad hashes, URLs and references', () => {
  const f = fixture();
  assert.equal(validateManifest(f.manifest, f.expected).length, 1);
  const mutations = [
    m => { delete m.responses[f.expected[0].url]; },
    m => { m.responses['https://fonts.googleapis.com/css2?family=Inter'] = 'unknown'; },
    m => { m.provenance[0].replayCssSha256 = '0'.repeat(64); },
    m => { m.provenance[0].assets[0].sha256 = '0'.repeat(64); },
    m => { m.provenance[0].assets[0].url = 'https://fonts.gstatic.com/s/cinzel/v26/unknown.woff2'; },
    m => { m.provenance[0].assets[0].url += '?redirect=1'; },
    m => { m.provenance[0].assets[0].file = '../escape.woff2'; },
    m => { m.provenance[0].assets[0].bytes = 300000; },
    m => { m.responses[f.expected[0].url] = m.responses[f.expected[0].url].replaceAll('/fonts/', 'https://example.com/'); m.provenance[0].replayCssSha256 = sha256(m.responses[f.expected[0].url]); },
  ];
  for (const mutate of mutations) {
    const manifest = structuredClone(f.manifest);
    mutate(manifest);
    assert.throws(() => validateManifest(manifest, f.expected));
  }
  assert.throws(() => responseFor(f.manifest.responses, 'unknown'), /Missing mocked response/);
});

test('missing files fail offline and preserve previous output', async t => {
  const root = await temporary(t);
  const f = fixture();
  await fs.mkdir(path.join(root, '.ci-fonts'));
  const output = path.join(root, '.ci-fonts', 'responses.json');
  await fs.writeFile(output, 'previous');
  await assert.rejects(prepare({ root, ...f, env: { CI: '1' }, fetchImpl: offline }), /Missing font file/);
  assert.equal(await fs.readFile(output, 'utf8'), 'previous');
});

test('corrupted cache is never repaired or overwritten even with acquisition enabled', async t => {
  const root = await temporary(t);
  const f = fixture();
  await cached(root, f);
  const file = path.join(root, '.ci-fonts', 'fonts', f.asset.file);
  const corrupted = Buffer.from(f.bytes);
  corrupted[63] = 1;
  await fs.writeFile(file, corrupted);
  await fs.writeFile(path.join(root, '.ci-fonts', 'responses.json'), 'previous');
  await assert.rejects(prepare({ root, ...f, acquire: true, env: { CI: 'true' }, fetchImpl: offline }), /Bad font hash/);
  assert.deepEqual(await fs.readFile(file), corrupted);
  assert.equal(await fs.readFile(path.join(root, '.ci-fonts', 'responses.json'), 'utf8'), 'previous');
});

test('explicit acquisition uses only pinned assets and verifies bytes before publishing', async t => {
  const root = await temporary(t);
  const f = fixture();
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    assert.equal(url, f.asset.url);
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, redirected: false, url, body: (async function* () { yield f.bytes; })() };
  };
  await prepare({ root, ...f, acquire: true, env: { CI: 'true' }, fetchImpl });
  assert.equal(calls, 1);
  await prepare({ root, ...f, env: { CI: '1' }, fetchImpl: offline });
  for (const mode of ['hash', 'url', 'redirect', 'size']) {
    const otherRoot = await temporary(t);
    await assert.rejects(prepare({ root: otherRoot, ...f, acquire: true, env: { CI: '1' }, fetchImpl: async url => ({
      ok: true, redirected: mode === 'redirect', url: mode === 'url' ? 'https://example.com/font' : url,
      body: (async function* () { yield mode === 'size' ? Buffer.alloc(65) : mode === 'hash' ? Buffer.alloc(64) : f.bytes; })(),
    }) }));
    await assert.rejects(fs.access(path.join(otherRoot, '.ci-fonts', 'responses.json')));
  }
});

test('cache and font symlinks cannot escape the fixed root', async t => {
  const f = fixture();
  const outside = await temporary(t);
  const root = await temporary(t);
  await fs.symlink(outside, path.join(root, '.ci-fonts'), 'dir');
  await assert.rejects(prepare({ root, ...f, env: { CI: '1' }, fetchImpl: offline }), /Symlink forbidden/);
  const other = await temporary(t);
  await fs.mkdir(path.join(other, '.ci-fonts', 'fonts'), { recursive: true });
  const external = path.join(outside, 'font.woff2');
  await fs.writeFile(external, f.bytes);
  await fs.symlink(external, path.join(other, '.ci-fonts', 'fonts', f.asset.file));
  await assert.rejects(prepare({ root: other, ...f, env: { CI: '1' }, fetchImpl: offline }), /Symlink forbidden/);
  assert.deepEqual(await fs.readFile(external), f.bytes);
});

test('actual Next mock contract reads local bytes and explicitly rejects unknown responses offline', async t => {
  const root = await temporary(t);
  const f = fixture();
  await cached(root, f);
  const output = await prepare({ root, ...f, env: { CI: 'true' }, fetchImpl: offline });
  const previous = process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES;
  process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = output;
  try {
    const css = await fetchCSSFromGoogleFonts(f.expected[0].url, 'Cinzel', false);
    const local = /src: url\(([^)]+)\)/.exec(css)[1];
    assert.equal(local, path.join(root, '.ci-fonts', 'fonts', f.asset.file));
    assert.equal(/\.(woff|woff2|eot|ttf|otf)$/.exec(local)[1], 'woff2');
    assert.deepEqual(await fetchFontFile(local, false), f.bytes);
    await assert.rejects(fetchCSSFromGoogleFonts('https://fonts.googleapis.com/css2?family=Unknown', 'Unknown', false), /Missing mocked response for URL/);
    await fs.unlink(local);
    await assert.rejects(fetchFontFile(local, false), /ENOENT/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES;
    else process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = previous;
  }
});

test('coordinator manifest covers all fifteen application font families and weights', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../fixtures/ci-font-manifest.json', import.meta.url), 'utf8'));
  assert.equal(EXPECTED.length, 15);
  assert.ok(validateManifest(manifest).length > 0);
  assert.ok(EXPECTED.some(spec => spec.family === 'Playfair Display'));
  assert.ok(!EXPECTED.some(spec => spec.family === 'Inter'));
});
