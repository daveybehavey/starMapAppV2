import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KEYSPACES, parseListPage, createReader, exportSnapshot, sha256 } from '../export-kv-backup.mjs';
const fixtures = JSON.parse(await readFile(new URL('./fixtures/kv-backup/pages.json', import.meta.url), 'utf8'));
const fixedTime = () => new Date('2026-11-04T00:00:00.000Z');
const sensitive = 'synthetic-token customer@example.invalid download-key';

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
    if (prefix === 'map:') return fixtures.map;
    if (prefix === 'gift-cert:') return fixtures.gift;
    return fixtures.empty;
  };
}

test('KEYSPACES is exactly the six backup prefixes; account and checkout_timing stay excluded', () => {
  assert.deepEqual([...KEYSPACES], [
    'stripe:', 'claim:', 'entitlement:', 'print:order:', 'map:', 'gift-cert:',
  ]);
  assert.ok(!KEYSPACES.includes('account:'));
  assert.ok(!KEYSPACES.includes('checkout_timing:'));
});

test('fixture pagination, exact bytes, metadata, expiration, checksums and private manifest', async () => scratch(async dir => {
  const calls = [];
  const manifest = await exportSnapshot({ read: fixtureReader(calls), directory: dir, now: fixedTime });
  const [folder] = await readdir(dir);
  assert.equal(folder, 'kv-2026-11-04T00-00-00-000Z');
  const bytes = await readFile(join(dir, folder, 'records.jsonl'));
  const records = bytes.toString().trimEnd().split('\n').map(JSON.parse);
  assert.equal(records.length, 7);
  assert.equal(manifest.recordCount, 7);
  assert.deepEqual(manifest.counts, Object.fromEntries(KEYSPACES.map((p, i) => [p, [2, 1, 0, 1, 1, 2][i]])));
  assert.equal(manifest.snapshot.sha256, sha256(bytes));
  assert.equal(manifest.snapshot.bytes, bytes.length);
  assert.equal(Buffer.from(records[0].valueBase64, 'base64').toString(), sensitive + '\u0000\ufffd');
  assert.deepEqual(records[0].metadata, { fixture: true });
  assert.equal(records[0].expiration, 2000000000);
  assert.equal(Object.hasOwn(records[1], 'expiration'), false);
  const mapRecord = records.find(r => r.key === 'map:fixture-recipe');
  assert.equal(mapRecord.expiration, 2000001000);
  assert.ok(records.some(r => r.key === 'gift-cert:code:fixturehash'));
  assert.ok(records.some(r => r.key === 'gift-cert:session:fixture-1'));
  assert.ok(calls.some(c => c.suffix.includes('cursor=next%2Fpage')));
  assert.ok(calls.some(c => c.suffix === '/values/claim%3Asynthetic-token'));
  assert.ok(calls.some(c => c.suffix.includes('prefix=map%3A')));
  assert.ok(calls.some(c => c.suffix.includes('prefix=gift-cert%3A')));
  const saved = await readFile(join(dir, folder, 'manifest.json'), 'utf8');
  assert.deepEqual(JSON.parse(saved), manifest);
  for (const secret of [sensitive, 'synthetic-token', 'customer@example.invalid', 'download-key']) assert.ok(!saved.includes(secret));
  assert.equal((await stat(join(dir, folder, 'records.jsonl'))).mode & 0o777, 0o600);
  await assert.rejects(exportSnapshot({ read: fixtureReader([]), directory: dir, now: fixedTime }));
  assert.deepEqual(await readdir(dir), [folder]);
}));

test('reject malformed/unscoped list entries and error envelopes without echoing records', () => {
  for (const [body, prefix] of [
    [null, 'stripe:'],
    [{ success: false, errors: [sensitive] }, 'stripe:'],
    [{ ...fixtures.empty, result_info: {} }, 'stripe:'],
    [{ ...fixtures.first, result: [{ name: 'other:secret' }] }, 'stripe:'],
    [{ ...fixtures.first, result: [{ name: 'stripe:x', expiration: -1 }] }, 'stripe:'],
    [{ ...fixtures.first, result: [{ name: 'stripe:x', metadata: 'bad' }] }, 'stripe:'],
    [{ ...fixtures.map, result: [{ name: 'map:x', expiration: -1 }] }, 'map:'],
    [{ ...fixtures.gift, result: [{ name: 'other:gift' }] }, 'gift-cert:'],
  ]) {
    assert.throws(() => parseListPage(body, prefix), { message: 'Invalid KV response' });
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
  assert.deepEqual(manifest.counts, Object.fromEntries(KEYSPACES.map(p => [p, 0])));
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
