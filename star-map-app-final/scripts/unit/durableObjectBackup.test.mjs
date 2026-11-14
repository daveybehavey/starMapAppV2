/**
 * Backup slice 2: GiftCertificateGrantDO + PrintOrderAuthorityDO export.
 * Fixture-driven, credential-free. Snapshot contents never asserted into logs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { register } from 'node:module';
import {
  DO_BACKUP_CLASSES,
  censusDurableObjectClasses,
  createDurableObjectsReader,
  createOpsExportClient,
  dumpBackupDurableObjects,
  dumpDurableObjectClass,
  parseNamespaceList,
  parseObjectsPage,
  reconcilePrintOrderAuthority,
  selectBackupNamespaces,
  sha256Hex,
} from '../lib/durableObjectBackup.mjs';
import { exportSnapshot, sha256 } from '../export-kv-backup.mjs';

register('./tsAliasLoader.mjs', import.meta.url);
register('./durableObjectExport.hooks.mjs', import.meta.url);

const { fakeCloudflareEnv } = await import('./durableObjectExport.fakeEnv.mjs');
const { NextRequest } = await import('next/server');
const exportRoute = await import('../../src/app/api/ops/durable-objects/export/route.ts');
const { GiftCertificateGrantDO } = await import('../../src/durable-objects/GiftCertificateGrantDO.ts');
const { PrintOrderAuthorityDO } = await import('../../src/durable-objects/PrintOrderAuthorityDO.ts');
const {
  createEmptyGiftCertificateGrantRow,
  initializeGiftCertificateGrant,
} = await import('../../src/lib/giftCertificateGrantState.ts');

const fixtures = JSON.parse(
  await readFile(new URL('./fixtures/kv-backup/pages.json', import.meta.url), 'utf8'),
);
const doFixtures = JSON.parse(
  await readFile(new URL('./fixtures/do-backup/census.json', import.meta.url), 'utf8'),
);
const fixedTime = () => new Date('2026-11-08T12:00:00.000Z');
const SENSITIVE = 'customer@example.invalid synthetic-secret printful-order-999';

async function scratch(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'do-backup-test-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

class FakeGrantSql {
  constructor() { this.rows = new Map(); }
  exec(sql, ...params) {
    const head = sql.trimStart().slice(0, 6).toUpperCase();
    if (head.startsWith('CREATE')) return { toArray: () => [] };
    if (head.startsWith('SELECT')) {
      if (!sql.includes('WHERE')) {
        const all = [...this.rows.values()];
        return { toArray: () => (all[0] ? [all[0]] : []) };
      }
      const row = this.rows.get(params[0]);
      return { toArray: () => (row ? [row] : []) };
    }
    if (head.startsWith('INSERT')) {
      const [id, stateJson, updatedAt] = params;
      this.rows.set(id, { session_id: id, state_json: stateJson, updated_at: updatedAt });
      return { toArray: () => [] };
    }
    throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
  }
}

class FakePrintSql {
  constructor() { this.row = null; this.columns = new Set([
    'session_id', 'printful_order_id', 'lifecycle', 'terminal_reason',
    'terminal_event_type', 'revision', 'updated_at', 'seeded_from_kv',
    'alt_dispatch_id', 'alt_dispatch_claimed_at',
  ]); }
  exec(sql, ...params) {
    const trimmed = sql.trimStart();
    const head = trimmed.slice(0, 6).toUpperCase();
    if (head.startsWith('CREATE')) return { toArray: () => [] };
    if (trimmed.startsWith('PRAGMA')) {
      return { toArray: () => [...this.columns].map((name) => ({ name })) };
    }
    if (head.startsWith('ALTER')) return { toArray: () => [] };
    if (head.startsWith('SELECT')) {
      if (!trimmed.includes('WHERE')) {
        return { toArray: () => (this.row ? [this.row] : []) };
      }
      return { toArray: () => (this.row && this.row.session_id === params[0] ? [this.row] : []) };
    }
    if (head.startsWith('INSERT')) {
      this.row = {
        session_id: params[0],
        printful_order_id: params[1],
        lifecycle: params[2],
        terminal_reason: params[3],
        terminal_event_type: params[4],
        revision: params[5],
        updated_at: params[6],
        seeded_from_kv: params[7],
        alt_dispatch_id: params[8],
        alt_dispatch_claimed_at: params[9],
      };
      return { toArray: () => [] };
    }
    throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
  }
}

const fakeCtx = (sql) => ({
  storage: { sql },
  blockConcurrencyWhile(fn) { return fn(); },
});

test('exportState is read-only on GiftCertificateGrantDO (verbatim row or null)', async () => {
  const sql = new FakeGrantSql();
  const grant = new GiftCertificateGrantDO(fakeCtx(sql), {});
  assert.deepEqual(await grant.exportState(), { state: null });

  const terms = {
    certificateId: 'cs_grant_fixture',
    tier: 'hd_pack3',
    plan: 'pack3',
    creditsTotal: 3,
  };
  const empty = createEmptyGiftCertificateGrantRow('cs_grant_fixture');
  const init = initializeGiftCertificateGrant(empty, {
    terms,
    now: 1_700_000_000_000,
  });
  assert.equal(init.changed, true);
  // Persist via the shell's initialize path (existing behaviour).
  await grant.initialize('cs_grant_fixture', {
    terms,
    now: 1_700_000_000_000,
  });
  const before = sql.rows.size;
  const exported = await grant.exportState();
  assert.equal(sql.rows.size, before, 'exportState must not write');
  assert.equal(exported.state.entitlementSessionId, 'cs_grant_fixture');
  assert.equal(exported.state.grant.creditsTotal, 3);
  assert.equal(exported.state.publishedAt, null);
});

test('exportState is read-only on PrintOrderAuthorityDO (verbatim row or null)', async () => {
  const sql = new FakePrintSql();
  const authority = new PrintOrderAuthorityDO(fakeCtx(sql), {});
  assert.deepEqual(await authority.exportState(), { state: null });

  await authority.bindProviderOrderId('cs_print_fixture', 'pf-123');
  const before = sql.row ? { ...sql.row } : null;
  const exported = await authority.exportState();
  assert.deepEqual(sql.row, before, 'exportState must not mutate storage');
  assert.equal(exported.state.sessionId, 'cs_print_fixture');
  assert.equal(exported.state.printfulOrderId, 'pf-123');
  assert.equal(exported.state.lifecycle, 'bound');
});

test('grant-class zero instances: empty JSONL, count 0, stable empty sha256', async () => scratch(async (dir) => {
  const dump = await dumpDurableObjectClass({
    stagingDirectory: dir,
    className: 'GiftCertificateGrantDO',
    file: 'durable-objects/GiftCertificateGrantDO.jsonl',
    instances: [],
    exportState: async () => {
      throw new Error('must not export when census is empty');
    },
    now: fixedTime,
  });
  assert.equal(dump.instanceCount, 0);
  assert.equal(dump.bytes, 0);
  assert.equal(dump.sha256, sha256Hex(Buffer.alloc(0)));
  const bytes = await readFile(join(dir, dump.file));
  assert.equal(bytes.length, 0);
  assert.equal((await stat(join(dir, dump.file))).mode & 0o777, 0o600);
}));

test('per-class dump shape, manifest counts/hash, print-order reconciliation finding', async () => scratch(async (dir) => {
  const states = {
    'do-print-1': {
      sessionId: 'cs_a',
      printfulOrderId: 'pf-a',
      lifecycle: 'bound',
      terminalReason: null,
      terminalEventType: null,
      revision: 1,
      updatedAt: 1,
      seededFromKv: false,
      alternateDispatchClaim: null,
    },
  };
  const census = {
    GiftCertificateGrantDO: {
      namespaceId: null,
      file: 'durable-objects/GiftCertificateGrantDO.jsonl',
      instances: [],
    },
    PrintOrderAuthorityDO: {
      namespaceId: 'ns-print',
      file: 'durable-objects/PrintOrderAuthorityDO.jsonl',
      instances: [{ id: 'do-print-1', hasStoredData: true }],
    },
  };
  const durableObjects = await dumpBackupDurableObjects({
    stagingDirectory: dir,
    census,
    exportState: async ({ instanceId }) => ({
      capturedAt: '2026-11-08T12:00:00.000Z',
      state: states[instanceId],
    }),
    kvPrintOrderCount: 13,
    now: fixedTime,
  });
  assert.equal(durableObjects.classes.GiftCertificateGrantDO.instanceCount, 0);
  assert.equal(durableObjects.classes.PrintOrderAuthorityDO.instanceCount, 1);
  const printBytes = await readFile(join(dir, 'durable-objects/PrintOrderAuthorityDO.jsonl'));
  assert.equal(
    durableObjects.classes.PrintOrderAuthorityDO.sha256,
    sha256Hex(printBytes),
  );
  const lines = printBytes.toString().trimEnd().split('\n').map(JSON.parse);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].class, 'PrintOrderAuthorityDO');
  assert.equal(lines[0].instanceId, 'do-print-1');
  assert.equal(lines[0].state.sessionId, 'cs_a');
  assert.equal(durableObjects.reconciliation.PrintOrderAuthorityDO.matched, false);
  assert.match(
    durableObjects.reconciliation.PrintOrderAuthorityDO.finding,
    /census=1 kv_print_order=13/,
  );
  // Sensitive fixture content is fine inside the dump file, but must not
  // appear in the reconciliation/manifest-facing section fields we expose.
  const publicRecon = JSON.stringify(durableObjects.reconciliation);
  assert.ok(!publicRecon.includes(SENSITIVE));
  assert.ok(!publicRecon.includes('pf-a'));
}));

test('matched print-order reconciliation is a null finding', () => {
  assert.deepEqual(
    reconcilePrintOrderAuthority({ censusInstanceCount: 13, kvPrintOrderCount: 13 }),
    {
      censusInstanceCount: 13,
      kvPrintOrderCount: 13,
      matched: true,
      finding: null,
    },
  );
});

test('census selects only slice-2 classes and records empty namespaces honestly', async () => {
  const calls = [];
  const read = async (suffix) => {
    calls.push(suffix);
    if (suffix === '/namespaces') return doFixtures.namespaces;
    if (suffix.includes('/objects')) {
      if (suffix.includes(doFixtures.namespaces.result[1].id)) return doFixtures.printObjects;
      return doFixtures.emptyObjects;
    }
    throw new Error(`unexpected ${suffix}`);
  };
  const census = await censusDurableObjectClasses({ read });
  assert.equal(census.GiftCertificateGrantDO.instances.length, 0);
  assert.equal(census.GiftCertificateGrantDO.namespaceId, doFixtures.namespaces.result[0].id);
  assert.equal(census.PrintOrderAuthorityDO.instances.length, 2);
  assert.equal(census.PrintOrderAuthorityDO.instances[0].id, 'do-print-a');
  assert.ok(calls.some((c) => c.startsWith('/namespaces/')));
  assert.deepEqual(
    selectBackupNamespaces(parseNamespaceList(doFixtures.namespaces)).map((n) => n.className).sort(),
    ['GiftCertificateGrantDO', 'PrintOrderAuthorityDO'],
  );
});

test('reject malformed DO API envelopes without echoing secrets', () => {
  for (const body of [
    null,
    { success: false, errors: [SENSITIVE] },
    { success: true, result: [{ id: 1, class: 'X' }] },
    { success: true, result: [{ id: 'x' }] },
  ]) {
    assert.throws(() => parseNamespaceList(body), { message: 'Invalid Durable Object API response' });
  }
  for (const body of [
    { success: true, result: [{ id: '' }] },
    { success: true, result: [{ id: 'x', hasStoredData: 'yes' }], result_info: { cursor: '' } },
  ]) {
    assert.throws(() => parseObjectsPage(body), { message: 'Invalid Durable Object API response' });
  }
});

test('ops export client is GET-only and fail-closed on 401', async () => {
  const calls = [];
  const client = createOpsExportClient({
    baseUrl: 'https://fixture.invalid',
    adminToken: 'fixture-admin',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401 });
    },
  });
  await assert.rejects(
    () => client({ className: 'GiftCertificateGrantDO', instanceId: 'do-1' }),
    { message: 'Ops export unauthorized' },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers['x-print-admin-token'], 'fixture-admin');
  assert.ok(calls[0].url.includes('class=GiftCertificateGrantDO'));
  assert.ok(!JSON.stringify(calls).includes(SENSITIVE));
});

test('Durable Objects API adapter uses fixed host GET and no redirects', async () => {
  const calls = [];
  const read = createDurableObjectsReader({
    accountId: 'acct',
    apiKey: 'fixture-key',
    email: 'fixture@example.invalid',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify(doFixtures.namespaces));
    },
  });
  assert.deepEqual(await read('/namespaces', true), doFixtures.namespaces);
  for (const { url, options } of calls) {
    assert.equal(new URL(url).hostname, 'api.cloudflare.com');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
  }
  assert.throws(() => createDurableObjectsReader({}), /credentials required/);
});

test('exportSnapshot optional doBackup stage uses .partial rename and owner modes', async () => scratch(async (dir) => {
  const kvRead = async (suffix, json) => {
    if (!json) return Buffer.from('value');
    const url = new URL(suffix, 'https://fixture.invalid');
    const prefix = url.searchParams.get('prefix');
    if (prefix === 'print:order:') return fixtures.print;
    return fixtures.empty;
  };
  const censusRead = async (suffix) => {
    if (suffix === '/namespaces') return doFixtures.namespaces;
    if (suffix.includes(doFixtures.namespaces.result[1].id)) return doFixtures.onePrintObject;
    return doFixtures.emptyObjects;
  };
  const manifest = await exportSnapshot({
    read: kvRead,
    directory: dir,
    now: fixedTime,
    doBackup: {
      censusRead,
      exportState: async ({ instanceId }) => ({
        capturedAt: '2026-11-08T12:00:00.000Z',
        state: instanceId === 'do-print-only'
          ? { sessionId: 'cs_only', printfulOrderId: null, lifecycle: 'unbound', terminalReason: null, terminalEventType: null, revision: 0, updatedAt: 0, seededFromKv: false, alternateDispatchClaim: null }
          : null,
      }),
    },
  });
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.durableObjects.classes.GiftCertificateGrantDO.instanceCount, 0);
  assert.equal(manifest.durableObjects.classes.PrintOrderAuthorityDO.instanceCount, 1);
  assert.equal(manifest.durableObjects.reconciliation.PrintOrderAuthorityDO.kvPrintOrderCount, 1);
  assert.equal(manifest.durableObjects.reconciliation.PrintOrderAuthorityDO.matched, true);
  const [folder] = await readdir(dir);
  assert.equal(folder, 'kv-2026-11-08T12-00-00-000Z');
  assert.ok(!(await readdir(dir)).some((name) => name.endsWith('.partial')));
  const saved = await readFile(join(dir, folder, 'manifest.json'), 'utf8');
  assert.ok(!saved.includes('cs_only'));
  assert.ok(!saved.includes(SENSITIVE));
  assert.equal(manifest.snapshot.sha256, sha256(await readFile(join(dir, folder, 'records.jsonl'))));
  assert.equal(
    (await stat(join(dir, folder, 'durable-objects/GiftCertificateGrantDO.jsonl'))).mode & 0o777,
    0o600,
  );
}));

test('ops export endpoint fail-closed without credentials', async () => {
  process.env.PRINT_ADMIN_TOKEN = 'do-export-test-admin-token';
  fakeCloudflareEnv.current = null;
  const unauthorized = await exportRoute.GET(
    new NextRequest('https://starmapco.test/api/ops/durable-objects/export?class=GiftCertificateGrantDO&instanceId=do-1', {
      method: 'GET',
    }),
  );
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), { ok: false, error: 'Unauthorized' });

  const badClass = await exportRoute.GET(
    new NextRequest('https://starmapco.test/api/ops/durable-objects/export?class=EntitlementAuthorityDO&instanceId=do-1', {
      method: 'GET',
      headers: { 'x-print-admin-token': 'do-export-test-admin-token' },
    }),
  );
  assert.equal(badClass.status, 400);

  const unavailable = await exportRoute.GET(
    new NextRequest('https://starmapco.test/api/ops/durable-objects/export?class=PrintOrderAuthorityDO&instanceId=do-1', {
      method: 'GET',
      headers: { authorization: 'Bearer do-export-test-admin-token' },
    }),
  );
  assert.equal(unavailable.status, 503);

  const sql = new FakePrintSql();
  const authority = new PrintOrderAuthorityDO(fakeCtx(sql), {});
  await authority.bindProviderOrderId('cs_ops', 'pf-ops');
  fakeCloudflareEnv.current = {
    PRINT_ORDER_AUTHORITY: {
      idFromString(id) { return { id }; },
      get() {
        return {
          exportState: () => authority.exportState(),
        };
      },
    },
  };
  const ok = await exportRoute.GET(
    new NextRequest('https://starmapco.test/api/ops/durable-objects/export?class=PrintOrderAuthorityDO&instanceId=do-ops', {
      method: 'GET',
      headers: { 'x-admin-token': 'do-export-test-admin-token' },
    }),
  );
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.ok, true);
  assert.equal(body.class, 'PrintOrderAuthorityDO');
  assert.equal(body.instanceId, 'do-ops');
  assert.equal(body.state.sessionId, 'cs_ops');
  fakeCloudflareEnv.current = null;
});

test('DO_BACKUP_CLASSES covers exactly the slice-2 pair', () => {
  assert.deepEqual(
    DO_BACKUP_CLASSES.map((c) => c.className),
    ['GiftCertificateGrantDO', 'PrintOrderAuthorityDO'],
  );
});
