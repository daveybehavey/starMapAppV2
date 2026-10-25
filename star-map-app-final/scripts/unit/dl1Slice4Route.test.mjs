/**
 * dl1Slice4Route.test.mjs — DL-1 Slice 4 route-level obligations (brief v3
 * §5.6/§5.7/§5.9 + race-evidence Class B), exercised against the REAL
 * route module with the local KV fallback, the serialised in-memory
 * authority client, and the local exclusive-create storage fallback (the
 * repository's own local/test seams — no production surface involved).
 *
 * Class B (§8): two publishers race the fused flow through the real route
 * + the real serialised authority. Exactly one succeeds; the loser's
 * outcome and the single stored winner follow the §5.5 contract. The
 * remaining Class B leg (real DO class under the same race) is covered
 * for state durability in dl1Slice4Publication.test.mjs; the deployed-
 * runtime leg is an outstanding gate item recorded on the PR.
 *
 * Fix round (G-dot conformance verdict 2026-10-24): the protocol sets
 * below run with DL1_AUTHORITY_ROUTING_ENABLED=true — the ON-state
 * new-protocol coverage (area 7 P1). The OFF-state set at the end runs
 * the flag unset/false and covers the preserved legacy flow (upload →
 * legacy-key storage → GET; the archive-ready email dispatch is wired
 * in the legacy handler — source pin (ii) in
 * dl1Slice4Publication.test.mjs; in the local seam the dispatch's
 * archive check is bucket-only, so it resolves skipped exactly as the
 * base flow does locally). Area 9 adds the Class B join-path race
 * (identical bytes through two descriptors); area 7 P2 adds the
 * controlled terminal-success interleaving.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import path from "node:path";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./entitlementAuthority.hooks.mjs", import.meta.url);
register("./dl1S4NextServer.hooks.mjs", import.meta.url);

const RUN = Date.now().toString(36);
process.env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL = "1";
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.STARMAP_KV_DIR = path.join(process.cwd(), ".tmp", `dl1-s4-route-kv-${RUN}`);
process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR = path.join(
  process.cwd(),
  ".tmp",
  `dl1-s4-route-archive-${RUN}`,
);
process.env.DL1_DESCRIPTOR_SIGNING_SECRET = "s4-route-test-secret-0123456789abcdef";
process.env.NEXT_PUBLIC_SITE_URL = "https://starmapco.com";
// ON state (area 7 P1): the protocol sets below are the new-protocol
// coverage; the OFF-state legacy set at the end toggles the flag per
// test and restores it in a finally block. The flag is never set in
// any committed configuration — this is a test-process env only.
process.env.DL1_AUTHORITY_ROUTING_ENABLED = "true";

const { NextRequest } = await import("next/server");
const route = await import("../../src/app/api/download/archive/route.ts");
const { kv, ENTITLEMENT_KV } = await import("../../src/lib/entitlementsStore.ts").then(
  async (store) => ({ ENTITLEMENT_KV: store.ENTITLEMENT_KV, kv: (await import("../../src/lib/kv.ts")).kv }),
);
const identity = await import("../../src/lib/downloadArchiveIdentity.ts");
const pngMod = await import("../../src/lib/pngValidation.ts");
const clientMod = await import("../../src/lib/entitlementAuthority.ts");

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const MAP = "map-route-1";
const RECIPE = {
  version: 1,
  seed: "route-seed",
  datetimeISO: "2026-01-01T00:00:00.000Z",
  location: { name: "Victoria", latitude: 48.4, longitude: -123.4, timezone: "America/Vancouver" },
  textBoxes: [],
  selectedStyle: "classic",
  aspectRatio: "square",
  shape: "rectangle",
  renderOptions: {},
};

let sessionCounter = 0;
async function seedSession() {
  sessionCounter += 1;
  const sessionId = `cs_route_${RUN}_${sessionCounter}`;
  const token = `tok_route_${RUN}_${sessionCounter}`;
  await kv.set(ENTITLEMENT_KV.stripeSession(sessionId), {
    paid: true,
    mapId: MAP,
    created: Date.now(),
  });
  await kv.set(ENTITLEMENT_KV.claim(token), { sessionId, mapId: MAP });
  await kv.set(ENTITLEMENT_KV.mapRecipe(MAP), RECIPE);
  return { sessionId, token };
}

const url = (token) =>
  `https://starmapco.com/api/download/archive${token ? `?token=${token}` : ""}`;

function jsonPost(token, body, headers = {}) {
  return new NextRequest(url(token), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngMod.pngCrc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A structurally valid 6000×6000 RGBA PNG (filter-0 rows). `fill` varies
 * the body so distinct publishers produce distinct digests. */
function bigPng(fill = 0) {
  const rowLength = 1 + 6000 * 4;
  const rows = Buffer.alloc(6000 * rowLength);
  if (fill) rows.fill(fill, 1, 1 + 6000 * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(6000, 0);
  ihdr.writeUInt32BE(6000, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rows, { level: 1 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function uploadPost(token, bytes, headers = {}) {
  return new NextRequest(url(token), {
    method: "POST",
    headers: { "content-type": "image/png", ...headers },
    body: bytes,
  });
}

const client = clientMod.createEntitlementAuthorityClient();

test("identify I-5: fresh artifact → identified + descriptor naming the derived identity", async () => {
  const { sessionId, token } = await seedSession();
  const res = await route.POST(jsonPost(token, { op: "identify", mapId: MAP }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.state, "identified");
  const derived = identity.deriveArtifactIdentity({ sessionId, mapId: MAP, recipe: RECIPE });
  assert.equal(body.artifactId, derived.artifactId);
  const verified = identity.verifyPrepareDescriptor(body.descriptor, {
    now: Date.now(),
    sessionId,
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.payload.mapId, MAP);
});

test("descriptor upload → finalized; identify afterwards → I-1 already_finalized; fused re-POST of the same bytes → legacy success shape", async () => {
  const { sessionId, token } = await seedSession();
  const identifyRes = await route.POST(jsonPost(token, { op: "identify", mapId: MAP }));
  const { descriptor, artifactId } = await identifyRes.json();
  const bytes = bigPng(0);
  const uploadRes = await route.POST(
    uploadPost(token, bytes, { "x-prepare-descriptor": descriptor }),
  );
  assert.equal(uploadRes.status, 200);
  const uploadBody = await uploadRes.json();
  assert.equal(uploadBody.state, "finalized");
  assert.equal(uploadBody.artifactId, artifactId);

  const after = await route.POST(jsonPost(token, { op: "identify", mapId: MAP }));
  const afterBody = await after.json();
  assert.equal(afterBody.state, "already_finalized");
  assert.equal(afterBody.descriptor, undefined);

  const repost = await route.POST(uploadPost(token, bytes));
  assert.equal(repost.status, 200);
  const repostBody = await repost.json();
  assert.deepEqual(Object.keys(repostBody).sort(), ["bytes", "ok", "sessionId"]);
  assert.equal(repostBody.sessionId, sessionId);
  assert.equal(repostBody.bytes, bytes.length);
});

test("fused re-POST with DIFFERENT bytes against a finalized artifact → 409, never success, winner retained", async () => {
  const { sessionId, token } = await seedSession();
  const winner = bigPng(0);
  const first = await route.POST(uploadPost(token, winner));
  assert.equal(first.status, 200);
  const challenger = bigPng(7);
  const second = await route.POST(uploadPost(token, challenger));
  assert.equal(second.status, 409);
  const state = await client.getState(sessionId);
  const entries = Object.values(state.artifactRegistry);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].digest, sha(winner));
});

test("identify I-3: live governing intent, object absent → finalization_pending + fresh descriptor + upload recovery", async () => {
  const { sessionId, token } = await seedSession();
  const derived = identity.deriveArtifactIdentity({ sessionId, mapId: MAP, recipe: RECIPE });
  await client.apply(sessionId, {
    type: "register_publication_intent",
    intent: {
      intentId: "aa".repeat(16),
      artifactKey: derived.artifactId,
      sessionId,
      mapId: MAP,
      canonicalBinding: derived.canonicalBinding,
      fingerprint: derived.fingerprint,
      contractVersion: 1,
      rendererVersion: 1,
      digest: sha("not-yet-stored"),
      stagingKey: identity.buildStagingKey("aa".repeat(16)),
      expectedWidth: 6000,
      expectedHeight: 6000,
      expiresAt: Date.now() + 600_000,
    },
    now: Date.now(),
  });
  const res = await route.POST(jsonPost(token, { op: "identify", mapId: MAP }));
  const body = await res.json();
  assert.equal(body.state, "finalization_pending");
  assert.equal(body.recovery, "upload");
  assert.ok(body.descriptor);
});

test("identify I-4: live governing intent, object present → finalization_pending + reconcile recovery, NO descriptor", async () => {
  const { sessionId, token } = await seedSession();
  const derived = identity.deriveArtifactIdentity({ sessionId, mapId: MAP, recipe: RECIPE });
  const bytes = bigPng(3);
  const storage = await import("../../src/lib/downloadArchiveStorage.ts");
  const promoted = await storage.promoteArtifactCreateOnly(derived.finalKey, bytes, {
    protocol: "dl1-archive-v1",
    artifactKey: derived.artifactId,
    digest: sha(bytes),
    bindingDigest: sha(derived.canonicalBinding),
  });
  assert.equal(promoted.outcome, "created");
  await client.apply(sessionId, {
    type: "register_publication_intent",
    intent: {
      intentId: "bb".repeat(16),
      artifactKey: derived.artifactId,
      sessionId,
      mapId: MAP,
      canonicalBinding: derived.canonicalBinding,
      fingerprint: derived.fingerprint,
      contractVersion: 1,
      rendererVersion: 1,
      digest: sha(bytes),
      stagingKey: identity.buildStagingKey("bb".repeat(16)),
      expectedWidth: 6000,
      expectedHeight: 6000,
      expiresAt: Date.now() + 600_000,
    },
    now: Date.now(),
  });
  const res = await route.POST(jsonPost(token, { op: "identify", mapId: MAP }));
  const body = await res.json();
  assert.equal(body.state, "finalization_pending");
  assert.equal(body.recovery, "reconcile");
  assert.equal(body.descriptor, undefined);
  // …and reconcile finalizes it (the I-4 recovery path).
  const rec = await route.POST(jsonPost(token, { op: "reconcile", artifactId: derived.artifactId }));
  assert.equal(rec.status, 200);
  assert.equal((await rec.json()).state, "finalized");
});

test("identify I-2: conflicted registry entry → 409 publication_conflict", async () => {
  const { sessionId, token } = await seedSession();
  const derived = identity.deriveArtifactIdentity({ sessionId, mapId: MAP, recipe: RECIPE });
  await client.apply(sessionId, {
    type: "register_publication_intent",
    intent: {
      intentId: "cc".repeat(16),
      artifactKey: derived.artifactId,
      sessionId,
      mapId: MAP,
      canonicalBinding: derived.canonicalBinding,
      fingerprint: derived.fingerprint,
      contractVersion: 1,
      rendererVersion: 1,
      digest: sha("governing-bytes"),
      stagingKey: identity.buildStagingKey("cc".repeat(16)),
      expectedWidth: 6000,
      expectedHeight: 6000,
      expiresAt: Date.now() + 600_000,
    },
    now: Date.now(),
  });
  const fin = await client.apply(sessionId, {
    type: "finalize_publication",
    artifactKey: derived.artifactId,
    intentId: "cc".repeat(16),
    generation: 1,
    observation: {
      finalObjectPresent: true,
      finalMetadata: {
        protocol: "dl1-archive-v1",
        artifactKey: derived.artifactId,
        digest: sha("other-bytes"),
        bindingDigest: sha(derived.canonicalBinding),
      },
      bodyVerifiedDigest: sha("other-bytes"),
    },
    now: Date.now(),
  });
  assert.equal(fin.outcome, "publication_conflicted");
  const res = await route.POST(jsonPost(token, { op: "identify", mapId: MAP }));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, "publication_conflict");
});

test("descriptor classification: bad signature → 401; expired → 401; identity mismatch → 409 prepare_stale", async () => {
  const { sessionId, token } = await seedSession();
  const issued = identity.issuePrepareDescriptor({
    sessionId,
    mapId: MAP,
    fingerprint: identity.fingerprintForBinding(
      identity.canonicalBindingForRecipe(RECIPE),
    ),
    now: Date.now(),
    descriptorId: "dd".repeat(16),
  });
  const bytes = bigPng(0);
  const tampered = issued.descriptor.slice(0, -2) + "zz";
  const badSig = await route.POST(
    uploadPost(token, bytes, { "x-prepare-descriptor": tampered }),
  );
  assert.equal(badSig.status, 401);

  const stale = identity.issuePrepareDescriptor({
    sessionId,
    mapId: MAP,
    fingerprint: "f".repeat(64), // not the derived fingerprint for this map
    now: Date.now(),
    descriptorId: "ee".repeat(16),
  });
  const staleRes = await route.POST(
    uploadPost(token, bytes, { "x-prepare-descriptor": stale.descriptor }),
  );
  assert.equal(staleRes.status, 409);
  assert.equal((await staleRes.json()).error, "prepare_stale");

  const expired = identity.issuePrepareDescriptor({
    sessionId,
    mapId: MAP,
    fingerprint: identity.fingerprintForBinding(identity.canonicalBindingForRecipe(RECIPE)),
    now: Date.now() - 2 * identity.DESCRIPTOR_TTL_MS,
    descriptorId: "ff".repeat(16),
  });
  const expiredRes = await route.POST(
    uploadPost(token, bytes, { "x-prepare-descriptor": expired.descriptor }),
  );
  assert.equal(expiredRes.status, 401);
});

test("upload validation: wrong-dimension PNG → 422 with NO staging write, intent, or registry entry (§5.10 order)", async () => {
  const { sessionId, token } = await seedSession();
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(4, 0);
  ihdr.writeUInt32BE(3, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const small = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.alloc(3 * (1 + 4 * 4)))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  const res = await route.POST(uploadPost(token, small));
  assert.equal(res.status, 422);
  const state = await client.getState(sessionId);
  assert.deepEqual(Object.keys(state.publicationIntents), []);
  assert.deepEqual(Object.keys(state.artifactRegistry), []);
  const nonPng = await route.POST(
    new NextRequest(url(token), {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    }),
  );
  assert.equal(nonPng.status, 415);
});

test("cookie resolver (§5.6): cookie + matching Origin identifies; foreign/missing Origin → 401; token present governs over cookie", async () => {
  const a = await seedSession();
  const b = await seedSession();
  const cookieReq = (sessionId, origin) =>
    new NextRequest(url(""), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `starmap_premium=${sessionId}`,
        ...(origin ? { origin } : {}),
      },
      body: JSON.stringify({ op: "identify", mapId: MAP }),
    });
  const okRes = await route.POST(cookieReq(a.sessionId, "https://starmapco.com"));
  assert.equal(okRes.status, 200);
  const foreign = await route.POST(cookieReq(a.sessionId, "https://evil.example.com"));
  assert.equal(foreign.status, 401);
  const missing = await route.POST(cookieReq(a.sessionId, null));
  assert.equal(missing.status, 401);
  // Token governs: cookie names session B, token names session A → A's artifact.
  const both = new NextRequest(url(a.token), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `starmap_premium=${b.sessionId}`,
      origin: "https://starmapco.com",
    },
    body: JSON.stringify({ op: "identify", mapId: MAP }),
  });
  const bothRes = await route.POST(both);
  const bothBody = await bothRes.json();
  const derivedA = identity.deriveArtifactIdentity({
    sessionId: a.sessionId,
    mapId: MAP,
    recipe: RECIPE,
  });
  assert.equal(bothBody.artifactId, derivedA.artifactId);
});

test("Class B: two publishers race the fused flow with distinct bodies — exactly one 200; the stored object + registry name the winner; the loser's bytes appear nowhere", async () => {
  const { sessionId, token } = await seedSession();
  const bytesA = bigPng(0);
  const bytesB = bigPng(9);
  const [ra, rb] = await Promise.all([
    route.POST(uploadPost(token, bytesA)),
    route.POST(uploadPost(token, bytesB)),
  ]);
  const statuses = [ra.status, rb.status].sort();
  assert.deepEqual(statuses, [200, 409]);
  const winnerBytes = ra.status === 200 ? bytesA : bytesB;
  const state = await client.getState(sessionId);
  const entries = Object.values(state.artifactRegistry);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].state, "finalized");
  assert.equal(entries[0].digest, sha(winnerBytes));
  assert.equal(Object.keys(state.publicationIntents).length, 1);
  // The stored final object's bytes are the winner's.
  const derived = identity.deriveArtifactIdentity({ sessionId, mapId: MAP, recipe: RECIPE });
  const storage = await import("../../src/lib/downloadArchiveStorage.ts");
  const stored = await storage.getArtifactObject(derived.finalKey);
  assert.equal(sha(stored.bytes), sha(winnerBytes));
});

test("Class B (join path, area 9): two publishers race the DESCRIPTOR flow with IDENTICAL bytes — both succeed; exactly one intent; the single entry names the shared digest", async () => {
  const { sessionId, token } = await seedSession();
  // Two descriptors for the same artifact (two I-5 identify calls —
  // identify itself registers nothing).
  const id1 = await (await route.POST(jsonPost(token, { op: "identify", mapId: MAP }))).json();
  const id2 = await (await route.POST(jsonPost(token, { op: "identify", mapId: MAP }))).json();
  assert.ok(id1.descriptor && id2.descriptor);
  assert.notEqual(id1.descriptor, id2.descriptor);
  const bytes = bigPng(0);
  const [ra, rb] = await Promise.all([
    route.POST(uploadPost(token, bytes, { "x-prepare-descriptor": id1.descriptor })),
    route.POST(uploadPost(token, bytes, { "x-prepare-descriptor": id2.descriptor })),
  ]);
  assert.equal(ra.status, 200);
  assert.equal(rb.status, 200);
  const states = [(await ra.json()).state, (await rb.json()).state].sort();
  assert.deepEqual(states, ["already_finalized", "finalized"]);
  const state = await client.getState(sessionId);
  // Same-digest orchestration invariants: exactly ONE intent is ever
  // recorded (the second registration joins it — R6 — or, if it lands
  // after finalization, is answered from the finalized entry — R3; the
  // join record exists exactly in the former interleaving, so its
  // count is asserted as at most one here and exactly one in the
  // deterministic join-path test below).
  assert.equal(Object.keys(state.publicationIntents).length, 1);
  assert.ok(Object.keys(state.publicationIntentJoins).length <= 1);
  const entries = Object.values(state.artifactRegistry);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].state, "finalized");
  assert.equal(entries[0].digest, sha(bytes));
  const derived = identity.deriveArtifactIdentity({ sessionId, mapId: MAP, recipe: RECIPE });
  const storage = await import("../../src/lib/downloadArchiveStorage.ts");
  const stored = await storage.getArtifactObject(derived.finalKey);
  assert.equal(sha(stored.bytes), sha(bytes));
});

test("Class B (join path, deterministic): a second descriptor's upload JOINS the governing intent through the real route — join record persisted with the governing pair; both publishers succeed", async () => {
  const { sessionId, token } = await seedSession();
  const derived = identity.deriveArtifactIdentity({ sessionId, mapId: MAP, recipe: RECIPE });
  const bytes = bigPng(0);
  // Governor: descriptor 1's intent pre-registered at the authority
  // seam (the I-3/I-4 pattern) — descriptor 2's route upload is then
  // evaluated against a live governing intent with the SAME digest.
  const issued2 = identity.issuePrepareDescriptor({
    sessionId,
    mapId: MAP,
    fingerprint: derived.fingerprint,
    now: Date.now(),
    descriptorId: "22".repeat(16),
  });
  assert.ok(issued2);
  const regGov = await client.apply(sessionId, {
    type: "register_publication_intent",
    intent: {
      intentId: "11".repeat(16),
      artifactKey: derived.artifactId,
      sessionId,
      mapId: MAP,
      canonicalBinding: derived.canonicalBinding,
      fingerprint: derived.fingerprint,
      contractVersion: 1,
      rendererVersion: 1,
      digest: sha(bytes),
      stagingKey: identity.buildStagingKey("11".repeat(16)),
      expectedWidth: 6000,
      expectedHeight: 6000,
      expiresAt: Date.now() + 600_000,
    },
    now: Date.now(),
  });
  assert.equal(regGov.outcome, "publication_intent_recorded");
  // The joiner's upload through the real route: registers as a JOIN
  // (R6), promotes (creates the object — the governor never uploaded),
  // and its finalize lands the entry (F6 over the governing intent).
  const res = await route.POST(
    uploadPost(token, bytes, { "x-prepare-descriptor": issued2.descriptor }),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).state, "finalized");
  const state = await client.getState(sessionId);
  assert.equal(Object.keys(state.publicationIntents).length, 1);
  const joins = Object.values(state.publicationIntentJoins);
  assert.equal(joins.length, 1);
  assert.equal(joins[0].intentId, "22".repeat(16));
  assert.equal(joins[0].governingIntentId, "11".repeat(16));
  assert.equal(joins[0].digest, sha(bytes));
  const entries = Object.values(state.artifactRegistry);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].state, "finalized");
  assert.equal(entries[0].digest, sha(bytes));
  const storage = await import("../../src/lib/downloadArchiveStorage.ts");
  const stored = await storage.getArtifactObject(derived.finalKey);
  assert.equal(sha(stored.bytes), sha(bytes));
});

test("terminal-success comparison (area 7 P2 / CB-P2a): a requester whose retained intent lapses mid-flight while a successor takes governance gets 409, never success", async () => {
  const { sessionId, token } = await seedSession();
  const derived = identity.deriveArtifactIdentity({ sessionId, mapId: MAP, recipe: RECIPE });
  const storage = await import("../../src/lib/downloadArchiveStorage.ts");
  const bytesA = bigPng(0);
  const bytesB = bigPng(9);
  // The requester's descriptor: signed expiry ~200 ms out — live at
  // classification (request start), lapsed by the time its counted
  // read + 6000×6000 validation completes and its register applies.
  const issued = identity.issuePrepareDescriptor({
    sessionId,
    mapId: MAP,
    fingerprint: derived.fingerprint,
    now: Date.now(),
    ttlMs: 200,
    descriptorId: "ab".repeat(16),
  });
  assert.ok(issued);
  // Its retained intent (digest A) recorded with the descriptor's
  // signed expiry — the R1 replay target.
  const regA = await client.apply(sessionId, {
    type: "register_publication_intent",
    intent: {
      intentId: "ab".repeat(16),
      artifactKey: derived.artifactId,
      sessionId,
      mapId: MAP,
      canonicalBinding: derived.canonicalBinding,
      fingerprint: derived.fingerprint,
      contractVersion: 1,
      rendererVersion: 1,
      digest: sha(bytesA),
      stagingKey: identity.buildStagingKey("ab".repeat(16)),
      expectedWidth: 6000,
      expectedHeight: 6000,
      expiresAt: issued.payload.expiresAt,
    },
    now: Date.now(),
  });
  assert.equal(regA.outcome, "publication_intent_recorded");
  // Fire the requester's upload (do not await yet).
  const requesterPromise = route.POST(
    uploadPost(token, bytesA, { "x-prepare-descriptor": issued.descriptor }),
  );
  // After the lapse, the successor registers (R7 — governance moves)
  // and promotes its bytes; its finalize is held until the requester's
  // staging write is observed (the requester's registry state read has
  // already happened by then, so the entry cannot predate it).
  await new Promise((r) => setTimeout(r, 300));
  const regB = await client.apply(sessionId, {
    type: "register_publication_intent",
    intent: {
      intentId: "cd".repeat(16),
      artifactKey: derived.artifactId,
      sessionId,
      mapId: MAP,
      canonicalBinding: derived.canonicalBinding,
      fingerprint: derived.fingerprint,
      contractVersion: 1,
      rendererVersion: 1,
      digest: sha(bytesB),
      stagingKey: identity.buildStagingKey("cd".repeat(16)),
      expectedWidth: 6000,
      expectedHeight: 6000,
      expiresAt: Date.now() + 600_000,
    },
    now: Date.now(),
  });
  assert.equal(regB.outcome, "publication_intent_recorded");
  const promoted = await storage.promoteArtifactCreateOnly(derived.finalKey, bytesB, {
    protocol: "dl1-archive-v1",
    artifactKey: derived.artifactId,
    digest: sha(bytesB),
    bindingDigest: sha(derived.canonicalBinding),
  });
  assert.equal(promoted.outcome, "created");
  const { existsSync } = await import("node:fs");
  // The canonical local mapping (fix round 2, area 6): SHA-256 hex of
  // the key, in a two-hex-char shard directory.
  const stagingHash = sha(identity.buildStagingKey("ab".repeat(16)));
  const stagingPath = path.join(
    process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR,
    stagingHash.slice(0, 2),
    stagingHash,
  );
  const deadline = Date.now() + 10_000;
  while (!existsSync(stagingPath) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.ok(existsSync(stagingPath), "requester staging write observed (premise: its state read already happened)");
  const finBPromise = client.apply(sessionId, {
    type: "finalize_publication",
    artifactKey: derived.artifactId,
    intentId: "cd".repeat(16),
    generation: regB.publication.generation,
    observation: {
      finalObjectPresent: true,
      finalMetadata: {
        protocol: "dl1-archive-v1",
        artifactKey: derived.artifactId,
        digest: sha(bytesB),
        bindingDigest: sha(derived.canonicalBinding),
      },
      bodyVerifiedDigest: sha(bytesB),
    },
    now: Date.now(),
  });
  const [res, finB] = await Promise.all([requesterPromise, finBPromise]);
  // Whichever finalize call mints/observes the entry (F6 on the
  // requester's own call, or F1 already-finalized via the successor's),
  // the entry names digest B — the requester's digest was never stored,
  // so its answer is the conflict, never a success shape.
  assert.ok(["publication_finalized", "publication_already_finalized"].includes(finB.outcome));
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, "publication_conflict");
  const state = await client.getState(sessionId);
  const entries = Object.values(state.artifactRegistry);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].state, "finalized");
  assert.equal(entries[0].digest, sha(bytesB));
  const stored = await storage.getArtifactObject(derived.finalKey);
  assert.equal(sha(stored.bytes), sha(bytesB));
});

/* ---------------- OFF state: the preserved legacy flow (area 7 P1) ---------------- */

test("OFF state (flag unset): POST is the base legacy flow — descriptorless upload → legacy-key storage → GET serves the bytes; a re-upload overwrites; no authority state is touched", async () => {
  delete process.env.DL1_AUTHORITY_ROUTING_ENABLED;
  try {
    const { sessionId, token } = await seedSession();
    const bytes = bigPng(0);
    const res = await route.POST(uploadPost(token, bytes));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ["bytes", "ok", "sessionId"]); // the base success shape
    assert.equal(body.sessionId, sessionId);
    assert.equal(body.bytes, bytes.length);
    // GET serves exactly the uploaded bytes (the legacy key the GET reads).
    const get = await route.GET(new NextRequest(url(token), { method: "GET" }));
    assert.equal(get.status, 200);
    assert.deepEqual(Buffer.from(await get.arrayBuffer()), bytes);
    // Legacy put semantics: a second upload OVERWRITES (no create-only
    // promotion, no publication protocol).
    const bytes2 = bigPng(5);
    const res2 = await route.POST(uploadPost(token, bytes2));
    assert.equal(res2.status, 200);
    const get2 = await route.GET(new NextRequest(url(token), { method: "GET" }));
    assert.equal(get2.status, 200);
    assert.deepEqual(Buffer.from(await get2.arrayBuffer()), bytes2);
    // The legacy flow creates no authority publication state.
    const state = await client.getState(sessionId);
    assert.deepEqual(Object.keys(state.publicationIntents ?? {}), []);
    assert.deepEqual(Object.keys(state.publicationIntentJoins ?? {}), []);
    assert.deepEqual(Object.keys(state.artifactRegistry ?? {}), []);
  } finally {
    process.env.DL1_AUTHORITY_ROUTING_ENABLED = "true";
  }
});

test("OFF state (flag 'false'): JSON ops are not the protocol (base 415), and a descriptor header does not divert the legacy flow", async () => {
  process.env.DL1_AUTHORITY_ROUTING_ENABLED = "false";
  try {
    const { sessionId, token } = await seedSession();
    // Base POST: a JSON content-type is refused 415 (token + session first).
    const json = await route.POST(jsonPost(token, { op: "identify", mapId: MAP }));
    assert.equal(json.status, 415);
    // A descriptor header changes nothing while OFF: the upload is the
    // legacy flow and lands at the legacy key.
    const bytes = bigPng(0);
    const res = await route.POST(
      uploadPost(token, bytes, { "x-prepare-descriptor": "not-a-real-descriptor" }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.sessionId, sessionId);
    assert.equal(body.bytes, bytes.length);
    const get = await route.GET(new NextRequest(url(token), { method: "GET" }));
    assert.equal(get.status, 200);
    assert.deepEqual(Buffer.from(await get.arrayBuffer()), bytes);
  } finally {
    process.env.DL1_AUTHORITY_ROUTING_ENABLED = "true";
  }
});
