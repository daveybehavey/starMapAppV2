/** Minimal Durable Object census + dump helpers for backup slice 2.
 * Overlaps slice-1 shared surface (census / dump / manifest section).
 * Snapshot contents must never be logged — counts and SHA-256 only.
 */
import { createHash } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const DO_BACKUP_CLASSES = Object.freeze([
  Object.freeze({
    className: 'GiftCertificateGrantDO',
    binding: 'GIFT_CERTIFICATE_GRANT',
    file: 'durable-objects/GiftCertificateGrantDO.jsonl',
  }),
  Object.freeze({
    className: 'PrintOrderAuthorityDO',
    binding: 'PRINT_ORDER_AUTHORITY',
    file: 'durable-objects/PrintOrderAuthorityDO.jsonl',
  }),
]);

export const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

const invalidDo = () => { throw new Error('Invalid Durable Object API response'); };

export function parseNamespaceList(body) {
  if (body?.success !== true || !Array.isArray(body.result)) invalidDo();
  for (const ns of body.result) {
    if (typeof ns?.id !== 'string' || !ns.id ||
        typeof ns?.class !== 'string' || !ns.class) invalidDo();
  }
  return body.result;
}

export function parseObjectsPage(body) {
  if (body?.success !== true || !Array.isArray(body.result)) invalidDo();
  const cursor = body.result_info?.cursor;
  if (cursor !== undefined && cursor !== null && typeof cursor !== 'string') invalidDo();
  for (const obj of body.result) {
    if (typeof obj?.id !== 'string' || !obj.id) invalidDo();
    if (obj.hasStoredData !== undefined && typeof obj.hasStoredData !== 'boolean') invalidDo();
  }
  return { objects: body.result, cursor: typeof cursor === 'string' ? cursor : '' };
}

/** Map class names to namespace ids from a Workers DO namespace list. */
export function selectBackupNamespaces(namespaces, classes = DO_BACKUP_CLASSES) {
  const wanted = new Map(classes.map((c) => [c.className, c]));
  const selected = [];
  for (const ns of namespaces) {
    const meta = wanted.get(ns.class);
    if (!meta) continue;
    selected.push({
      className: meta.className,
      binding: meta.binding,
      file: meta.file,
      namespaceId: ns.id,
      script: typeof ns.script === 'string' ? ns.script : null,
    });
  }
  return selected;
}

export function createDurableObjectsReader({ accountId, apiKey, email, fetchImpl = fetch }) {
  if (!apiKey || !email) throw new Error('Cloudflare credentials required');
  if (!accountId) throw new Error('Cloudflare account id required');
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/durable_objects`;
  return async (suffix, json = true) => {
    try {
      const response = await fetchImpl(`${base}${suffix}`, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { 'X-Auth-Key': apiKey, 'X-Auth-Email': email },
      });
      if (!response.ok) throw new Error();
      return json ? await response.json() : Buffer.from(await response.arrayBuffer());
    } catch {
      throw new Error('Durable Object API read failed');
    }
  };
}

export async function listAllObjects(read, namespaceId) {
  const instances = [];
  let cursor = '';
  const seenCursors = new Set();
  const seenIds = new Set();
  do {
    const query = new URLSearchParams({ limit: '1000' });
    if (cursor) query.set('cursor', cursor);
    const page = parseObjectsPage(
      await read(`/namespaces/${encodeURIComponent(namespaceId)}/objects?${query}`, true),
    );
    for (const obj of page.objects) {
      if (seenIds.has(obj.id)) throw new Error('Duplicate Durable Object instance');
      seenIds.add(obj.id);
      instances.push({
        id: obj.id,
        hasStoredData: obj.hasStoredData === true,
      });
    }
    cursor = page.cursor;
    if (cursor && seenCursors.has(cursor)) throw new Error('Repeated Durable Object cursor');
    seenCursors.add(cursor);
  } while (cursor);
  return instances;
}

export async function censusDurableObjectClasses({
  read,
  classes = DO_BACKUP_CLASSES,
}) {
  const namespaces = parseNamespaceList(await read('/namespaces', true));
  const selected = selectBackupNamespaces(namespaces, classes);
  const byClass = {};
  for (const entry of classes) {
    byClass[entry.className] = { namespaceId: null, instances: [] };
  }
  for (const ns of selected) {
    const instances = await listAllObjects(read, ns.namespaceId);
    byClass[ns.className] = {
      namespaceId: ns.namespaceId,
      script: ns.script,
      binding: ns.binding,
      file: ns.file,
      instances,
    };
  }
  // Classes with no live namespace still appear with zero instances (honest empty).
  for (const entry of classes) {
    if (!byClass[entry.className].file) {
      byClass[entry.className] = {
        namespaceId: null,
        script: null,
        binding: entry.binding,
        file: entry.file,
        instances: [],
      };
    }
  }
  return byClass;
}

export function createOpsExportClient({
  baseUrl,
  adminToken,
  fetchImpl = fetch,
}) {
  if (!baseUrl || !adminToken) throw new Error('Ops export credentials required');
  const origin = baseUrl.replace(/\/+$/, '');
  return async ({ className, instanceId }) => {
    try {
      const url = new URL('/api/ops/durable-objects/export', `${origin}/`);
      url.searchParams.set('class', className);
      url.searchParams.set('instanceId', instanceId);
      const response = await fetchImpl(url, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: {
          'x-print-admin-token': adminToken,
          accept: 'application/json',
        },
      });
      if (response.status === 401) throw new Error('Ops export unauthorized');
      if (!response.ok) throw new Error();
      const body = await response.json();
      if (body?.ok !== true || body.class !== className || body.instanceId !== instanceId) {
        throw new Error();
      }
      if (typeof body.capturedAt !== 'string' || !body.capturedAt) throw new Error();
      // state may be null (empty instance) or an object — never log it.
      if (body.state !== null && (typeof body.state !== 'object' || Array.isArray(body.state))) {
        throw new Error();
      }
      return { capturedAt: body.capturedAt, state: body.state };
    } catch (error) {
      if (error instanceof Error && error.message === 'Ops export unauthorized') throw error;
      throw new Error('Durable Object export failed');
    }
  };
}

/**
 * Write one per-class JSONL under staging with owner-only perms.
 * Returns { instanceCount, bytes, sha256, file } — never the contents.
 */
export async function dumpDurableObjectClass({
  stagingDirectory,
  className,
  file,
  instances,
  exportState,
  now = () => new Date(),
}) {
  const relative = file || `durable-objects/${className}.jsonl`;
  const absolute = resolve(stagingDirectory, relative);
  await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
  const handle = await open(absolute, 'wx', 0o600);
  const digest = createHash('sha256');
  let bytes = 0;
  try {
    for (const instance of instances) {
      const exported = await exportState({
        className,
        instanceId: instance.id,
        hasStoredData: instance.hasStoredData === true,
      });
      const line = Buffer.from(JSON.stringify({
        class: className,
        instanceId: instance.id,
        hasStoredData: instance.hasStoredData === true,
        capturedAt: exported.capturedAt || now().toISOString(),
        state: exported.state,
      }) + '\n');
      await handle.writeFile(line);
      digest.update(line);
      bytes += line.length;
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
  return {
    className,
    file: relative,
    instanceCount: instances.length,
    bytes,
    sha256: digest.digest('hex'),
  };
}

/** Census vs KV print:order: count — divergence is a finding, not an error. */
export function reconcilePrintOrderAuthority({
  censusInstanceCount,
  kvPrintOrderCount,
}) {
  const census = Number(censusInstanceCount);
  const kv = Number(kvPrintOrderCount);
  if (!Number.isSafeInteger(census) || census < 0 ||
      !Number.isSafeInteger(kv) || kv < 0) {
    throw new Error('Invalid reconciliation counts');
  }
  return {
    censusInstanceCount: census,
    kvPrintOrderCount: kv,
    matched: census === kv,
    finding: census === kv
      ? null
      : `print_order_authority_divergence: census=${census} kv_print_order=${kv}`,
  };
}

export async function dumpBackupDurableObjects({
  stagingDirectory,
  census,
  exportState,
  kvPrintOrderCount = 0,
  now = () => new Date(),
  classes = DO_BACKUP_CLASSES,
}) {
  const sections = {};
  for (const entry of classes) {
    const classCensus = census[entry.className] || {
      instances: [],
      file: entry.file,
      namespaceId: null,
    };
    const dump = await dumpDurableObjectClass({
      stagingDirectory,
      className: entry.className,
      file: classCensus.file || entry.file,
      instances: classCensus.instances || [],
      exportState,
      now,
    });
    sections[entry.className] = {
      ...dump,
      namespaceId: classCensus.namespaceId ?? null,
    };
  }
  return {
    classes: sections,
    reconciliation: {
      PrintOrderAuthorityDO: reconcilePrintOrderAuthority({
        censusInstanceCount: sections.PrintOrderAuthorityDO?.instanceCount ?? 0,
        kvPrintOrderCount,
      }),
    },
  };
}
