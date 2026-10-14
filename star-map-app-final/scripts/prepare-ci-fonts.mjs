import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HASH = /^[a-f0-9]{64}$/;
const MAX_BYTES = 256 * 1024;

// Fixed URLs from the coordinator's audited capture. No CSS discovery.
const SPECS = [
  ["Playfair Display", "400;600;700", "playfairdisplay/v40", "nuFiD-vYSZviVYUb_rj3ij__anPXDTLYgEM86xRbPQ nuFiD-vYSZviVYUb_rj3ij__anPXDTPYgEM86xRbPQ nuFiD-vYSZviVYUb_rj3ij__anPXDTjYgEM86xRbPQ nuFiD-vYSZviVYUb_rj3ij__anPXDTzYgEM86xQ"],
  ['Cinzel', '600;700', 'cinzel/v26', '8vIJ7ww63mVu7gt7-GT7PkRXM8Xx 8vIJ7ww63mVu7gt79mT7PkRXMw'],
  ['Great Vibes', '400', 'greatvibes/v21', 'RWmMoKWR9v4ksMfaWd_JN9XBiaQoDmlrMlY RWmMoKWR9v4ksMfaWd_JN9XFiaQoDmlr RWmMoKWR9v4ksMfaWd_JN9XIiaQoDmlrMlY RWmMoKWR9v4ksMfaWd_JN9XJiaQoDmlrMlY RWmMoKWR9v4ksMfaWd_JN9XKiaQoDmlrMlY RWmMoKWR9v4ksMfaWd_JN9XLiaQoDmlrMlY'],
  ['Cormorant Garamond', '400;600;700', 'cormorantgaramond/v21', 'co3bmX5slCNuHLi8bLeY9MK7whWMhyjYp3tKky2F7i6C co3bmX5slCNuHLi8bLeY9MK7whWMhyjYpHtKky2F7i6C co3bmX5slCNuHLi8bLeY9MK7whWMhyjYpntKky2F7i6C co3bmX5slCNuHLi8bLeY9MK7whWMhyjYqXtKky2F7g co3bmX5slCNuHLi8bLeY9MK7whWMhyjYrXtKky2F7i6C'],
  ['Montserrat', '400;600;700', 'montserrat/v31', 'JTUSjIg1_i6t8kCHKm459W1hyyTh89ZNpQ JTUSjIg1_i6t8kCHKm459WRhyyTh89ZNpQ JTUSjIg1_i6t8kCHKm459WZhyyTh89ZNpQ JTUSjIg1_i6t8kCHKm459WdhyyTh89ZNpQ JTUSjIg1_i6t8kCHKm459WlhyyTh89Y'],
  ['Libre Baskerville', '400;700', 'librebaskerville/v24', 'kmKnZrc3Hgbbcjq75U4uslyuy4kn0qNXaxMaC82U-ro kmKnZrc3Hgbbcjq75U4uslyuy4kn0qNZaxMaC82U'],
  ['EB Garamond', '400;600;700', 'ebgaramond/v33', 'SlGUmQSNjdsmc35JDF1K5GR1SDk_YAPI SlGUmQSNjdsmc35JDF1K5GR2SDk_YAPIlWk SlGUmQSNjdsmc35JDF1K5GR4SDk_YAPIlWk SlGUmQSNjdsmc35JDF1K5GR5SDk_YAPIlWk SlGUmQSNjdsmc35JDF1K5GR6SDk_YAPIlWk SlGUmQSNjdsmc35JDF1K5GR7SDk_YAPIlWk SlGUmQSNjdsmc35JDF1K5GRxSDk_YAPIlWk'],
  ['Crimson Text', '400;600;700', 'crimsontext/v19', 'wlp2gwHKFkZgtmSR3NB0oRJfYAhTIfFd3IhG wlp2gwHKFkZgtmSR3NB0oRJfYQhTIfFd3IhG wlp2gwHKFkZgtmSR3NB0oRJfbwhTIfFd3A wlppgwHKFkZgtmSR3NB0oRJX1C1GA9NQ9rJPf5Ku wlppgwHKFkZgtmSR3NB0oRJX1C1GAtNQ9rJPf5Ku wlppgwHKFkZgtmSR3NB0oRJX1C1GDNNQ9rJPfw wlppgwHKFkZgtmSR3NB0oRJXsCxGA9NQ9rJPf5Ku wlppgwHKFkZgtmSR3NB0oRJXsCxGAtNQ9rJPf5Ku wlppgwHKFkZgtmSR3NB0oRJXsCxGDNNQ9rJPfw'],
  ['Lora', '400;600;700', 'lora/v37', '0QIvMX1D_JOuM2T7I_FMl_GW8g 0QIvMX1D_JOuM3b7I_FMl_GW8g 0QIvMX1D_JOuMw77I_FMl_GW8g 0QIvMX1D_JOuMwT7I_FMl_GW8g 0QIvMX1D_JOuMwX7I_FMl_GW8g 0QIvMX1D_JOuMwf7I_FMl_GW8g 0QIvMX1D_JOuMwr7I_FMl_E'],
  ['Raleway', '400;600;700', 'raleway/v37', '1Ptug8zYS_SKggPNyC0IT4ttDfA 1Ptug8zYS_SKggPNyCAIT4ttDfCmxA 1Ptug8zYS_SKggPNyCIIT4ttDfCmxA 1Ptug8zYS_SKggPNyCMIT4ttDfCmxA 1Ptug8zYS_SKggPNyCkIT4ttDfCmxA'],
  ['Poppins', '400;600;700', 'poppins/v24', 'pxiByp8kv8JHgFVrLCz7Z11lFd2JQEl8qw pxiByp8kv8JHgFVrLCz7Z1JlFd2JQEl8qw pxiByp8kv8JHgFVrLCz7Z1xlFd2JQEk pxiByp8kv8JHgFVrLEj6Z11lFd2JQEl8qw pxiByp8kv8JHgFVrLEj6Z1JlFd2JQEl8qw pxiByp8kv8JHgFVrLEj6Z1xlFd2JQEk pxiEyp8kv8JHgFVrJJbecnFHGPezSQ pxiEyp8kv8JHgFVrJJfecnFHGPc pxiEyp8kv8JHgFVrJJnecnFHGPezSQ'],
  ['Dancing Script', '400;700', 'dancingscript/v29', 'If2RXTr6YS-zF4S-kcSWSVi_szLgiuEHiC4W If2RXTr6YS-zF4S-kcSWSVi_szLuiuEHiC4Wl-8 If2RXTr6YS-zF4S-kcSWSVi_szLviuEHiC4Wl-8'],
  ['Parisienne', '400', 'parisienne/v14', 'E21i_d3kivvAkxhLEVZpQyZwD8CtevK5qw E21i_d3kivvAkxhLEVZpQyhwD8CtevI'],
  ['Bebas Neue', '400', 'bebasneue/v16', 'JTUSjIg69CK48gW7PXoo9WdhyyTh89ZNpQ JTUSjIg69CK48gW7PXoo9WlhyyTh89Y'],
  ['Abril Fatface', '400', 'abrilfatface/v25', 'zOL64pLDlL1D99S8g8PtiKchq-dmjcDidBc zOL64pLDlL1D99S8g8PtiKchq-lmjcDidBeT5g'],
];

export const EXPECTED = Object.freeze(SPECS.map(([family, weights, directory, names]) => Object.freeze({
  family,
  weights: Object.freeze(weights.split(';')),
  url: `https://fonts.googleapis.com/css2?family=${family.replaceAll(' ', '+')}:wght@${weights}&display=swap`,
  assets: Object.freeze(names.split(' ').map(name => `https://fonts.gstatic.com/s/${directory}/${name}.woff2`)),
})));

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function parseCli(args, env) {
  requireCondition(env.CI === '1' || env.CI === 'true', 'CI=1 or CI=true is required');
  requireCondition(args.length === 0 || (args.length === 1 && args[0] === '--acquire'), 'Only --acquire is accepted');
  return { acquire: args.length === 1 };
}

export function responseFor(responses, url) {
  requireCondition(Object.hasOwn(responses, url) && typeof responses[url] === 'string' && responses[url].length > 0,
    `Missing mocked response for URL: ${url}`);
  return responses[url];
}

export function validateManifest(manifest, expected = EXPECTED) {
  requireCondition(manifest?.schemaVersion === 1, 'Unsupported font manifest schema');
  requireCondition(manifest.responses && typeof manifest.responses === 'object' && !Array.isArray(manifest.responses), 'Invalid responses');
  requireCondition(Array.isArray(manifest.provenance) && manifest.provenance.length === expected.length, 'Missing font provenance');
  requireCondition(Object.keys(manifest.responses).length === expected.length, 'Unknown or missing font response');
  const assets = new Map();
  const seen = new Set();
  for (const spec of expected) {
    const css = responseFor(manifest.responses, spec.url);
    requireCondition(css.length <= 128 * 1024, 'CSS too large');
    const records = manifest.provenance.filter(record => record.family === spec.family && record.url === spec.url);
    requireCondition(records.length === 1, `Missing or duplicate provenance: ${spec.family}`);
    const record = records[0];
    requireCondition(HASH.test(record.sourceCssSha256) && HASH.test(record.replayCssSha256), 'Invalid CSS hash');
    requireCondition(sha256(css) === record.replayCssSha256, `Bad replay CSS hash: ${spec.family}`);
    requireCondition(Array.isArray(record.assets) && record.assets.length === spec.assets.length, 'Missing or extra asset');
    const files = new Set();
    const urls = new Set();
    for (const asset of record.assets) {
      requireCondition(spec.assets.includes(asset.url) && !urls.has(asset.url), `Wrong asset URL: ${asset.url}`);
      requireCondition(HASH.test(asset.sha256) && asset.file === `${asset.sha256}.woff2`, 'Invalid hash filename');
      requireCondition(Number.isInteger(asset.bytes) && asset.bytes >= 48 && asset.bytes <= MAX_BYTES, 'Invalid asset size');
      requireCondition(!files.has(asset.file), 'Duplicate asset filename');
      urls.add(asset.url);
      files.add(asset.file);
      const previous = assets.get(asset.file);
      requireCondition(!previous || JSON.stringify(previous) === JSON.stringify(asset), 'Conflicting asset provenance');
      assets.set(asset.file, asset);
    }
    const references = [...css.matchAll(/url\(([^)]*)\)/g)].map(match => match[1]);
    requireCondition(references.length > 0 && references.every(ref => /^\/fonts\/[a-f0-9]{64}\.woff2$/.test(ref) && files.has(ref.slice(7))), 'Unknown font reference');
    requireCondition(files.size === new Set(references).size, 'Unreferenced asset');
    requireCondition(!/@import|body\s*\{|local\s*\(/i.test(css), 'Unsupported replay CSS');
    const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(match => match[1]);
    requireCondition(faces.length === references.length, 'Invalid font-face sources');
    const weights = new Set();
    for (const face of faces) {
      requireCondition(face.includes(`font-family: '${spec.family}';`) && face.includes('font-style: normal;') && face.includes('font-display: swap;'), 'Wrong font-face family or style');
      const weight = /font-weight: (\d+);/.exec(face)?.[1];
      requireCondition(spec.weights.includes(weight) && /src: url\(\/fonts\/[a-f0-9]{64}\.woff2\) format\('woff2'\);/.test(face), 'Wrong weight or source');
      weights.add(weight);
    }
    requireCondition(weights.size === spec.weights.length, `Missing weights: ${spec.family}`);
    seen.add(spec.url);
  }
  requireCondition(Object.keys(manifest.responses).every(url => seen.has(url)), 'Unknown font response');
  return [...assets.values()];
}

export function validateFont(bytes, asset) {
  requireCondition(bytes.length === asset.bytes && bytes.length <= MAX_BYTES, `Wrong font size: ${asset.file}`);
  requireCondition(sha256(bytes) === asset.sha256, `Bad font hash: ${asset.file}`);
  requireCondition(bytes.toString('ascii', 0, 4) === 'wOF2' && bytes.readUInt32BE(8) === bytes.length, `Invalid WOFF2 header: ${asset.file}`);
}

// Walk every existing component, including ancestors, without following symlinks.
async function safePath(target, { directory = false, missing = false } = {}) {
  const absolute = path.resolve(target);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  const parts = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (error.code === 'ENOENT' && missing && i === parts.length - 1) return false;
      throw error;
    }
    requireCondition(!stat.isSymbolicLink(), `Symlink forbidden: ${current}`);
    requireCondition(i < parts.length - 1 || directory ? stat.isDirectory() : stat.isFile(), `Wrong path type: ${current}`);
  }
  return true;
}

async function safeRead(target, maximum) {
  await safePath(target);
  const handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    requireCondition(stat.isFile() && stat.size <= maximum, `File too large: ${target}`);
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

async function ensureDirectory(target) {
  if (!await safePath(target, { directory: true, missing: true })) await fs.mkdir(target);
  await safePath(target, { directory: true });
}

async function atomicWrite(target, bytes) {
  await safePath(path.dirname(target), { directory: true });
  await safePath(target, { missing: true });
  const temporary = path.join(path.dirname(target), `.font-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    await safePath(target, { missing: true });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function acquireFont(asset, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchImpl(asset.url, {
      redirect: 'error', credentials: 'omit', signal: controller.signal,
    });
    requireCondition(response.ok && !response.redirected && response.url === asset.url, 'Wrong font HTTP response');
    requireCondition(response.body, 'Missing font HTTP body');
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      requireCondition(size <= asset.bytes && size <= MAX_BYTES, 'Font HTTP body too large');
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    validateFont(bytes, asset);
    return bytes;
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}

// Root/manifest/fetch injection is for bounded tests only; the CLI accepts no paths.
export async function prepare({ root = ROOT, manifest, expected = EXPECTED, acquire = false, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  parseCli(acquire ? ['--acquire'] : [], env);
  await safePath(root, { directory: true });
  const data = manifest ?? JSON.parse(await safeRead(path.join(root, 'scripts', 'fixtures', 'ci-font-manifest.json'), 2 * 1024 * 1024));
  const assets = validateManifest(data, expected);
  const cache = path.join(root, '.ci-fonts');
  await ensureDirectory(cache);
  const fonts = path.join(cache, 'fonts');
  await ensureDirectory(fonts);
  const output = path.join(cache, 'responses.json');
  await safePath(output, { missing: true });
  const pending = [];
  for (const asset of assets) {
    const target = path.join(fonts, asset.file);
    const exists = await safePath(target, { missing: true });
    if (exists) {
      validateFont(await safeRead(target, MAX_BYTES), asset);
    } else {
      requireCondition(acquire, `Missing font file: ${asset.file}; explicit --acquire required`);
      pending.push([target, await acquireFont(asset, fetchImpl)]);
    }
  }
  // No existing bytes are replaced to repair corruption. Validate all first.
  for (const [target, bytes] of pending) {
    requireCondition(!await safePath(target, { missing: true }), 'Font appeared during acquisition');
    await atomicWrite(target, bytes);
  }
  for (const asset of assets) validateFont(await safeRead(path.join(fonts, asset.file), MAX_BYTES), asset);
  const responses = Object.fromEntries(Object.entries(data.responses).map(([url, css]) => [url,
    css.replace(/\/fonts\/([a-f0-9]{64}\.woff2)/g, (_, file) => path.join(fonts, file)),
  ]));
  await atomicWrite(output, `${JSON.stringify(responses, null, 2)}\n`);
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseCli(process.argv.slice(2), process.env);
    console.log(`Prepared CI fonts: ${await prepare(options)}`);
  } catch (error) {
    console.error(`CI font preparation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
