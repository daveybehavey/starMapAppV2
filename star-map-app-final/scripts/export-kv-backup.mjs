/** Read-only KV export. Run from app root: node scripts/export-kv-backup.mjs
 * Requires existing CLOUDFLARE_API_KEY / CLOUDFLARE_EMAIL secret pattern.
 * Contains sensitive records: never print, commit, or publish snapshot contents.
 */
import { createHash } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Broad stripe prefix preserves settlement/revocation/index records as well as grants.
// map: keeps render recipes (TTL preserved). gift-cert: keeps redemption records.
// Deliberately excluded: account: (ephemeral credentials) and checkout_timing: (analytics).
export const KEYSPACES = Object.freeze([
  'stripe:', 'claim:', 'entitlement:', 'print:order:', 'map:', 'gift-cert:',
]);
const ACCOUNT = 'c5699cbcedce27a6ad755bdeb815f6de';
const NAMESPACE = 'cdef6c5fa5cc4e52bfe105aa1ba37713';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const invalid = () => { throw new Error('Invalid KV response'); };

export function parseListPage(body, prefix) {
  if (body?.success !== true || !Array.isArray(body.result)) invalid();
  const cursor = body.result_info?.cursor;
  if (typeof cursor !== 'string') invalid();
  for (const key of body.result) {
    if (typeof key?.name !== 'string' || !key.name.startsWith(prefix) ||
        (key.expiration !== undefined && (!Number.isSafeInteger(key.expiration) || key.expiration <= 0)) ||
        (key.metadata !== undefined && key.metadata !== null &&
         (typeof key.metadata !== 'object' || Array.isArray(key.metadata)))) invalid();
  }
  return { keys: body.result, cursor };
}

export function createReader({ apiKey, email, fetchImpl = fetch }) {
  if (!apiKey || !email) throw new Error('Cloudflare credentials required');
  const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/storage/kv/namespaces/${NAMESPACE}`;
  return async (suffix, json) => {
    // No arbitrary URLs, redirects, write methods, or raw provider errors.
    try {
      const response = await fetchImpl(`${base}${suffix}`, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { 'X-Auth-Key': apiKey, 'X-Auth-Email': email },
      });
      if (!response.ok) throw new Error();
      return json ? await response.json() : Buffer.from(await response.arrayBuffer());
    } catch { throw new Error('KV read failed'); }
  };
}

export async function exportSnapshot({ read, directory, now = () => new Date() }) {
  const startedAt = now().toISOString();
  const stamp = startedAt.replace(/[:.]/g, '-');
  const destination = resolve(directory, `kv-${stamp}`);
  const staging = `${destination}.partial`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await mkdir(staging, { mode: 0o700 }); // exclusive: never overwrite a snapshot
  let file;
  try {
    file = await open(resolve(staging, 'records.jsonl'), 'wx', 0o600);
    const digest = createHash('sha256');
    const counts = Object.fromEntries(KEYSPACES.map(p => [p, 0]));
    let bytes = 0;
    for (const prefix of KEYSPACES) {
      let cursor = '';
      const cursors = new Set();
      const seen = new Set();
      do {
        const query = new URLSearchParams({ prefix, limit: '1000' });
        if (cursor) query.set('cursor', cursor);
        const page = parseListPage(await read(`/keys?${query}`, true), prefix);
        for (const key of page.keys) {
          if (seen.has(key.name)) throw new Error('Duplicate KV record');
          seen.add(key.name);
          const value = await read(`/values/${encodeURIComponent(key.name)}`, false);
          if (!Buffer.isBuffer(value)) invalid();
          const line = Buffer.from(JSON.stringify({
            key: key.name, valueBase64: value.toString('base64'),
            ...(key.expiration === undefined ? {} : { expiration: key.expiration }),
            ...(key.metadata === undefined ? {} : { metadata: key.metadata }),
          }) + '\n');
          await file.writeFile(line);
          digest.update(line);
          bytes += line.length;
          counts[prefix]++;
        }
        cursor = page.cursor;
        if (cursor && cursors.has(cursor)) throw new Error('Repeated KV cursor');
        cursors.add(cursor);
      } while (cursor);
    }
    await file.sync();
    await file.close();
    file = undefined;
    const manifest = {
      schemaVersion: 1, startedAt, completedAt: now().toISOString(),
      scope: 'KV only; excludes Durable Object authority state and R2 assets',
      consistency: 'Non-atomic enumeration; KV is eventually consistent; concurrent changes may be absent',
      counts, recordCount: Object.values(counts).reduce((a, b) => a + b, 0),
      snapshot: { file: 'records.jsonl', encoding: 'base64 values', bytes, sha256: digest.digest('hex') },
    };
    const manifestFile = await open(resolve(staging, 'manifest.json'), 'wx', 0o600);
    try { await manifestFile.writeFile(JSON.stringify(manifest, null, 2) + '\n'); }
    finally { await manifestFile.close(); }
    await rename(staging, destination);
    return manifest;
  } catch {
    if (file) await file.close().catch(() => {});
    await rm(staging, { recursive: true, force: true });
    throw new Error('KV export failed; no completed snapshot produced');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error();
    const read = createReader({ apiKey: process.env.CLOUDFLARE_API_KEY, email: process.env.CLOUDFLARE_EMAIL });
    const manifest = await exportSnapshot({ read, directory: resolve(dirname(fileURLToPath(import.meta.url)), '../kv-backups') });
    console.log(JSON.stringify({ recordCount: manifest.recordCount, sha256: manifest.snapshot.sha256 }));
  } catch {
    console.error('KV export failed. Check credentials, read access and connectivity; no artifact should be uploaded.');
    process.exitCode = 1;
  }
}
