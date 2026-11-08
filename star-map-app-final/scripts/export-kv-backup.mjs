/** Read-only KV (+ optional Durable Object) export.
 * Run from app root: node scripts/export-kv-backup.mjs
 * Requires existing CLOUDFLARE_API_KEY / CLOUDFLARE_EMAIL secret pattern.
 * Contains sensitive records: never print, commit, or publish snapshot contents.
 *
 * Slice-3 DO dump (ReferralDiscoveryDO, ConsistencyCoordinatorDO,
 * ReviewRequestLedgerDO, ReviewRequestSuppressionDO) is enabled when
 * `doExport` is supplied (tests) or when DO_BACKUP_BASE_URL + PRINT_ADMIN_TOKEN
 * are set for the CLI. Platform-API census is authoritative; derived names
 * from the KV snapshot are reconciliation only. ReviewRequestLedgerDO dumps
 * are PII-bearing. ReviewRequestSuppressionDO is census-only by design.
 */
import { createHash } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Broad stripe prefix preserves settlement/revocation/index records as well as grants.
export const KEYSPACES = Object.freeze(['stripe:', 'claim:', 'entitlement:', 'print:order:']);
const ACCOUNT = 'c5699cbcedce27a6ad755bdeb815f6de';
const NAMESPACE = 'cdef6c5fa5cc4e52bfe105aa1ba37713';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const invalid = () => { throw new Error('Invalid KV response'); };
const invalidDo = () => { throw new Error('Invalid Durable Object census response'); };

/** Slice-3 class registry only — does not include slices 1–2 class scope. */
export const DO_BACKUP_CLASSES = Object.freeze([
  Object.freeze({
    className: 'ReferralDiscoveryDO',
    binding: 'REFERRAL_DISCOVERY',
    file: 'do-ReferralDiscoveryDO.jsonl',
    piiBearing: false,
    censusOnly: false,
    derivedKind: 'referral_sessions',
  }),
  Object.freeze({
    className: 'ConsistencyCoordinatorDO',
    binding: 'CONSISTENCY_COORDINATOR',
    file: 'do-ConsistencyCoordinatorDO.jsonl',
    piiBearing: false,
    censusOnly: false,
    derivedKind: 'magic_coordinator_names',
  }),
  Object.freeze({
    className: 'ReviewRequestLedgerDO',
    binding: 'REVIEW_REQUEST_LEDGER',
    file: 'do-ReviewRequestLedgerDO.jsonl',
    // Frozen provider payloads carry recipient addresses — PII-bearing.
    piiBearing: true,
    censusOnly: false,
    derivedKind: 'ledger_sessions',
  }),
  Object.freeze({
    className: 'ReviewRequestSuppressionDO',
    binding: 'REVIEW_REQUEST_SUPPRESSION',
    file: 'do-ReviewRequestSuppressionDO.jsonl',
    piiBearing: false,
    // Secret-keyed HMAC instance names — platform census is the sole enumeration.
    censusOnly: true,
    derivedKind: null,
  }),
]);

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

/** Cloudflare Workers API reader for Durable Object namespace + instance census. */
export function createDoCensusReader({ apiKey, email, fetchImpl = fetch }) {
  if (!apiKey || !email) throw new Error('Cloudflare credentials required');
  const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/durable_objects`;
  return async (suffix) => {
    try {
      const response = await fetchImpl(`${base}${suffix}`, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { 'X-Auth-Key': apiKey, 'X-Auth-Email': email },
      });
      if (!response.ok) throw new Error();
      return await response.json();
    } catch { throw new Error('Durable Object census read failed'); }
  };
}

export function parseDoNamespacesPage(body) {
  if (body?.success !== true || !Array.isArray(body.result)) invalidDo();
  for (const ns of body.result) {
    if (typeof ns?.id !== 'string' || typeof ns?.class !== 'string') invalidDo();
  }
  const info = body.result_info ?? {};
  return {
    namespaces: body.result,
    page: Number.isFinite(info.page) ? info.page : 1,
    totalPages: Number.isFinite(info.total_pages) ? info.total_pages : 1,
  };
}

export function parseDoObjectsPage(body) {
  if (body?.success !== true || !Array.isArray(body.result)) invalidDo();
  const cursor = body.result_info?.cursor;
  if (cursor !== undefined && cursor !== null && typeof cursor !== 'string') invalidDo();
  for (const obj of body.result) {
    if (typeof obj?.id !== 'string') invalidDo();
    if (obj.hasStoredData !== undefined && typeof obj.hasStoredData !== 'boolean') invalidDo();
  }
  return { objects: body.result, cursor: typeof cursor === 'string' ? cursor : '' };
}

/**
 * Authoritative census: list namespaces, keep slice-3 classes, list every
 * object id. Zero-instance namespaces are recorded as empty arrays.
 */
export async function censusDoInstances(readDo, classes = DO_BACKUP_CLASSES) {
  const wanted = new Map(classes.map((c) => [c.className, c]));
  const byClass = Object.fromEntries(classes.map((c) => [c.className, []]));
  const namespaceIds = Object.fromEntries(classes.map((c) => [c.className, null]));

  let page = 1;
  let totalPages = 1;
  do {
    const parsed = parseDoNamespacesPage(await readDo(`/namespaces?page=${page}&per_page=100`));
    totalPages = parsed.totalPages;
    for (const ns of parsed.namespaces) {
      if (!wanted.has(ns.class)) continue;
      namespaceIds[ns.class] = ns.id;
    }
    page += 1;
  } while (page <= totalPages);

  for (const cls of classes) {
    const nsId = namespaceIds[cls.className];
    if (!nsId) {
      // Namespace absent from the account — honest zero, not an error.
      byClass[cls.className] = [];
      continue;
    }
    let cursor = '';
    const cursors = new Set();
    const seen = new Set();
    const instances = [];
    do {
      const query = new URLSearchParams({ limit: '1000' });
      if (cursor) query.set('cursor', cursor);
      const parsed = parseDoObjectsPage(
        await readDo(`/namespaces/${encodeURIComponent(nsId)}/objects?${query}`),
      );
      for (const obj of parsed.objects) {
        if (seen.has(obj.id)) throw new Error('Duplicate Durable Object instance');
        seen.add(obj.id);
        instances.push({
          instanceId: obj.id,
          hasStoredData: obj.hasStoredData === true,
        });
      }
      cursor = parsed.cursor;
      if (cursor && cursors.has(cursor)) throw new Error('Repeated Durable Object cursor');
      cursors.add(cursor);
    } while (cursor);
    byClass[cls.className] = instances;
  }
  return { byClass, namespaceIds };
}

/** Ops-endpoint state fetcher — never logs response bodies (bearer/PII). */
export function createOpsDoStateFetcher({ baseUrl, adminToken, fetchImpl = fetch }) {
  const root = (baseUrl || '').replace(/\/+$/, '');
  if (!root || !adminToken) throw new Error('DO backup ops credentials required');
  return async ({ className, instanceId, instanceName }) => {
    try {
      const response = await fetchImpl(`${root}/api/ops/do-backup/export`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          className,
          ...(instanceId ? { instanceId } : {}),
          ...(instanceName ? { instanceName } : {}),
        }),
      });
      if (response.status === 401) throw new Error('DO export unauthorized');
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (body?.ok !== true) throw new Error();
      return {
        instanceId: typeof body.instanceId === 'string' ? body.instanceId : instanceId || '',
        instanceName: typeof body.instanceName === 'string' ? body.instanceName : null,
        state: body.state ?? null,
        capturedAt: typeof body.capturedAt === 'string' ? body.capturedAt : new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'DO export unauthorized') throw error;
      throw new Error('DO state export failed');
    }
  };
}

/** Derive reconciliation names from KV key names (never from values). */
export function deriveDoNamesFromKvKeys(keys, kind) {
  const names = new Set();
  if (kind === 'referral_sessions' || kind === 'ledger_sessions') {
    for (const key of keys) {
      if (typeof key !== 'string') continue;
      if (key.startsWith('stripe:session:')) names.add(key.slice('stripe:session:'.length));
    }
    return names;
  }
  if (kind === 'magic_coordinator_names') {
    for (const key of keys) {
      if (typeof key !== 'string' || !key.startsWith('claim:')) continue;
      const token = key.slice('claim:'.length);
      names.add(`magic:v1:${sha256(token)}`);
    }
    return names;
  }
  return names;
}

export function reconcileDoCensus({ classConfig, censusInstances, exportedNames, derivedNames }) {
  const censusCount = censusInstances.length;
  if (classConfig.censusOnly) {
    return {
      censusCount,
      derivedCount: null,
      censusOnlyInstanceCount: censusCount,
      findings: [],
      enumeration: 'platform-api-census-only',
      note: 'Instance names are secret-keyed HMACs (deriveReviewSuppressionName); platform-API census is the sole enumeration — no derived count exists',
    };
  }
  const derivedCount = derivedNames.size;
  const exported = new Set(exportedNames.filter((n) => typeof n === 'string' && n.length > 0));
  const censusOnlyNames = [...exported].filter((n) => !derivedNames.has(n));
  const findings = [];
  if (censusOnlyNames.length > 0) {
    findings.push({
      code: 'census_supset_derived',
      count: censusOnlyNames.length,
      detail: 'Census/export produced instance names not present in the derived-name cross-check; recorded as findings, not errors',
    });
  }
  if (derivedCount > exported.size) {
    findings.push({
      code: 'derived_without_export_name',
      count: derivedCount - exported.size,
      detail: 'Some derived names had no matching exported instanceName (hex-id-only or absent object)',
    });
  }
  return {
    censusCount,
    derivedCount,
    censusOnlyInstanceCount: censusOnlyNames.length,
    findings,
    enumeration: 'platform-api-census',
  };
}

async function writeDoClassDump({ staging, classConfig, instances, fetchState, now }) {
  const filePath = resolve(staging, classConfig.file);
  const file = await open(filePath, 'wx', 0o600);
  const digest = createHash('sha256');
  let bytes = 0;
  const exportedNames = [];
  try {
    for (const instance of instances) {
      const exported = await fetchState({
        className: classConfig.className,
        instanceId: instance.instanceId,
      });
      const capturedAt = exported.capturedAt || now().toISOString();
      if (typeof exported.instanceName === 'string' && exported.instanceName) {
        exportedNames.push(exported.instanceName);
      }
      const line = Buffer.from(JSON.stringify({
        className: classConfig.className,
        instanceId: exported.instanceId || instance.instanceId,
        instanceName: exported.instanceName ?? null,
        hasStoredData: instance.hasStoredData === true,
        state: exported.state ?? null,
        capturedAt,
      }) + '\n');
      await file.writeFile(line);
      digest.update(line);
      bytes += line.length;
    }
    await file.sync();
  } finally {
    await file.close();
  }
  return {
    file: classConfig.file,
    instanceCount: instances.length,
    bytes,
    sha256: digest.digest('hex'),
    piiBearing: classConfig.piiBearing === true,
    exportedNames,
  };
}

export async function exportSnapshot({
  read,
  directory,
  now = () => new Date(),
  doExport = null,
}) {
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
    const kvKeys = [];
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
          kvKeys.push(key.name);
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

    let durableObjects = undefined;
    if (doExport) {
      const { readDo, fetchState, classes = DO_BACKUP_CLASSES } = doExport;
      if (typeof readDo !== 'function' || typeof fetchState !== 'function') {
        throw new Error('DO export requires readDo and fetchState');
      }
      const census = await censusDoInstances(readDo, classes);
      durableObjects = {};
      for (const classConfig of classes) {
        const instances = census.byClass[classConfig.className] ?? [];
        const dump = await writeDoClassDump({
          staging,
          classConfig,
          instances,
          fetchState,
          now,
        });
        const derivedNames = classConfig.censusOnly
          ? new Set()
          : deriveDoNamesFromKvKeys(kvKeys, classConfig.derivedKind);
        const reconciliation = reconcileDoCensus({
          classConfig,
          censusInstances: instances,
          exportedNames: dump.exportedNames,
          derivedNames,
        });
        // Manifest carries counts + hashes only — never state contents.
        durableObjects[classConfig.className] = {
          file: dump.file,
          instanceCount: dump.instanceCount,
          bytes: dump.bytes,
          sha256: dump.sha256,
          piiBearing: dump.piiBearing,
          namespaceId: census.namespaceIds[classConfig.className],
          reconciliation,
        };
      }
    }

    const manifest = {
      schemaVersion: doExport ? 2 : 1,
      startedAt,
      completedAt: now().toISOString(),
      scope: doExport
        ? 'KV plus slice-3 Durable Object authority state (ReferralDiscoveryDO, ConsistencyCoordinatorDO, ReviewRequestLedgerDO/PII-bearing, ReviewRequestSuppressionDO); excludes slices 1–2 DO classes, R2 assets and map recipes'
        : 'KV only; excludes Durable Object authority state, R2 assets and map recipes',
      consistency: 'Non-atomic enumeration; KV is eventually consistent; concurrent changes may be absent; DO census is platform-API authoritative with derived-name reconciliation only',
      counts,
      recordCount: Object.values(counts).reduce((a, b) => a + b, 0),
      snapshot: { file: 'records.jsonl', encoding: 'base64 values', bytes, sha256: digest.digest('hex') },
      ...(durableObjects
        ? {
            durableObjects,
            durableObjectNotes: {
              ReviewRequestLedgerDO: 'PII-bearing — frozen provider payloads include recipient addresses; contents never logged',
              ReviewRequestSuppressionDO: 'Census-only enumeration — HMAC instance names are not derivable from held backup data',
            },
          }
        : {}),
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
    const apiKey = process.env.CLOUDFLARE_API_KEY;
    const email = process.env.CLOUDFLARE_EMAIL;
    const read = createReader({ apiKey, email });
    const doBase = process.env.DO_BACKUP_BASE_URL?.trim() || '';
    const adminToken = process.env.PRINT_ADMIN_TOKEN?.trim() || '';
    const doExport = doBase && adminToken
      ? {
          readDo: createDoCensusReader({ apiKey, email }),
          fetchState: createOpsDoStateFetcher({ baseUrl: doBase, adminToken }),
        }
      : null;
    const manifest = await exportSnapshot({
      read,
      directory: resolve(dirname(fileURLToPath(import.meta.url)), '../kv-backups'),
      doExport,
    });
    const summary = {
      recordCount: manifest.recordCount,
      sha256: manifest.snapshot.sha256,
      ...(manifest.durableObjects
        ? {
            durableObjects: Object.fromEntries(
              Object.entries(manifest.durableObjects).map(([name, section]) => [
                name,
                {
                  instanceCount: section.instanceCount,
                  sha256: section.sha256,
                  piiBearing: section.piiBearing === true,
                },
              ]),
            ),
          }
        : {}),
    };
    console.log(JSON.stringify(summary));
  } catch {
    console.error('KV export failed. Check credentials, read access and connectivity; no artifact should be uploaded.');
    process.exitCode = 1;
  }
}
