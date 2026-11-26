import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ENTITLEMENT_AUTHORITY_CLASS,
  collectCensusOnlyFindings,
  collectDurableObjectCensus,
  createExportStateClient,
  createWorkersReader,
  crossCheckWatermarks,
  deriveSessionIdsFromKvKeys,
  exportDoSnapshot,
  parseNamespacePage,
  parseObjectsPage,
  reconcileCensus,
  sha256,
} from '../export-do-backup.mjs';

const fixtures = JSON.parse(
  await readFile(new URL('./fixtures/do-backup/api.json', import.meta.url), 'utf8'),
);
const fixedTime = () => new Date('2026-11-08T12:00:00.000Z');
const sensitive = 'synthetic-token customer@example.invalid do-state-secret';

async function scratch(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'do-backup-test-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

function workersReader(calls) {
  return async (suffix) => {
    calls.push(suffix);
    if (suffix.startsWith('/namespaces?')) return fixtures.namespacesPage1;
    if (suffix.includes('ns-entitlement-authority/objects')) return fixtures.eaObjects;
    if (suffix.includes('ns-print-order/objects')) return fixtures.printObjects;
    if (suffix.includes('ns-other-script/objects')) return fixtures.emptyObjects;
    throw new Error(`unexpected suffix ${suffix}`);
  };
}

async function writeKvSnapshot(dir, records) {
  const kvDir = join(dir, 'kv-fixture');
  await mkdir(kvDir, { mode: 0o700 });
  const lines = records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
  await writeFile(join(kvDir, 'records.jsonl'), lines, { mode: 0o600 });
  await writeFile(
    join(kvDir, 'manifest.json'),
    JSON.stringify({
      snapshot: { sha256: sha256(Buffer.from(lines)), bytes: Buffer.byteLength(lines) },
      recordCount: records.length,
    }) + '\n',
    { mode: 0o600 },
  );
  return kvDir;
}

function projectionRecord(sessionId, includedThroughSeq) {
  const value = Buffer.from(JSON.stringify({
    sessionId,
    includedThroughSeq,
    creditsRemaining: 1,
  }), 'utf8');
  return {
    key: `entitlement:projection:${sessionId}`,
    valueBase64: value.toString('base64'),
  };
}

test('deriveSessionIdsFromKvKeys reads stripe:session ids only', () => {
  assert.deepEqual(
    deriveSessionIdsFromKvKeys([
      'stripe:session:cs_a',
      'stripe:session:cs_b',
      'claim:token',
      'entitlement:projection:cs_a',
      'stripe:settlement:cs_a',
    ]),
    ['cs_a', 'cs_b'],
  );
});

test('census reconciliation treats census-only named instances as findings, not errors', () => {
  const namespaces = [{
    id: 'ns-ea',
    className: ENTITLEMENT_AUTHORITY_CLASS,
    bindingName: 'ENTITLEMENT_AUTHORITY',
    script: 'star-map-final',
    instances: [
      { id: 'id-1', name: 'cs_derived' },
      { id: 'id-2', name: 'cs_census_only' },
    ],
  }];
  const result = reconcileCensus({
    namespaces,
    derivedSessionIds: ['cs_derived'],
  });
  assert.equal(result.namespaces[0].instanceCount, 2);
  assert.deepEqual(result.namespaces[0].instanceNames, ['cs_census_only', 'cs_derived']);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].type, 'census_only_instances');
  assert.equal(result.findings[0].count, 1);
  assert.deepEqual(result.findings[0].instanceNames, ['cs_census_only']);
});

test('post-dump census-only collector uses state session ids', () => {
  const finding = collectCensusOnlyFindings({
    className: ENTITLEMENT_AUTHORITY_CLASS,
    derivedSessionIds: ['cs_derived'],
    dumpedRows: [
      { instanceId: 'id-1', sessionId: 'cs_derived', state: { journalHead: 1 } },
      { instanceId: 'id-2', sessionId: 'cs_orphan', state: { journalHead: 0 } },
      { instanceId: 'id-3', sessionId: null, state: null },
    ],
  });
  assert.equal(finding.count, 2);
  assert.deepEqual(finding.instanceIds, ['id-2', 'id-3']);
});

test('watermark cross-check passes and records projection-ahead findings', () => {
  const projections = new Map([
    ['cs_ok', { includedThroughSeq: 3 }],
    ['cs_ahead', { includedThroughSeq: 9 }],
  ]);
  const findings = crossCheckWatermarks({
    projections,
    dumpedRows: [
      { instanceId: 'a', sessionId: 'cs_ok', state: { journalHead: 3 } },
      { instanceId: 'b', sessionId: 'cs_ahead', state: { journalHead: 4 } },
      { instanceId: 'c', sessionId: 'cs_missing', state: { journalHead: 1 } },
    ],
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, 'projection_ahead_of_authority');
  assert.equal(findings[0].includedThroughSeq, 9);
  assert.equal(findings[0].journalHead, 4);
  assert.equal(findings[0].instanceId, 'b');
});

test('Workers API adapter is GET-only and filters other scripts', async () => {
  const calls = [];
  const namespaces = await collectDurableObjectCensus({ read: workersReader(calls) });
  assert.deepEqual(
    namespaces.map((n) => n.className),
    [ENTITLEMENT_AUTHORITY_CLASS, 'PrintOrderAuthorityDO'],
  );
  assert.equal(namespaces[0].instances.length, 2);
  assert.ok(calls.every((suffix) => typeof suffix === 'string'));
  assert.ok(!calls.some((suffix) => suffix.includes('ns-other-script')));

  const apiCalls = [];
  const read = createWorkersReader({
    apiKey: 'fixture-key',
    email: 'fixture@example.invalid',
    fetchImpl: async (url, options) => {
      apiCalls.push({ url, options });
      return new Response(JSON.stringify(fixtures.emptyObjects));
    },
  });
  await read('/namespaces/ns-x/objects');
  assert.equal(apiCalls[0].options.method, 'GET');
  assert.equal(apiCalls[0].options.redirect, 'error');
  assert.equal(new URL(apiCalls[0].url).hostname, 'api.cloudflare.com');
  assert.throws(() => createWorkersReader({}), /credentials required/);
});

test('parse helpers reject malformed envelopes without echoing secrets', () => {
  for (const body of [null, { success: false, errors: [sensitive] }, { success: true, result: [{ id: 1 }] }]) {
    assert.throws(() => parseNamespacePage(body), { message: 'Invalid Durable Object API response' });
    assert.throws(() => parseObjectsPage(body), { message: 'Invalid Durable Object API response' });
  }
});

test('exportState client fails closed on missing credentials and unauthorized responses', async () => {
  assert.throws(() => createExportStateClient({}), /Ops export credentials required/);
  const unauthorized = createExportStateClient({
    baseUrl: 'https://fixture.invalid',
    adminToken: 'token',
    fetchImpl: async () => new Response(JSON.stringify({ ok: false }), { status: 401 }),
  });
  await assert.rejects(() => unauthorized({ instanceId: 'x' }), { message: 'Unauthorized' });
});

test('dump file shape, manifest counts/hash, staging permissions, and findings', async () => scratch(async (dir) => {
  const kvDir = await writeKvSnapshot(dir, [
    { key: 'stripe:session:cs_fixture_derived', valueBase64: Buffer.from('{}').toString('base64') },
    projectionRecord('cs_fixture_derived', 2),
    projectionRecord('cs_fixture_census_only', 5),
  ]);

  const states = {
    'ea-id-derived-1': {
      sessionId: 'cs_fixture_derived',
      journalHead: 2,
      ownedFiles: {},
      secret: sensitive,
    },
    'ea-id-census-only': {
      sessionId: 'cs_fixture_census_only',
      journalHead: 1,
      ownedFiles: {},
    },
  };

  const exportState = async ({ instanceId }) => ({
    ok: true,
    instanceId,
    sessionId: states[instanceId].sessionId,
    capturedAt: '2026-11-08T12:00:00.000Z',
    state: states[instanceId],
  });

  const calls = [];
  const manifest = await exportDoSnapshot({
    read: workersReader(calls),
    exportState,
    kvSnapshotDir: kvDir,
    directory: dir,
    now: fixedTime,
  });

  const folders = await readdir(dir);
  assert.ok(folders.includes('do-2026-11-08T12-00-00-000Z'));
  assert.ok(!folders.some((name) => name.endsWith('.partial')));
  const snap = join(dir, 'do-2026-11-08T12-00-00-000Z');
  const jsonl = await readFile(join(snap, 'entitlement-authority.jsonl'));
  const rows = jsonl.toString().trimEnd().split('\n').map(JSON.parse);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].instanceId, 'ea-id-derived-1');
  assert.equal(typeof rows[0].capturedAt, 'string');
  assert.equal(rows[0].state.journalHead, 2);

  const ea = manifest.classes[ENTITLEMENT_AUTHORITY_CLASS];
  assert.equal(ea.instanceCount, 2);
  assert.equal(ea.sha256, sha256(jsonl));
  assert.equal(ea.bytes, jsonl.length);
  assert.equal((await stat(join(snap, 'entitlement-authority.jsonl'))).mode & 0o777, 0o600);
  assert.equal((await stat(join(snap, 'manifest.json'))).mode & 0o777, 0o600);

  const saved = await readFile(join(snap, 'manifest.json'), 'utf8');
  assert.deepEqual(JSON.parse(saved), manifest);
  assert.ok(!saved.includes(sensitive));
  assert.ok(!saved.includes('do-state-secret'));
  assert.equal(manifest.census.namespaces.length, 2);
  assert.equal(manifest.census.namespaces[0].instanceCount, 2);

  const censusOnly = manifest.findings.filter((f) => f.type === 'census_only_instances');
  assert.ok(censusOnly.length >= 1);
  const watermark = manifest.findings.filter((f) => f.type === 'projection_ahead_of_authority');
  assert.equal(watermark.length, 1);
  assert.equal(watermark[0].includedThroughSeq, 5);
  assert.equal(watermark[0].journalHead, 1);
}));

test('export failures leave no completed or partial snapshot', async () => scratch(async (dir) => {
  const kvDir = await writeKvSnapshot(dir, [
    { key: 'stripe:session:cs_fixture_derived', valueBase64: Buffer.from('{}').toString('base64') },
  ]);
  await assert.rejects(
    exportDoSnapshot({
      read: async () => { throw new Error(sensitive); },
      exportState: async () => ({ ok: true, state: null }),
      kvSnapshotDir: kvDir,
      directory: dir,
      now: fixedTime,
    }),
    { message: 'Durable Object export failed; no completed snapshot produced' },
  );
  assert.deepEqual(
    (await readdir(dir)).filter((name) => name.startsWith('do-')),
    [],
  );
}));

test('ops entitlement-authority export route fails closed without admin token', async () => {
  const source = await readFile(
    new URL('../../src/app/api/ops/entitlement-authority/export/route.ts', import.meta.url),
    'utf8',
  );
  assert.match(source, /hasValidAdminToken/);
  assert.match(source, /readAdminTokenFromHeaders/);
  assert.match(source, /PRINT_ADMIN_TOKEN/);
  assert.match(source, /status: 401/);
  assert.match(source, /exportState\(/);
  assert.ok(source.includes('Unauthorized'));
  // Fail closed: auth gate precedes Cloudflare context / DO access at runtime.
  const authCall = source.indexOf('if (!requireAdmin(req))');
  const contextCall = source.indexOf('getCloudflareContext().env');
  assert.ok(authCall >= 0 && contextCall > authCall);
  // Read-only surface: no storage writes, alarms, or mutations in the route.
  assert.doesNotMatch(source, /\.put\(|\.delete\(|\.alarm\(|writeState\(/);
});
