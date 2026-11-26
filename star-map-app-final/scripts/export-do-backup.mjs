/** Read-only Durable Object census + EntitlementAuthority export.
 * Run from app root after a KV snapshot (same backup run):
 *   node scripts/export-do-backup.mjs [kv-snapshot-dir]
 * Requires CLOUDFLARE_API_KEY / CLOUDFLARE_EMAIL (Workers API GET only) and
 * BACKUP_OPS_BASE_URL + PRINT_ADMIN_TOKEN for the entitlement export endpoint.
 * Snapshot contents are sensitive: never print, commit, or publish state payloads.
 */
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ACCOUNT = 'c5699cbcedce27a6ad755bdeb815f6de';
export const WORKER_SCRIPT = 'star-map-final';
export const ENTITLEMENT_AUTHORITY_CLASS = 'EntitlementAuthorityDO';
export const STRIPE_SESSION_PREFIX = 'stripe:session:';
export const ENTITLEMENT_PROJECTION_PREFIX = 'entitlement:projection:';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const invalid = () => { throw new Error('Invalid Durable Object API response'); };

export function parseNamespacePage(body) {
  if (body?.success !== true || !Array.isArray(body.result)) invalid();
  for (const ns of body.result) {
    if (typeof ns?.id !== 'string' || !ns.id ||
        (ns.class !== undefined && typeof ns.class !== 'string') ||
        (ns.name !== undefined && typeof ns.name !== 'string') ||
        (ns.script !== undefined && typeof ns.script !== 'string')) invalid();
  }
  const info = body.result_info ?? {};
  const page = info.page;
  const totalPages = info.total_pages;
  return {
    namespaces: body.result,
    page: typeof page === 'number' ? page : 1,
    totalPages: typeof totalPages === 'number' ? totalPages : 1,
  };
}

export function parseObjectsPage(body) {
  if (body?.success !== true || !Array.isArray(body.result)) invalid();
  for (const obj of body.result) {
    if (typeof obj?.id !== 'string' || !obj.id ||
        (obj.hasStoredData !== undefined && typeof obj.hasStoredData !== 'boolean') ||
        (obj.name !== undefined && typeof obj.name !== 'string')) invalid();
  }
  const cursor = body.result_info?.cursor;
  if (cursor !== undefined && cursor !== null && typeof cursor !== 'string') invalid();
  return { objects: body.result, cursor: typeof cursor === 'string' ? cursor : '' };
}

export function createWorkersReader({ apiKey, email, fetchImpl = fetch }) {
  if (!apiKey || !email) throw new Error('Cloudflare credentials required');
  const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/durable_objects`;
  return async (suffix, json = true) => {
    try {
      const response = await fetchImpl(`${base}${suffix}`, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { 'X-Auth-Key': apiKey, 'X-Auth-Email': email },
      });
      if (!response.ok) throw new Error();
      return json ? await response.json() : Buffer.from(await response.arrayBuffer());
    } catch { throw new Error('Durable Object API read failed'); }
  };
}

export function deriveSessionIdsFromKvKeys(keys) {
  const ids = new Set();
  for (const key of keys) {
    if (typeof key !== 'string' || !key.startsWith(STRIPE_SESSION_PREFIX)) continue;
    const sessionId = key.slice(STRIPE_SESSION_PREFIX.length).trim();
    if (sessionId) ids.add(sessionId);
  }
  return [...ids].sort();
}

export async function loadKvSnapshotKeysAndProjections(kvSnapshotDir) {
  const recordsPath = resolve(kvSnapshotDir, 'records.jsonl');
  const raw = await readFile(recordsPath);
  if (raw.length === 0) return { keys: [], projections: new Map(), recordCount: 0 };
  const keys = [];
  const projections = new Map();
  for (const line of raw.toString('utf8').split('\n')) {
    if (!line) continue;
    const record = JSON.parse(line);
    if (typeof record?.key !== 'string') throw new Error('Invalid KV snapshot record');
    keys.push(record.key);
    if (record.key.startsWith(ENTITLEMENT_PROJECTION_PREFIX)) {
      const sessionId = record.key.slice(ENTITLEMENT_PROJECTION_PREFIX.length);
      const value = Buffer.from(record.valueBase64, 'base64').toString('utf8');
      const projection = JSON.parse(value);
      if (projection && typeof projection.includedThroughSeq === 'number') {
        projections.set(sessionId, { includedThroughSeq: projection.includedThroughSeq });
      }
    }
  }
  return { keys, projections, recordCount: keys.length };
}

export function reconcileCensus({ namespaces, derivedSessionIds }) {
  const derived = new Set(derivedSessionIds);
  const findings = [];
  const summary = namespaces.map((ns) => {
    const instanceIds = ns.instances.map((i) => i.id);
    const instanceNames = ns.instances
      .map((i) => (typeof i.name === 'string' && i.name ? i.name : i.id))
      .sort();
    const named = ns.instances
      .map((i) => (typeof i.name === 'string' ? i.name.trim() : ''))
      .filter(Boolean);
    // When the API returns human names (or fixtures supply them), census-only
    // names are findings. Hex-only census rows are reconciled after dump via
    // state.sessionId (see collectCensusOnlyFindings).
    const censusOnlyNames = named.filter((name) => !derived.has(name)).sort();
    if (ns.className === ENTITLEMENT_AUTHORITY_CLASS && censusOnlyNames.length > 0) {
      findings.push({
        type: 'census_only_instances',
        className: ns.className,
        count: censusOnlyNames.length,
        instanceNames: censusOnlyNames,
        note: 'Census ⊋ derived is expected for at least one class; recorded as a finding, not an error',
      });
    }
    return {
      id: ns.id,
      className: ns.className,
      bindingName: ns.bindingName,
      script: ns.script,
      instanceCount: instanceIds.length,
      instanceIds: instanceIds.slice().sort(),
      instanceNames,
    };
  });
  return { namespaces: summary, findings, derivedSessionIdCount: derived.size };
}

export function collectCensusOnlyFindings({ className, dumpedRows, derivedSessionIds }) {
  const derived = new Set(derivedSessionIds);
  const censusOnly = [];
  for (const row of dumpedRows) {
    const sessionId = typeof row.sessionId === 'string' ? row.sessionId.trim() : '';
    if (!sessionId || !derived.has(sessionId)) {
      censusOnly.push(row.instanceId);
    }
  }
  if (censusOnly.length === 0) return null;
  return {
    type: 'census_only_instances',
    className,
    count: censusOnly.length,
    instanceIds: censusOnly.slice().sort(),
    note: 'Census ⊋ derived is expected for at least one class; recorded as a finding, not an error',
  };
}

export function crossCheckWatermarks({ dumpedRows, projections }) {
  const findings = [];
  for (const row of dumpedRows) {
    const sessionId = typeof row.sessionId === 'string' ? row.sessionId.trim() : '';
    if (!sessionId || !projections.has(sessionId)) continue;
    const projection = projections.get(sessionId);
    const journalHead = Number(row.state?.journalHead ?? 0);
    const includedThroughSeq = Number(projection.includedThroughSeq);
    if (!Number.isFinite(journalHead) || !Number.isFinite(includedThroughSeq)) continue;
    if (includedThroughSeq > journalHead) {
      findings.push({
        type: 'projection_ahead_of_authority',
        className: ENTITLEMENT_AUTHORITY_CLASS,
        instanceId: row.instanceId,
        includedThroughSeq,
        journalHead,
        note: 'KV projection includedThroughSeq is ahead of captured DO journalHead (authority advanced mid-sweep)',
      });
    }
  }
  return findings;
}

export async function collectDurableObjectCensus({ read, scriptName = WORKER_SCRIPT }) {
  const namespaces = [];
  let page = 1;
  let totalPages = 1;
  do {
    const listed = parseNamespacePage(await read(`/namespaces?per_page=100&page=${page}`, true));
    totalPages = listed.totalPages;
    for (const ns of listed.namespaces) {
      if (ns.script && ns.script !== scriptName) continue;
      const className = ns.class || ns.name || 'unknown';
      const instances = [];
      let cursor = '';
      const seenCursors = new Set();
      do {
        const query = new URLSearchParams({ limit: '1000' });
        if (cursor) query.set('cursor', cursor);
        const pageBody = parseObjectsPage(
          await read(`/namespaces/${encodeURIComponent(ns.id)}/objects?${query}`, true),
        );
        for (const obj of pageBody.objects) instances.push(obj);
        cursor = pageBody.cursor;
        if (cursor && seenCursors.has(cursor)) throw new Error('Repeated Durable Object cursor');
        if (cursor) seenCursors.add(cursor);
      } while (cursor);
      namespaces.push({
        id: ns.id,
        className,
        bindingName: ns.name || null,
        script: ns.script || scriptName,
        instances,
      });
    }
    page += 1;
  } while (page <= totalPages);
  namespaces.sort((a, b) => a.className.localeCompare(b.className));
  return namespaces;
}

export function createExportStateClient({ baseUrl, adminToken, fetchImpl = fetch }) {
  if (!baseUrl || !adminToken) throw new Error('Ops export credentials required');
  const root = baseUrl.replace(/\/+$/, '');
  return async ({ instanceId, sessionId }) => {
    const query = new URLSearchParams();
    if (instanceId) query.set('instanceId', instanceId);
    if (sessionId) query.set('sessionId', sessionId);
    try {
      const response = await fetchImpl(`${root}/api/ops/entitlement-authority/export?${query}`, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'x-print-admin-token': adminToken,
        },
      });
      if (response.status === 401 || response.status === 403) throw new Error('Unauthorized');
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (body?.ok !== true) throw new Error();
      return body;
    } catch (error) {
      if (error instanceof Error && error.message === 'Unauthorized') throw error;
      throw new Error('Entitlement authority export failed');
    }
  };
}

export async function dumpEntitlementAuthority({
  instances,
  exportState,
  now = () => new Date(),
}) {
  const rows = [];
  for (const instance of instances) {
    const capturedAt = now().toISOString();
    const body = await exportState({
      instanceId: instance.id,
      sessionId: typeof instance.name === 'string' ? instance.name : undefined,
    });
    const state = body.state ?? null;
    const sessionId = (typeof body.sessionId === 'string' && body.sessionId)
      || (typeof state?.sessionId === 'string' ? state.sessionId : null);
    rows.push({
      instanceId: body.instanceId || instance.id,
      sessionId,
      capturedAt,
      state,
    });
  }
  return rows;
}

export async function exportDoSnapshot({
  read,
  exportState,
  kvSnapshotDir,
  directory,
  now = () => new Date(),
  scriptName = WORKER_SCRIPT,
}) {
  const startedAt = now().toISOString();
  const stamp = startedAt.replace(/[:.]/g, '-');
  const destination = resolve(directory, `do-${stamp}`);
  const staging = `${destination}.partial`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await mkdir(staging, { mode: 0o700 });
  let file;
  try {
    const { keys, projections, recordCount } = await loadKvSnapshotKeysAndProjections(kvSnapshotDir);
    const derivedSessionIds = deriveSessionIdsFromKvKeys(keys);
    const namespaces = await collectDurableObjectCensus({ read, scriptName });
    const census = reconcileCensus({ namespaces, derivedSessionIds });

    const eaNamespace = namespaces.find((ns) => ns.className === ENTITLEMENT_AUTHORITY_CLASS);
    const eaInstances = eaNamespace?.instances ?? [];
    const dumpedRows = await dumpEntitlementAuthority({
      instances: eaInstances,
      exportState,
      now,
    });

    file = await open(resolve(staging, 'entitlement-authority.jsonl'), 'wx', 0o600);
    const digest = createHash('sha256');
    let bytes = 0;
    for (const row of dumpedRows) {
      const line = Buffer.from(JSON.stringify(row) + '\n');
      await file.writeFile(line);
      digest.update(line);
      bytes += line.length;
    }
    await file.sync();
    await file.close();
    file = undefined;

    const findings = [...census.findings];
    const censusOnly = collectCensusOnlyFindings({
      className: ENTITLEMENT_AUTHORITY_CLASS,
      dumpedRows,
      derivedSessionIds,
    });
    if (censusOnly) {
      const already = findings.some(
        (f) => f.type === 'census_only_instances' && f.className === ENTITLEMENT_AUTHORITY_CLASS,
      );
      if (!already) findings.push(censusOnly);
    }
    findings.push(...crossCheckWatermarks({ dumpedRows, projections }));

    const kvManifestPath = resolve(kvSnapshotDir, 'manifest.json');
    let kvSnapshotSha256 = null;
    try {
      const kvManifest = JSON.parse(await readFile(kvManifestPath, 'utf8'));
      kvSnapshotSha256 = kvManifest?.snapshot?.sha256 ?? null;
    } catch { /* optional */ }

    const manifest = {
      schemaVersion: 1,
      startedAt,
      completedAt: now().toISOString(),
      scope: 'Durable Object census + EntitlementAuthorityDO export only; other DO class bodies and R2 excluded',
      consistency: 'Non-atomic enumeration; concurrent authority mutations may diverge from KV projections',
      kvSnapshot: {
        directory: kvSnapshotDir,
        recordCount,
        sha256: kvSnapshotSha256,
        derivedSessionIdCount: derivedSessionIds.length,
      },
      census: {
        script: scriptName,
        namespaces: census.namespaces,
      },
      classes: {
        [ENTITLEMENT_AUTHORITY_CLASS]: {
          instanceCount: dumpedRows.length,
          file: 'entitlement-authority.jsonl',
          bytes,
          sha256: digest.digest('hex'),
        },
      },
      findings,
    };

    const manifestFile = await open(resolve(staging, 'manifest.json'), 'wx', 0o600);
    try { await manifestFile.writeFile(JSON.stringify(manifest, null, 2) + '\n'); }
    finally { await manifestFile.close(); }
    await rename(staging, destination);
    return manifest;
  } catch {
    if (file) await file.close().catch(() => {});
    await rm(staging, { recursive: true, force: true });
    throw new Error('Durable Object export failed; no completed snapshot produced');
  }
}

export async function resolveLatestKvSnapshot(directory) {
  const entries = await readdir(directory);
  const candidates = [];
  for (const name of entries) {
    if (!name.startsWith('kv-') || name.endsWith('.partial')) continue;
    const full = resolve(directory, name);
    const info = await stat(full);
    if (info.isDirectory()) candidates.push({ name, full, mtime: info.mtimeMs });
  }
  if (candidates.length === 0) throw new Error('No KV snapshot directory found');
  candidates.sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name));
  return candidates[0].full;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const backupRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../kv-backups');
    const kvSnapshotDir = process.argv[2]
      ? resolve(process.argv[2])
      : await resolveLatestKvSnapshot(backupRoot);
    const read = createWorkersReader({
      apiKey: process.env.CLOUDFLARE_API_KEY,
      email: process.env.CLOUDFLARE_EMAIL,
    });
    const exportState = createExportStateClient({
      baseUrl: process.env.BACKUP_OPS_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL,
      adminToken: process.env.PRINT_ADMIN_TOKEN,
    });
    const manifest = await exportDoSnapshot({
      read,
      exportState,
      kvSnapshotDir,
      directory: backupRoot,
    });
    const ea = manifest.classes[ENTITLEMENT_AUTHORITY_CLASS];
    console.log(JSON.stringify({
      namespaceCount: manifest.census.namespaces.length,
      entitlementAuthorityCount: ea.instanceCount,
      sha256: ea.sha256,
      findingCount: manifest.findings.length,
    }));
  } catch {
    console.error('Durable Object export failed. Check credentials, read access and connectivity; no artifact should be uploaded.');
    process.exitCode = 1;
  }
}
