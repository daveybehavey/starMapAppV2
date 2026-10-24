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
