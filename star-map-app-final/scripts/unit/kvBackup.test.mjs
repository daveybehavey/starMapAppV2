import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  KEYSPACES,
  DO_BACKUP_CLASSES,
  parseListPage,
  parseDoNamespacesPage,
  parseDoObjectsPage,
  createReader,
  createDoCensusReader,
  createOpsDoStateFetcher,
  censusDoInstances,
  deriveDoNamesFromKvKeys,
  reconcileDoCensus,
  exportSnapshot,
  sha256,
} from '../export-kv-backup.mjs';
import { hasValidAdminToken, readAdminTokenFromHeaders } from '../../src/lib/adminAuth.mjs';
const fixtures = JSON.parse(await readFile(new URL('./fixtures/kv-backup/pages.json', import.meta.url), 'utf8'));
const doFixtures = JSON.parse(await readFile(new URL('./fixtures/kv-backup/do-census.json', import.meta.url), 'utf8'));
const fixedTime = () => new Date('2026-11-04T00:00:00.000Z');
const sensitive = 'synthetic-token customer@example.invalid download-key';
const piiMarker = 'pii-recipient@example.invalid';

async function scratch(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'kv-backup-test-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
function fixtureReader(calls) {
  return async (suffix, json) => {
    calls.push({ suffix, json });
    if (!json) return Buffer.from(sensitive + '\u0000\ufffd');
    const url = new URL(suffix, 'https://fixture.invalid');
    const prefix = url.searchParams.get('prefix');
    if (prefix === 'stripe:') return url.searchParams.has('cursor') ? fixtures.second : fixtures.first;
    if (prefix === 'claim:') return fixtures.claim;
    if (prefix === 'print:order:') return fixtures.print;
    return fixtures.empty;
  };
}

test('fixture pagination, exact bytes, metadata, expiration, checksums and private manifest', async () => scratch(async dir => {
  const calls = [];
  const manifest = await exportSnapshot({ read: fixtureReader(calls), directory: dir, now: fixedTime });
  const [folder] = await readdir(dir);
  assert.equal(folder, 'kv-2026-11-04T00-00-00-000Z');
  const bytes = await readFile(join(dir, folder, 'records.jsonl'));
  const records = bytes.toString().trimEnd().split('\n').map(JSON.parse);
  assert.equal(records.length, 4);
  assert.equal(manifest.recordCount, 4);
  assert.deepEqual(manifest.counts, Object.fromEntries(KEYSPACES.map((p, i) => [p, [2, 1, 0, 1][i]])));
  assert.equal(manifest.snapshot.sha256, sha256(bytes));
  assert.equal(manifest.snapshot.bytes, bytes.length);
  assert.equal(Buffer.from(records[0].valueBase64, 'base64').toString(), sensitive + '\u0000\ufffd');
  assert.deepEqual(records[0].metadata, { fixture: true });
  assert.equal(records[0].expiration, 2000000000);
  assert.equal(Object.hasOwn(records[1], 'expiration'), false);
  assert.ok(calls.some(c => c.suffix.includes('cursor=next%2Fpage')));
  assert.ok(calls.some(c => c.suffix === '/values/claim%3Asynthetic-token'));
  const saved = await readFile(join(dir, folder, 'manifest.json'), 'utf8');
  assert.deepEqual(JSON.parse(saved), manifest);
  for (const secret of [sensitive, 'synthetic-token', 'customer@example.invalid', 'download-key']) assert.ok(!saved.includes(secret));
  assert.equal((await stat(join(dir, folder, 'records.jsonl'))).mode & 0o777, 0o600);
  await assert.rejects(exportSnapshot({ read: fixtureReader([]), directory: dir, now: fixedTime }));
  assert.deepEqual(await readdir(dir), [folder]);
}));

test('reject malformed/unscoped list entries and error envelopes without echoing records', () => {
  for (const body of [null, { success: false, errors: [sensitive] }, { ...fixtures.empty, result_info: {} },
    { ...fixtures.first, result: [{ name: 'other:secret' }] },
    { ...fixtures.first, result: [{ name: 'stripe:x', expiration: -1 }] },
    { ...fixtures.first, result: [{ name: 'stripe:x', metadata: 'bad' }] }]) {
    assert.throws(() => parseListPage(body, 'stripe:'), { message: 'Invalid KV response' });
  }
});

test('read failures, repeated cursors, duplicates and invalid JSON leave no completed/partial files', async () => {
  const readers = [
    async () => { throw new Error(sensitive); },
    async (_suffix, json) => json ? fixtures.first : Buffer.from('value'),
    async (_suffix, json) => json ? { ...fixtures.first, result: [], result_info: { cursor: 'repeat' } } : Buffer.from('value'),
    async () => ({ success: false, errors: [sensitive] }),
  ];
  for (const read of readers) await scratch(async dir => {
    await assert.rejects(exportSnapshot({ read, directory: dir, now: fixedTime }), { message: 'KV export failed; no completed snapshot produced' });
    assert.deepEqual(await readdir(dir), []);
  });
});

test('empty namespace is a valid checksummed snapshot', async () => scratch(async dir => {
  const manifest = await exportSnapshot({ read: async () => fixtures.empty, directory: dir, now: fixedTime });
  assert.equal(manifest.recordCount, 0);
  assert.equal(manifest.snapshot.sha256, sha256(Buffer.alloc(0)));
}));

test('API adapter always uses GET, encoded suffixes, fixed host and no redirects', async () => {
  const calls = [];
  const read = createReader({ apiKey: 'fixture-key', email: 'fixture@example.invalid', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(fixtures.empty));
  } });
  assert.deepEqual(await read('/keys?prefix=stripe%3A', true), fixtures.empty);
  const value = await read('/values/claim%3Asynthetic-token', false);
  assert.ok(Buffer.isBuffer(value));
  for (const { url, options } of calls) {
    assert.equal(new URL(url).hostname, 'api.cloudflare.com');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['X-Auth-Key'], 'fixture-key');
    assert.ok(!Object.hasOwn(options, 'body'));
  }
  for (const fetchImpl of [async () => new Response(sensitive, { status: 404 }), async () => { throw new Error(sensitive); }, async () => new Response('bad JSON')]) {
    await assert.rejects(createReader({ apiKey: 'x', email: 'y', fetchImpl })('/keys', true), { message: 'KV read failed' });
  }
  assert.throws(() => createReader({}), /credentials required/);
});

/* ---------------- Slice-3 Durable Object dump stage ---------------- */

function fixtureDoReader() {
  return async (suffix) => {
    if (suffix.startsWith('/namespaces?')) return doFixtures.namespaces;
    if (suffix.includes('/namespaces/ns-referral/objects')) return doFixtures.referralObjects;
    if (suffix.includes('/namespaces/ns-consistency/objects')) return doFixtures.consistencyObjects;
    if (suffix.includes('/namespaces/ns-ledger/objects')) return doFixtures.ledgerEmpty;
    if (suffix.includes('/namespaces/ns-suppression/objects')) return doFixtures.suppressionEmpty;
    throw new Error(`unexpected DO census suffix ${suffix}`);
  };
}

function fixtureFetchState() {
  return async ({ className, instanceId }) => {
    if (className === 'ReferralDiscoveryDO' && instanceId === 'do-referral-a') {
      return {
        instanceId,
        instanceName: 'fixture-1',
        state: { referredSessionId: 'fixture-1', association: null, terminalNegative: null },
        capturedAt: '2026-11-04T00:00:00.000Z',
      };
    }
    if (className === 'ReferralDiscoveryDO' && instanceId === 'do-referral-census-only') {
      return {
        instanceId,
        instanceName: 'census-only-session',
        state: { referredSessionId: 'census-only-session', association: null, terminalNegative: { lineageRef: 'lin' } },
        capturedAt: '2026-11-04T00:00:00.000Z',
      };
    }
    if (className === 'ConsistencyCoordinatorDO' && instanceId === 'do-magic-a') {
      const magicName = `magic:v1:${createHash('sha256').update('synthetic-token').digest('hex')}`;
      return {
        instanceId,
        instanceName: magicName,
        state: { kind: 'magic', status: 'consumed' },
        capturedAt: '2026-11-04T00:00:00.000Z',
      };
    }
    return {
      instanceId,
      instanceName: null,
      state: null,
      capturedAt: '2026-11-04T00:00:00.000Z',
    };
  };
}

test('slice-3 DO dump: per-class JSONL shape, manifest counts/hash, PII-bearing ledger section, zero-instance honesty', async () => scratch(async dir => {
  const calls = [];
  const manifest = await exportSnapshot({
    read: fixtureReader(calls),
    directory: dir,
    now: fixedTime,
    doExport: { readDo: fixtureDoReader(), fetchState: fixtureFetchState() },
  });
  const [folder] = await readdir(dir);
  assert.equal(folder, 'kv-2026-11-04T00-00-00-000Z');
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(DO_BACKUP_CLASSES.length, 4);

  const referralPath = join(dir, folder, 'do-ReferralDiscoveryDO.jsonl');
  const referralBytes = await readFile(referralPath);
  const referralLines = referralBytes.toString().trimEnd().split('\n').map(JSON.parse);
  assert.equal(referralLines.length, 2);
  assert.equal(referralLines[0].instanceName, 'fixture-1');
  assert.equal(referralLines[1].instanceName, 'census-only-session');
  assert.equal(manifest.durableObjects.ReferralDiscoveryDO.instanceCount, 2);
  assert.equal(manifest.durableObjects.ReferralDiscoveryDO.sha256, sha256(referralBytes));
  assert.equal(manifest.durableObjects.ReferralDiscoveryDO.piiBearing, false);
  assert.equal(
    manifest.durableObjects.ReferralDiscoveryDO.reconciliation.findings.some((f) => f.code === 'census_supset_derived'),
    true,
  );

  const consistencyBytes = await readFile(join(dir, folder, 'do-ConsistencyCoordinatorDO.jsonl'));
  assert.equal(manifest.durableObjects.ConsistencyCoordinatorDO.instanceCount, 1);
  assert.equal(manifest.durableObjects.ConsistencyCoordinatorDO.sha256, sha256(consistencyBytes));
  assert.equal(manifest.durableObjects.ConsistencyCoordinatorDO.reconciliation.derivedCount, 1);
  assert.equal(manifest.durableObjects.ConsistencyCoordinatorDO.reconciliation.censusOnlyInstanceCount, 0);

  // Honest zero-instance namespaces (ledger + suppression).
  const ledgerBytes = await readFile(join(dir, folder, 'do-ReviewRequestLedgerDO.jsonl'));
  assert.equal(ledgerBytes.length, 0);
  assert.equal(manifest.durableObjects.ReviewRequestLedgerDO.instanceCount, 0);
  assert.equal(manifest.durableObjects.ReviewRequestLedgerDO.sha256, sha256(Buffer.alloc(0)));
  assert.equal(manifest.durableObjects.ReviewRequestLedgerDO.piiBearing, true);
  assert.match(manifest.durableObjectNotes.ReviewRequestLedgerDO, /PII-bearing/);

  const suppressionBytes = await readFile(join(dir, folder, 'do-ReviewRequestSuppressionDO.jsonl'));
  assert.equal(suppressionBytes.length, 0);
  assert.equal(manifest.durableObjects.ReviewRequestSuppressionDO.instanceCount, 0);
  assert.equal(manifest.durableObjects.ReviewRequestSuppressionDO.reconciliation.derivedCount, null);
  assert.equal(
    manifest.durableObjects.ReviewRequestSuppressionDO.reconciliation.enumeration,
    'platform-api-census-only',
  );
  assert.match(
    manifest.durableObjects.ReviewRequestSuppressionDO.reconciliation.note,
    /sole enumeration/,
  );

  const saved = await readFile(join(dir, folder, 'manifest.json'), 'utf8');
  for (const secret of [sensitive, piiMarker, 'census-only-session', 'synthetic-token', 'customer@example.invalid']) {
    assert.ok(!saved.includes(secret), `manifest must not contain ${secret}`);
  }
  assert.equal((await stat(referralPath)).mode & 0o777, 0o600);
  assert.equal((await stat(join(dir, folder, 'do-ReviewRequestLedgerDO.jsonl'))).mode & 0o777, 0o600);
}));

test('slice-3 DO census parsing rejects malformed envelopes without echoing bodies', () => {
  assert.throws(() => parseDoNamespacesPage({ success: false, errors: [sensitive] }), /Invalid Durable Object census response/);
  assert.throws(() => parseDoNamespacesPage({ success: true, result: [{ id: 1 }] }), /Invalid Durable Object census response/);
  assert.throws(() => parseDoObjectsPage({ success: true, result: [{ id: 1 }] }), /Invalid Durable Object census response/);
  assert.throws(() => parseDoObjectsPage({ success: true, result: [{ id: 'x' }], result_info: { cursor: 1 } }), /Invalid Durable Object census response/);
});

test('slice-3 DO census lists instances and records zero-instance namespaces', async () => {
  const census = await censusDoInstances(fixtureDoReader());
  assert.equal(census.byClass.ReferralDiscoveryDO.length, 2);
  assert.equal(census.byClass.ConsistencyCoordinatorDO.length, 1);
  assert.deepEqual(census.byClass.ReviewRequestLedgerDO, []);
  assert.deepEqual(census.byClass.ReviewRequestSuppressionDO, []);
  assert.equal(census.namespaceIds.ReviewRequestSuppressionDO, 'ns-suppression');
});

test('slice-3 derived-name reconciliation: claim tokens → magic:v1 names; suppression census-only', () => {
  const keys = ['stripe:session:fixture-1', 'claim:synthetic-token', 'print:order:x'];
  const referral = deriveDoNamesFromKvKeys(keys, 'referral_sessions');
  assert.deepEqual([...referral], ['fixture-1']);
  const magic = deriveDoNamesFromKvKeys(keys, 'magic_coordinator_names');
  assert.equal([...magic][0], `magic:v1:${createHash('sha256').update('synthetic-token').digest('hex')}`);
  const suppressionClass = DO_BACKUP_CLASSES.find((c) => c.className === 'ReviewRequestSuppressionDO');
  const reconciled = reconcileDoCensus({
    classConfig: suppressionClass,
    censusInstances: [],
    exportedNames: [],
    derivedNames: new Set(),
  });
  assert.equal(reconciled.derivedCount, null);
  assert.equal(reconciled.enumeration, 'platform-api-census-only');
});

test('slice-3 ops state fetcher fails closed on 401 and never requires logging bodies', async () => {
  const unauthorized = createOpsDoStateFetcher({
    baseUrl: 'https://fixture.invalid',
    adminToken: 'fixture-admin',
    fetchImpl: async () => new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 }),
  });
  await assert.rejects(
    unauthorized({ className: 'ReferralDiscoveryDO', instanceId: 'x' }),
    { message: 'DO export unauthorized' },
  );
  assert.throws(() => createOpsDoStateFetcher({ baseUrl: '', adminToken: '' }), /credentials required/);
});

test('slice-3 DO census API adapter is GET-only against api.cloudflare.com', async () => {
  const calls = [];
  const readDo = createDoCensusReader({
    apiKey: 'fixture-key',
    email: 'fixture@example.invalid',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify(doFixtures.namespaces));
    },
  });
  await readDo('/namespaces?page=1');
  assert.equal(new URL(calls[0].url).hostname, 'api.cloudflare.com');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
});

test('ops do-backup export route mirrors admin fail-closed auth (no token / empty configured)', async () => {
  const route = await readFile(new URL('../../src/app/api/ops/do-backup/export/route.ts', import.meta.url), 'utf8');
  assert.match(route, /hasValidAdminToken/);
  assert.match(route, /readAdminTokenFromHeaders/);
  assert.match(route, /Unauthorized/);
  assert.match(route, /exportDoBackupState/);
  assert.equal(hasValidAdminToken(null, 'secret'), false);
  assert.equal(hasValidAdminToken('secret', ''), false);
  assert.equal(hasValidAdminToken('secret', 'secret'), true);
  assert.equal(readAdminTokenFromHeaders(new Headers({ authorization: 'Bearer secret' })), 'secret');
});

test('exportState RPC surfaces are read-only (no write/alarm/dispatch) across slice-3 shells', async () => {
  const files = [
    'ReferralDiscoveryDO.ts',
    'ConsistencyCoordinatorDO.ts',
    'ReviewRequestLedgerDO.ts',
    'ReviewRequestSuppressionDO.ts',
  ];
  for (const name of files) {
    const source = await readFile(new URL(`../../src/durable-objects/${name}`, import.meta.url), 'utf8');
    assert.match(source, /async exportState\(/);
    const exportBlock = source.slice(source.indexOf('async exportState('));
    const methodBody = exportBlock.slice(0, exportBlock.indexOf('\n  async ') === -1
      ? exportBlock.indexOf('\n}')
      : Math.min(
          ...['\n  async ', '\n  private ', '\n}'].map((marker) => {
            const idx = exportBlock.indexOf(marker, 1);
            return idx === -1 ? exportBlock.length : idx;
          }),
        ));
    const codeOnly = methodBody.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(codeOnly, /\.write|writeRow|writeDocument|writeState|setAlarm|deleteAlarm|\.dispatch\(/);
    if (name === 'ReviewRequestSuppressionDO.ts') {
      assert.doesNotMatch(codeOnly, /\bcheck\(|\bminimize\(|\bsendViaResend\b/);
    }
    if (name === 'ReviewRequestLedgerDO.ts') {
      assert.doesNotMatch(codeOnly, /\bloadState\(|\bsyncAlarm\(/);
      assert.match(codeOnly, /rowToState|SELECT \* FROM review_request_ledger/);
    }
  }
  const naming = await readFile(new URL('../../src/lib/reviewRequestSuppression.ts', import.meta.url), 'utf8');
  assert.match(naming, /export function deriveReviewSuppressionName[\s\S]*createHmac\("sha256", secret\)/);
});
