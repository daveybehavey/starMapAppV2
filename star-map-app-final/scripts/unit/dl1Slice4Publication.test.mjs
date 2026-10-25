/**
 * dl1Slice4Publication.test.mjs — DL-1 Slice 4: artifact identity /
 * prepare-descriptor authority (brief v3 §8 obligations, as amended by
 * v3.1 A-1/A-2/A-3, pointer P-4, v3.2 V-1/V-3/V-5/V-6/V-7/V-8/V-10/V-11,
 * and v3.3 W-1/W-2).
 *
 * Coverage named against the brief:
 * - identity + keying vectors, contract-v1 vectors, two-maps-one-session,
 *   key-length bounds (§5.1/§5.8 budget computed from constants);
 * - descriptor set (bad signature / expired / session mismatch →
 *   identity_rejected) incl. W-1's three expiry-relation cases;
 * - §5.10 validation set (garbage IDAT with valid CRCs, bad CRC, trailing
 *   bytes, wrong dims/features, counted-read boundary);
 * - transition-table coverage: R0, R1, R2, JN1, JN2, R3–R7, F1–F8 named
 *   per test; expiry executability + F5→R7→F6 chain; determination
 *   coverage; collision in terminal/expired cases (A-1/A-2/A-3);
 * - join permanence (N4) + V-1 coexistence + V-11.4 post-promotion state;
 * - pointer maintenance (P-4: maintenance sequence, SEAM-2, both T34
 *   orderings, expiry/finalization never move it);
 * - email claim/record mechanism (N5 bound at the machine, V-10
 *   generation fencing), V-11.3 alert saturation;
 * - purity fence; validator rules 1–9;
 * - race evidence Class A (serialized client + V-11.1 history/fold),
 *   Class C (faithful fake R2), U-P2 boundary test;
 * - source pins (i)–(v).
 * Class B and the route-level sets live in dl1Slice4Route.test.mjs; the
 * two §8 integration proofs (real R2 binding, deployed runtime) require a
 * non-production deploy and are recorded as outstanding on the PR.
 *
 * Fix round (G-dot conformance verdict 2026-10-24, BLOCK at af198d5):
 * area 3 — R1 replay comparison rebuilt from the persisted intent;
 * area 5 — issuance requires the CURRENT secret (previous is
 * verification-only), with current-absent / current-unusable controls;
 * area 6 — local promotion is atomic (temp + link), overlap-covered;
 * area 9 — the Class A fold test folds the authority-side commit
 * history with per-position outcomes. Areas 7/8 live in the route /
 * pngValidation + the step-1 harness (remeasurement recorded in the
 * program record dl1-s4-step1-fixround-addendum-2026-10-24.md).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);
register("./entitlementAuthority.hooks.mjs", import.meta.url);

process.env.STARMAP_ENTITLEMENT_AUTHORITY_LOCAL = "1";
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.DL1_DESCRIPTOR_SIGNING_SECRET = "s4-test-signing-secret-0123456789abcdef";

const identity = await import("../../src/lib/downloadArchiveIdentity.ts");
const png = await import("../../src/lib/pngValidation.ts");
const sm = await import("../../src/lib/entitlementAuthorityState.ts");
const storage = await import("../../src/lib/downloadArchiveStorage.ts");
const clientMod = await import("../../src/lib/entitlementAuthority.ts");
const { EntitlementAuthorityDO } = await import(
  "../../src/durable-objects/EntitlementAuthorityDO.ts"
);

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const SID = "cs_test_s4_session";
const MAP = "map-s4-0001";
const MAP2 = "map-s4-0002";
const sha = (s) => createHash("sha256").update(s).digest("hex");
const DIGEST_A = sha("artifact-bytes-a");
const DIGEST_B = sha("artifact-bytes-b");
const DESC_1 = "11".repeat(16);
const DESC_2 = "22".repeat(16);
const DESC_3 = "33".repeat(16);
const DESC_4 = "44".repeat(16);

const recipe = (over = {}) => ({
  version: 1,
  seed: "seed-1",
  datetimeISO: "2026-01-01T00:00:00.000Z",
  location: { name: "Victoria", latitude: 48.4, longitude: -123.4, timezone: "America/Vancouver" },
  textBoxes: [{ text: "Hello", size: 42, fontFamily: "serif", color: "#fff", align: "center" }],
  selectedStyle: "classic",
  aspectRatio: "square",
  shape: "rectangle",
  renderOptions: {},
  ...over,
});

const BINDING = identity.canonicalBindingForRecipe(recipe());
const FINGERPRINT = identity.fingerprintForBinding(BINDING);
const ARTIFACT = identity.buildArtifactId({ sessionId: SID, mapId: MAP, fingerprint: FINGERPRINT });
const DIMS = identity.expectedDimensionsForBinding(BINDING);

function intentInput(over = {}) {
  return {
    intentId: DESC_1,
    artifactKey: ARTIFACT,
    sessionId: SID,
    mapId: MAP,
    canonicalBinding: BINDING,
    fingerprint: FINGERPRINT,
    contractVersion: 1,
    rendererVersion: 1,
    digest: DIGEST_A,
    stagingKey: identity.buildStagingKey(over.intentId ?? DESC_1),
    expectedWidth: DIMS.expectedWidth,
    expectedHeight: DIMS.expectedHeight,
    expiresAt: NOW + 600_000,
    ...over,
  };
}

const s0 = () => sm.createEmptyEntitlementAuthorityState(SID);
const reg = (state, over = {}, now = NOW) =>
  sm.applyEntitlementAuthorityOp(state, {
    type: "register_publication_intent",
    intent: intentInput(over),
    now,
  });
const fin = (state, over = {}, now = NOW) =>
  sm.applyEntitlementAuthorityOp(state, {
    type: "finalize_publication",
    artifactKey: ARTIFACT,
    intentId: DESC_1,
    generation: 1,
    observation: { finalObjectPresent: false, finalMetadata: null, bodyVerifiedDigest: null },
    ...over,
    now,
  });
const trustedMetadata = (digest, binding = BINDING) => ({
  protocol: "dl1-archive-v1",
  artifactKey: ARTIFACT,
  digest,
  bindingDigest: sha(binding),
});
const accountingSurface = (state) =>
  JSON.stringify({
    baseline: state.baseline,
    ownedFiles: state.ownedFiles,
    rewardBucketBalance: state.rewardBucketBalance,
    rewardGrantedTotal: state.rewardGrantedTotal,
    rewardSpentTotal: state.rewardSpentTotal,
    rewardClawedTotal: state.rewardClawedTotal,
    rewardGrants: state.rewardGrants,
    recoveryDecision: state.recoveryDecision,
    capabilityGeneration: state.capabilityGeneration,
    journalHead: state.journalHead ?? 0,
  });

/* ------------------------------ identity ------------------------------ */

test("identity: contract-v1 vector — fixed recipe → fixed binding → fixed fingerprint", () => {
  const expectedBinding = JSON.stringify({
    version: 1,
    seed: "seed-1",
    datetimeISO: "2026-01-01T00:00:00.000Z",
    location: { name: "Victoria", latitude: 48.4, longitude: -123.4, timezone: "America/Vancouver" },
    textBoxes: [{ text: "Hello", size: 42, fontFamily: "serif", color: "#fff", align: "center" }],
    selectedStyle: "classic",
    aspectRatio: "square",
    shape: "rectangle",
    renderOptions: {},
  });
  assert.equal(BINDING, expectedBinding);
  assert.equal(FINGERPRINT, sha(expectedBinding));
  assert.equal(ARTIFACT, `hd1:${SID}:${MAP}:${FINGERPRINT}:c1:r1`);
});

test("identity: dimension table verified for all four aspects (§5.1/OQ-2)", () => {
  const heights = { square: 6000, "3:4": 8000, "2:3": 9000, "4:5": 7500 };
  for (const [aspect, height] of Object.entries(heights)) {
    const binding = identity.canonicalBindingForRecipe(recipe({ aspectRatio: aspect }));
    assert.deepEqual(identity.expectedDimensionsForBinding(binding), {
      expectedWidth: 6000,
      expectedHeight: height,
    });
  }
});

test("identity: two maps under one sessionId → two distinct keys + artifacts", () => {
  const a = identity.deriveArtifactIdentity({ sessionId: SID, mapId: MAP, recipe: recipe() });
  const b = identity.deriveArtifactIdentity({ sessionId: SID, mapId: MAP2, recipe: recipe() });
  assert.notEqual(a.artifactId, b.artifactId);
  assert.notEqual(a.finalKey, b.finalKey);
  assert.equal(
    a.finalKey,
    `download-archive/hd/${SID}/${MAP}-${FINGERPRINT}-c1-r1.png`,
  );
});

test("identity: renderer + contract versions are identity components", () => {
  const bumped = identity.buildArtifactId({
    sessionId: SID,
    mapId: MAP,
    fingerprint: FINGERPRINT,
    contractVersion: 2,
  });
  assert.notEqual(bumped, ARTIFACT);
  assert.ok(bumped.endsWith(":c2:r1"));
});

test("identity: key-length bounds — boundary pairs (S7-A N6)", () => {
  const okSession = "s".repeat(identity.MAX_SESSION_ID_LENGTH);
  assert.ok(
    identity.buildArtifactId({ sessionId: okSession, mapId: MAP, fingerprint: FINGERPRINT }),
  );
  assert.equal(
    identity.buildArtifactId({
      sessionId: "s".repeat(identity.MAX_SESSION_ID_LENGTH + 1),
      mapId: MAP,
      fingerprint: FINGERPRINT,
    }),
    null,
  );
  const okMap = "m".repeat(identity.MAX_MAP_ID_LENGTH);
  assert.ok(identity.buildArtifactId({ sessionId: SID, mapId: okMap, fingerprint: FINGERPRINT }));
  assert.equal(
    identity.buildArtifactId({
      sessionId: SID,
      mapId: "m".repeat(identity.MAX_MAP_ID_LENGTH + 1),
      fingerprint: FINGERPRINT,
    }),
    null,
  );
  assert.equal(
    identity.buildArtifactId({ sessionId: "bad/session", mapId: MAP, fingerprint: FINGERPRINT }),
    null,
  );
  assert.equal(identity.buildStagingKey("not-hex"), null);
});

test("identity: §5.8 metadata budget computed from the §5.1 constants", () => {
  const worstArtifactId =
    4 +
    identity.MAX_SESSION_ID_LENGTH +
    1 +
    identity.MAX_MAP_ID_LENGTH +
    1 +
    64 +
    2 +
    6 +
    2 +
    6;
  assert.equal(worstArtifactId, 278);
  const valuesTotal = 14 + worstArtifactId + 64 + 64; // protocol + artifactKey + digest + bindingDigest
  assert.equal(valuesTotal, 420);
  assert.ok(valuesTotal < 1024, "worst-case metadata stays under 1 KiB");
  assert.ok(valuesTotal < 8192, "against R2's 8,192-byte cap");
  const worstFinalKey = 20 + identity.MAX_SESSION_ID_LENGTH + 1 + identity.MAX_MAP_ID_LENGTH + 1 + 64 + 2 + 6 + 2 + 6 + 4;
  assert.equal(worstFinalKey, 298);
  assert.ok(worstFinalKey < 1024, "R2 key limit");
});

/* ----------------------------- descriptor ----------------------------- */

test("descriptor: issue + verify roundtrip; failures → identity_rejected", () => {
  const issued = identity.issuePrepareDescriptor({
    sessionId: SID,
    mapId: MAP,
    fingerprint: FINGERPRINT,
    now: NOW,
    descriptorId: DESC_1,
  });
  assert.ok(issued);
  const ok = identity.verifyPrepareDescriptor(issued.descriptor, { now: NOW + 1000, sessionId: SID });
  assert.equal(ok.ok, true);
  assert.equal(ok.payload.descriptorId, DESC_1);
  // tampered signature
  const tampered = issued.descriptor.slice(0, -1) + (issued.descriptor.endsWith("0") ? "1" : "0");
  assert.equal(identity.verifyPrepareDescriptor(tampered, { now: NOW + 1000, sessionId: SID }).ok, false);
  // expired (at expiresAt exactly: liveness is now < expiresAt)
  assert.equal(
    identity.verifyPrepareDescriptor(issued.descriptor, { now: NOW + identity.DESCRIPTOR_TTL_MS, sessionId: SID }).ok,
    false,
  );
  // session mismatch
  assert.equal(
    identity.verifyPrepareDescriptor(issued.descriptor, { now: NOW + 1000, sessionId: "cs_other" }).ok,
    false,
  );
  // garbage
  assert.equal(identity.verifyPrepareDescriptor("nonsense", { now: NOW, sessionId: SID }).ok, false);
});

test("descriptor: missing signing secret fails closed (OQ-3 accessor)", () => {
  const env = {};
  assert.equal(
    identity.issuePrepareDescriptor({
      sessionId: SID, mapId: MAP, fingerprint: FINGERPRINT, now: NOW, env,
    }),
    null,
  );
  const issued = identity.issuePrepareDescriptor({
    sessionId: SID, mapId: MAP, fingerprint: FINGERPRINT, now: NOW, descriptorId: DESC_1,
  });
  assert.equal(
    identity.verifyPrepareDescriptor(issued.descriptor, { now: NOW, sessionId: SID, env }).ok,
    false,
  );
});

test("descriptor: issuance requires the CURRENT secret — previous is verification-only (area 5 fix; slate-14 P2-1 / CB-P2b)", () => {
  const CURRENT = "current-secret-0123456789abcdef";
  const PREVIOUS = "previous-secret-0123456789abcde";
  // Control 1 — current ABSENT, previous usable: issuance fails closed.
  const prevOnly = { DL1_DESCRIPTOR_SIGNING_SECRET_PREVIOUS: PREVIOUS };
  assert.equal(identity.getDescriptorIssuanceSecret(prevOnly), null);
  assert.equal(
    identity.issuePrepareDescriptor({
      sessionId: SID, mapId: MAP, fingerprint: FINGERPRINT, now: NOW, env: prevOnly,
    }),
    null,
  );
  // Control 2 — current UNUSABLE (below the minimum length), previous
  // usable: issuance still fails closed — the previous secret never signs.
  const currentUnusable = {
    DL1_DESCRIPTOR_SIGNING_SECRET: "short",
    DL1_DESCRIPTOR_SIGNING_SECRET_PREVIOUS: PREVIOUS,
  };
  assert.equal(identity.getDescriptorIssuanceSecret(currentUnusable), null);
  assert.equal(
    identity.issuePrepareDescriptor({
      sessionId: SID, mapId: MAP, fingerprint: FINGERPRINT, now: NOW, env: currentUnusable,
    }),
    null,
  );
  // Issuance with a usable current signs with the CURRENT secret: the
  // descriptor verifies under a current-only env, and does NOT verify
  // under a previous-only env (it was not signed by the previous key).
  const both = {
    DL1_DESCRIPTOR_SIGNING_SECRET: CURRENT,
    DL1_DESCRIPTOR_SIGNING_SECRET_PREVIOUS: PREVIOUS,
  };
  const issued = identity.issuePrepareDescriptor({
    sessionId: SID, mapId: MAP, fingerprint: FINGERPRINT, now: NOW, descriptorId: DESC_1, env: both,
  });
  assert.ok(issued);
  assert.equal(
    identity.verifyPrepareDescriptor(issued.descriptor, {
      now: NOW + 1000, sessionId: SID, env: { DL1_DESCRIPTOR_SIGNING_SECRET: CURRENT },
    }).ok,
    true,
  );
  assert.equal(
    identity.verifyPrepareDescriptor(issued.descriptor, {
      now: NOW + 1000, sessionId: SID, env: { DL1_DESCRIPTOR_SIGNING_SECRET_PREVIOUS: PREVIOUS },
    }).ok,
    false,
  );
  // Rotation window: after the signing key rotates to PREVIOUS, the
  // descriptor issued under it still VERIFIES (verification accepts the
  // ordered pair) while new issuance uses the new current.
  const rotated = {
    DL1_DESCRIPTOR_SIGNING_SECRET: "rotated-secret-0123456789abcdef",
    DL1_DESCRIPTOR_SIGNING_SECRET_PREVIOUS: CURRENT,
  };
  assert.equal(
    identity.verifyPrepareDescriptor(issued.descriptor, { now: NOW + 1000, sessionId: SID, env: rotated }).ok,
    true,
  );
});

/* --------------------------- PNG validation ---------------------------- */

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(png.pngCrc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function buildPng({
  width = 4,
  height = 3,
  colorType = 6,
  bitDepth = 8,
  interlace = 0,
  rawRows = null,
  idatOverride = null,
  trailing = false,
  corruptIendCrc = false,
  omitIdat = false,
  extraChunks = [],
} = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = interlace;
  const rows = rawRows ?? Buffer.alloc(height * (1 + width * 4));
  const idat = idatOverride ?? deflateSync(rows);
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...extraChunks,
  ];
  if (!omitIdat) parts.push(chunk("IDAT", idat));
  parts.push(chunk("IEND", Buffer.alloc(0)));
  let out = Buffer.concat(parts);
  if (trailing) out = Buffer.concat([out, Buffer.from("XX")]);
  if (corruptIendCrc) {
    out = Buffer.from(out);
    out[out.length - 1] ^= 0xff;
  }
  return out;
}

const SMALL = { expectedWidth: 4, expectedHeight: 3 };

test("counted read (area 8 fix round 2): single-assembly boundaries — exact cap in small chunks succeeds, cap+1 is refused WITHOUT draining the source, a throwing source is read_failed, and a stream overflow cancels the reader", async () => {
  const cap = 4096;
  const mk = (n, fill) => new Uint8Array(n).fill(fill);
  // The pump/slice bounds the manifest charges are the exported
  // constants, not test-local numbers.
  assert.equal(png.COUNTED_READ_SLICE_BYTES, 64 * 1024);
  assert.ok(png.PNG_INFLATE_MAX_OUTSTANDING_WRITES >= 1);
  // Exact cap via many small chunks.
  async function* exact() {
    for (let i = 0; i < cap / 8; i++) yield mk(8, 1);
  }
  const okExact = await png.readCountedBody(exact(), cap);
  assert.equal(okExact.ok, true);
  assert.equal(okExact.bytes.length, cap);
  // cap+1: refused at the crossing chunk; the source is NOT drained
  // (the round-2 reader never materialises a second body to refuse).
  let produced = 0;
  async function* over() {
    for (let i = 0; i < 100; i++) {
      produced++;
      yield mk(1024, 2);
    }
  }
  const okOver = await png.readCountedBody(over(), cap);
  assert.equal(okOver.ok, false);
  assert.equal(okOver.reason, "too_large");
  assert.ok(produced <= 6, `source drained: ${produced} chunks produced`);
  // A throwing source is read_failed.
  async function* boom() {
    yield mk(16, 3);
    throw new Error("source failure");
  }
  const okBoom = await png.readCountedBody(boom(), cap);
  assert.equal(okBoom.ok, false);
  assert.equal(okBoom.reason, "read_failed");
  // ReadableStream: overflow cancels the reader.
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(mk(1024, 4));
    },
    cancel() {
      cancelled = true;
    },
  });
  const okStream = await png.readCountedBody(stream, cap);
  assert.equal(okStream.ok, false);
  assert.equal(okStream.reason, "too_large");
  assert.equal(cancelled, true);
});

test("png inflate feeding (area 8 fix round 2): IDAT bookkeeping is bounded — ~200k empty IDAT chunks validate, a 1-byte-segmented payload validates identically, and an overlong inflated stream is refused", async () => {
  const raw = Buffer.alloc(3 * 17); // 3 rows × (1 filter byte + 4 px × 4 B)
  for (let r = 0; r < 3; r++) raw[r * 17] = 0; // filter byte 0 per row
  const whole = buildPng({ rawRows: raw });
  const base = await png.validatePngBytes(whole, SMALL);
  assert.equal(base.ok, true);
  const iendOffset = (buf) => {
    let off = 8;
    while (off + 8 <= buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf.toString("ascii", off + 4, off + 8);
      if (type === "IEND") return off;
      off += 12 + len;
    }
    throw new Error("no IEND");
  };
  const iendAt = iendOffset(whole);
  // Many-empty-IDAT (the Codex many-empty-IDAT reproduction shape):
  // 200,000 zero-length IDAT chunks inserted before IEND. Pass 1
  // counts them in O(1); the feeder walks them without retaining a
  // span per chunk.
  const emptyIdat = chunk("IDAT", Buffer.alloc(0));
  const manyParts = [whole.subarray(0, iendAt)];
  for (let i = 0; i < 200_000; i++) manyParts.push(emptyIdat);
  manyParts.push(whole.subarray(iendAt));
  const manyEmpty = await png.validatePngBytes(Buffer.concat(manyParts), SMALL);
  assert.equal(manyEmpty.ok, true);
  // Segmentation equivalence: the same zlib payload split across
  // 1-byte IDATs inflates to the same validated image.
  const payloadParts = [];
  {
    let off = 8;
    while (off < iendAt) {
      const len = whole.readUInt32BE(off);
      const type = whole.toString("ascii", off + 4, off + 8);
      if (type === "IDAT") payloadParts.push(whole.subarray(off + 8, off + 8 + len));
      off += 12 + len;
    }
  }
  const payload = Buffer.concat(payloadParts);
  const segParts = [whole.subarray(0, 8 + 25)]; // signature + IHDR chunk
  for (let i = 0; i < payload.length; i++) segParts.push(chunk("IDAT", payload.subarray(i, i + 1)));
  segParts.push(whole.subarray(iendAt));
  const segmented = await png.validatePngBytes(Buffer.concat(segParts), SMALL);
  assert.equal(segmented.ok, true);
  assert.equal(segmented.width, base.width);
  assert.equal(segmented.height, base.height);
  // Overlong inflated stream: 4 rows of pixels for a 3-row image —
  // the decoder aborts the byte the expected length is exceeded.
  const rawLong = Buffer.alloc(4 * 17);
  for (let r = 0; r < 4; r++) rawLong[r * 17] = 0;
  const overlong = await png.validatePngBytes(buildPng({ rawRows: rawLong }), SMALL);
  assert.equal(overlong.ok, false);
  assert.equal(overlong.reason, "inflated_data_invalid");
});

test("png: valid RGBA PNG validates; digest is SHA-256 of the bytes (§5.10 steps 2–4)", async () => {
  const bytes = buildPng();
  const result = await png.validatePngBytes(bytes, SMALL);
  assert.equal(result.ok, true);
  assert.equal(result.digest, sha(bytes));
  assert.equal(result.colorType, 6);
  assert.equal(result.bitDepth, 8);
});

test("png: garbage IDAT with valid chunk structure + CRCs is rejected (§5.10 step 3)", async () => {
  const bytes = buildPng({ idatOverride: Buffer.from("this is not a zlib stream at all") });
  const result = await png.validatePngBytes(bytes, SMALL);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "inflated_data_invalid");
});

test("png: structural rejection set — bad CRC, trailing bytes, missing IDAT, wrong dims, wrong features", async () => {
  assert.equal((await png.validatePngBytes(buildPng({ corruptIendCrc: true }), SMALL)).reason, "bad_crc");
  assert.equal(
    (await png.validatePngBytes(buildPng({ trailing: true }), SMALL)).reason,
    "trailing_bytes_after_iend",
  );
  assert.equal((await png.validatePngBytes(buildPng({ omitIdat: true }), SMALL)).reason, "missing_idat");
  assert.equal(
    (await png.validatePngBytes(buildPng(), { expectedWidth: 5, expectedHeight: 3 })).reason,
    "dimension_mismatch",
  );
  assert.equal(
    (await png.validatePngBytes(buildPng({ colorType: 2 }), SMALL)).reason,
    "unpinned_png_feature_set",
  );
  assert.equal(
    (await png.validatePngBytes(buildPng({ interlace: 1 }), SMALL)).reason,
    "interlace_not_supported",
  );
  assert.equal((await png.validatePngBytes(Buffer.from("not a png"), SMALL)).ok, false);
});

test("png: unsupported critical chunk is rejected (correction round 3 — Codex P2-2); ancillary chunks still validate", async () => {
  // A CRC-valid unknown CRITICAL chunk ("ABCD") — the reproduction
  // shape from the Codex finding: before round 3 this validated,
  // while a real decoder (Sharp) rejects the file, so the artifact
  // could be permanently finalized yet undecodable.
  const critical = await png.validatePngBytes(
    buildPng({ extraChunks: [chunk("ABCD", Buffer.from("payload"))] }),
    SMALL,
  );
  assert.equal(critical.ok, false);
  assert.equal(critical.reason, "unsupported_critical_chunk");
  // Ancillary positive controls (lowercase first byte = the PNG
  // ancillary bit): tEXt and gAMA pass through exactly as before.
  for (const type of ["tEXt", "gAMA"]) {
    const ancillary = await png.validatePngBytes(
      buildPng({ extraChunks: [chunk(type, Buffer.from("note"))] }),
      SMALL,
    );
    assert.equal(ancillary.ok, true, `${type} must remain admissible`);
  }
});

test("png: PLTE payload shape is validated before staging (Codex P2 on the round-3 head); a well-formed palette is admitted by the structure pass", async () => {
  // The Codex reproduction: a CRC-valid one-byte PLTE in an
  // otherwise admissible RGBA PNG passed validation while Sharp
  // rejects the file ("invalid chunk length").
  for (const [label, payload] of [
    ["one byte", Buffer.from([0])],
    ["not a multiple of 3", Buffer.from([0, 0, 0, 0])],
    ["empty", Buffer.alloc(0)],
    ["257 entries", Buffer.alloc(771)],
  ]) {
    const result = await png.validatePngBytes(
      buildPng({ extraChunks: [chunk("PLTE", payload)] }),
      SMALL,
    );
    assert.equal(result.ok, false, `PLTE ${label} must be rejected`);
    assert.equal(result.reason, "bad_plte", `PLTE ${label}`);
  }
  // A well-formed PLTE (a suggested palette) on the admitted RGBA
  // colour type validates exactly as before.
  const rgba = await png.validatePngBytes(
    buildPng({ extraChunks: [chunk("PLTE", Buffer.from([0, 0, 0, 255, 255, 255]))] }),
    SMALL,
  );
  assert.equal(rgba.ok, true, "a well-formed PLTE on RGBA must validate");
  // Positive control, palette image: colour type 3 carrying a
  // well-formed PLTE is admitted by the PLTE rules — it is rejected
  // only by the pinned feature set, not as bad_plte.
  const palette = await png.validatePngBytes(
    buildPng({ colorType: 3, extraChunks: [chunk("PLTE", Buffer.from([10, 20, 30]))] }),
    SMALL,
  );
  assert.equal(palette.ok, false);
  assert.equal(palette.reason, "unpinned_png_feature_set");
  // Presence rules: PLTE is required for colour type 3, forbidden
  // for greyscale (0), and the entry count is bounded by 2^bitDepth
  // for palette images.
  const paletteMissing = await png.validatePngBytes(buildPng({ colorType: 3 }), SMALL);
  assert.equal(paletteMissing.reason, "bad_plte");
  const greyWithPlte = await png.validatePngBytes(
    buildPng({ colorType: 0, extraChunks: [chunk("PLTE", Buffer.from([0, 0, 0]))] }),
    SMALL,
  );
  assert.equal(greyWithPlte.reason, "bad_plte");
  const paletteOverflow = await png.validatePngBytes(
    buildPng({
      colorType: 3,
      bitDepth: 1,
      extraChunks: [chunk("PLTE", Buffer.alloc(9))], // 3 entries > 2^1
    }),
    SMALL,
  );
  assert.equal(paletteOverflow.reason, "bad_plte");
  // PLTE after the first IDAT is out of order per the spec.
  const base = buildPng({});
  const iendStart = base.length - 12;
  const afterIdat = Buffer.concat([
    base.subarray(0, iendStart),
    chunk("PLTE", Buffer.from([0, 0, 0])),
    base.subarray(iendStart),
  ]);
  const late = await png.validatePngBytes(afterIdat, SMALL);
  assert.equal(late.reason, "bad_plte");
});

test("png: nonconsecutive IDAT is rejected before staging (Codex P2 on the round-3 head); consecutive multi-IDAT still validates", async () => {
  // The Codex reproduction shape: a CRC-valid PNG whose IDAT run
  // is broken by an ancillary chunk (IDAT -> tEXt -> IDAT). The
  // structural walk counts and the inflate pass concatenates every
  // IDAT payload, so this validated — while a real decoder
  // (libspng, hence Sharp) rejects the file ("pngload_buffer:
  // libspng read error") and the artifact could be permanently
  // finalized yet undecodable.
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(4, 0);
  ihdrData.writeUInt32BE(3, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // colour type RGBA (the pinned feature set)
  const compressed = deflateSync(Buffer.alloc(3 * (1 + 4 * 4)));
  const splitAt = Math.floor(compressed.length / 2);
  const idatA = chunk("IDAT", compressed.subarray(0, splitAt));
  const idatB = chunk("IDAT", compressed.subarray(splitAt));
  const assemble = (...middle) =>
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdrData),
      ...middle,
      chunk("IEND", Buffer.alloc(0)),
    ]);
  // Interleaved: rejected with the dedicated reason, whichever
  // ancillary chunk breaks the run.
  for (const breaker of ["tEXt", "gAMA"]) {
    const interleaved = await png.validatePngBytes(
      assemble(idatA, chunk(breaker, Buffer.from("note")), idatB),
      SMALL,
    );
    assert.equal(interleaved.ok, false, `${breaker} between IDATs must be rejected`);
    assert.equal(interleaved.reason, "nonconsecutive_idat", breaker);
  }
  // A run that starts, breaks, and resumes after TWO consecutive
  // IDATs is rejected the same way.
  const third = Math.floor(compressed.length / 3);
  const resumed = await png.validatePngBytes(
    assemble(
      chunk("IDAT", compressed.subarray(0, third)),
      chunk("IDAT", compressed.subarray(third, 2 * third)),
      chunk("tEXt", Buffer.from("note")),
      chunk("IDAT", compressed.subarray(2 * third)),
    ),
    SMALL,
  );
  assert.equal(resumed.ok, false);
  assert.equal(resumed.reason, "nonconsecutive_idat");
  // Positive control: consecutive multi-IDAT validates — this is
  // the shape real encoders emit (the M4 retained client-encoder
  // render carries its stream as consecutive 4,096-byte IDATs).
  const consecutive = await png.validatePngBytes(assemble(idatA, idatB), SMALL);
  assert.equal(consecutive.ok, true, "consecutive multi-IDAT must validate");
  // A single IDAT (the buildPng default shape) still validates.
  const single = await png.validatePngBytes(
    assemble(chunk("IDAT", compressed)),
    SMALL,
  );
  assert.equal(single.ok, true, "single-IDAT must validate");
  // Ancillary chunks BEFORE the first IDAT and AFTER the last
  // IDAT are untouched by the rule: only interleaving is rejected.
  const before = await png.validatePngBytes(
    assemble(chunk("tEXt", Buffer.from("note")), idatA, idatB),
    SMALL,
  );
  assert.equal(before.ok, true, "an ancillary chunk before the IDAT run must validate");
  const after = await png.validatePngBytes(
    assemble(idatA, idatB, chunk("tEXt", Buffer.from("note"))),
    SMALL,
  );
  assert.equal(after.ok, true, "an ancillary chunk after the IDAT run must validate");
});

test("png: illegal filter byte + short inflated stream are rejected (§5.10 step 3)", async () => {
  const badFilterRows = Buffer.alloc(3 * (1 + 4 * 4));
  for (let r = 0; r < 3; r++) badFilterRows[r * (1 + 4 * 4)] = 9;
  assert.equal(
    (await png.validatePngBytes(buildPng({ rawRows: badFilterRows }), SMALL)).reason,
    "inflated_data_invalid",
  );
  const shortRows = Buffer.alloc(2 * (1 + 4 * 4)); // one row short
  assert.equal(
    (await png.validatePngBytes(buildPng({ rawRows: shortRows }), SMALL)).reason,
    "inflated_data_invalid",
  );
});

test("png: counted read boundary — exactly at the cap ok, cap+1 refused (§5.10 step 1)", async () => {
  const source = (chunks) =>
    (async function* () {
      for (const c of chunks) yield c;
    })();
  const exact = await png.readCountedBody(source([Buffer.alloc(40), Buffer.alloc(60)]), 100);
  assert.equal(exact.ok, true);
  assert.equal(exact.bytes.length, 100);
  const over = await png.readCountedBody(source([Buffer.alloc(40), Buffer.alloc(61)]), 100);
  assert.equal(over.ok, false);
  assert.equal(over.reason, "too_large");
});

test("png: full-width stream — 6000×6000 RGBA validates through the discard path", async () => {
  const rows = Buffer.alloc(6000 * (1 + 6000 * 4));
  const bytes = buildPng({ width: 6000, height: 6000, rawRows: rows });
  const result = await png.validatePngBytes(bytes, { expectedWidth: 6000, expectedHeight: 6000 });
  assert.equal(result.ok, true);
});

/* ------------------------- state machine: Table 1 ------------------------- */

test("R7: first registration records the intent, allocates generation 1, sets both pointers", () => {
  const r = reg(s0());
  assert.equal(r.outcome, "publication_intent_recorded");
  assert.equal(r.changed, true);
  assert.equal(r.publication.intentId, DESC_1);
  assert.equal(r.publication.generation, 1);
  const intent = r.state.publicationIntents[DESC_1];
  assert.equal(intent.generation, 1);
  assert.equal(intent.createdAt, NOW);
  assert.equal(r.state.publicationIntentByArtifact[ARTIFACT], DESC_1);
  assert.equal(r.state.canonicalArtifactByMap[MAP], ARTIFACT);
  assert.equal(sm.isValidEntitlementAuthorityState(r.state), true);
});

test("R1: identical replay → recorded outcome, no state change", () => {
  const s1 = reg(s0()).state;
  const r = reg(s1);
  assert.equal(r.outcome, "publication_intent_recorded");
  assert.equal(r.changed, false);
  assert.equal(r.publication.generation, 1);
});

test("R2: replay differing only in a non-binding field (digest) → intent_payload_conflict", () => {
  const s1 = reg(s0()).state;
  const r = reg(s1, { digest: DIGEST_B });
  assert.equal(r.outcome, "refused");
  assert.equal(r.refusal, "intent_payload_conflict");
  assert.equal(r.changed, false);
});

test("R0 (A-1): divergent binding under an existing intentId → collision, never payload conflict", () => {
  const s1 = reg(s0()).state;
  const divergent = BINDING + " ";
  const r = reg(s1, { canonicalBinding: divergent });
  assert.equal(r.outcome, "refused");
  assert.equal(r.refusal, "publication_conflict");
});

test("R0: divergent binding under a fresh intentId → collision (registration site (b))", () => {
  const s1 = reg(s0()).state;
  const r = reg(s1, { intentId: DESC_2, canonicalBinding: BINDING + " " });
  assert.equal(r.refusal, "publication_conflict");
  assert.equal(r.state.publicationIntents[DESC_2], undefined);
});

test("R0: divergent binding after the first intent EXPIRED → refused at R0 (retained records scanned)", () => {
  const s1 = reg(s0(), { expiresAt: NOW + 1000 }).state;
  const r = reg(
    s1,
    { intentId: DESC_2, canonicalBinding: BINDING + " ", expiresAt: NOW + 2000 + 600_000 },
    NOW + 2000,
  );
  assert.equal(r.refusal, "publication_conflict");
});

test("R5: live governing intent with a different digest → publication_conflict, no registry write", () => {
  const s1 = reg(s0()).state;
  const r = reg(s1, { intentId: DESC_2, digest: DIGEST_B });
  assert.equal(r.refusal, "publication_conflict");
  assert.equal(r.state.artifactRegistry[ARTIFACT], undefined);
  assert.equal(r.state.publicationIntentJoins[DESC_2], undefined);
});

test("R6: same-digest second prepare JOINS — join record persisted, governing pair carried, pointer unmoved", () => {
  const s1 = reg(s0()).state;
  const pointerBefore = s1.canonicalArtifactByMap[MAP];
  const r = reg(s1, { intentId: DESC_2 });
  assert.equal(r.outcome, "publication_intent_joined");
  assert.equal(r.changed, true);
  assert.equal(r.publication.intentId, DESC_1); // governing intentId
  assert.equal(r.publication.generation, 1);
  const join = r.state.publicationIntentJoins[DESC_2];
  assert.ok(join);
  assert.equal(join.governingIntentId, DESC_1);
  assert.equal(join.digest, DIGEST_A);
  assert.equal(r.state.canonicalArtifactByMap[MAP], pointerBefore);
  assert.equal(sm.isValidEntitlementAuthorityState(r.state), true);
});

test("JN2: joined descriptor presenting different bytes → intent_payload_conflict; recorded digest unchanged", () => {
  let s = reg(s0()).state;
  s = reg(s, { intentId: DESC_2 }).state; // join
  const r = reg(s, { intentId: DESC_2, digest: DIGEST_B });
  assert.equal(r.refusal, "intent_payload_conflict");
  assert.equal(r.state.publicationIntentJoins[DESC_2].digest, DIGEST_A);
});

test("JN1→R7 (W-1 later case): joined descriptor re-presenting after governing expiry promotes with machine-stamped expiry; intent + retained join coexist (V-1)", () => {
  let s = reg(s0(), { expiresAt: NOW + 1000 }).state; // governing expires at NOW+1000
  s = reg(s, { intentId: DESC_2, expiresAt: NOW + 5000 }).state; // DESC_2 joins; its signed expiry is LATER
  const promoteAt = NOW + 2000; // governing expired; descriptor still valid
  const r = reg(s, { intentId: DESC_2, expiresAt: NOW + 5000 }, promoteAt);
  assert.equal(r.outcome, "publication_intent_recorded");
  assert.equal(r.publication.intentId, DESC_2);
  const intent = r.state.publicationIntents[DESC_2];
  assert.equal(intent.expiresAt, promoteAt + identity.DESCRIPTOR_TTL_MS); // machine-stamped, NOT the record's expiry
  assert.equal(intent.digest, DIGEST_A);
  assert.ok(r.state.publicationIntentJoins[DESC_2]); // retained, never deleted
  assert.equal(r.state.canonicalArtifactByMap[MAP], ARTIFACT); // pointer set by the R7 transition
  assert.equal(sm.isValidEntitlementAuthorityState(r.state), true); // V-1 coexistence loads as valid
});

test("R1 after JN1→R7 (area 3 fix round 2): the FULL immutable-field comparison runs against the PERSISTED intent — the join's original expiry and any third expiry are R2; only the intent's own recorded payload replays", () => {
  let s = reg(s0(), { expiresAt: NOW + 1000 }).state; // governing DESC_1
  s = reg(s, { intentId: DESC_2, expiresAt: NOW + 5000 }).state; // DESC_2 joins; signed expiry NOW+5000
  const promoteAt = NOW + 2000;
  s = reg(s, { intentId: DESC_2, expiresAt: NOW + 5000 }, promoteAt).state; // JN1→R7 promotion
  const intent = s.publicationIntents[DESC_2];
  const stamp = promoteAt + identity.DESCRIPTOR_TTL_MS;
  assert.equal(intent.expiresAt, stamp); // machine-stamped, NOT the join's original expiry
  // A presentation constructed from the persisted intent — every
  // immutable field equal to the intent's recorded values, the
  // machine-stamped expiry included — replays (R1), no state change,
  // and the persisted expiry is NOT renewed or altered by the replay.
  const replay = reg(s, { intentId: DESC_2, expiresAt: stamp }, promoteAt + 1000);
  assert.equal(replay.outcome, "publication_intent_recorded");
  assert.equal(replay.changed, false);
  assert.equal(replay.publication.generation, intent.generation);
  assert.equal(replay.state.publicationIntents[DESC_2].expiresAt, stamp);
  // The round-1 exemption is GONE: the same presentation carrying the
  // retained join's ORIGINAL signed expiry diverges from the
  // persisted intent on expiresAt → R2. (Honest route replays still
  // succeed because the ROUTE constructs its registration from the
  // persisted intent — see the route-level promoted-replay test in
  // dl1Slice4Route.test.mjs. A direct authority presentation carrying
  // that expiry is refused, per the re-check verdict's closure.)
  const joinExpiry = reg(s, { intentId: DESC_2, expiresAt: NOW + 5000 }, promoteAt + 1000);
  assert.equal(joinExpiry.outcome, "refused");
  assert.equal(joinExpiry.refusal, "intent_payload_conflict");
  assert.equal(joinExpiry.changed, false);
  // A third expiry — equal to NEITHER the stamp NOR the join's
  // original — is likewise R2 (this replaces the round-1
  // third-expiry exemption test, which asserted the dedupe).
  const thirdExpiry = reg(s, { intentId: DESC_2, expiresAt: NOW + 777_000 }, promoteAt + 1000);
  assert.equal(thirdExpiry.outcome, "refused");
  assert.equal(thirdExpiry.refusal, "intent_payload_conflict");
  assert.equal(thirdExpiry.changed, false);
  // A payload divergence from the INTENT (digest), even with the
  // stamped expiry, is R2 — measured against the persisted intent,
  // never the join record.
  const divergent = reg(s, { intentId: DESC_2, expiresAt: stamp, digest: DIGEST_B }, promoteAt + 1000);
  assert.equal(divergent.outcome, "refused");
  assert.equal(divergent.refusal, "intent_payload_conflict");
  assert.equal(divergent.changed, false);
});

test("R1/R2 table (area 3 fix round 2): exact match replays; EVERY single-field divergence from the persisted intent receives its prescribed refusal — no field is exempt", () => {
  const s1 = reg(s0()).state;
  // Exact match across the full immutable-field set → R1.
  const exact = reg(s1);
  assert.equal(exact.outcome, "publication_intent_recorded");
  assert.equal(exact.changed, false);
  // One changed field per case. Most divergences land in R2
  // (intent_payload_conflict) — directly, or via the door checks that
  // guard it (artifactKey recompute, V-6 dimension derivation). The
  // two prescribed exceptions are named: a divergent binding is the
  // R0 collision (evaluated first, A-1), and a foreign sessionId is
  // the V-5 identity refusal (evaluated before the table).
  const cases = [
    // artifactKey (correction round 3: the re-check verdict noted
    // this direct-mutation case was absent — the table now covers
    // all twelve compared fields): the door recompute derives the
    // key from the identity components, so a presented key that
    // diverges is refused before the table proper.
    ["artifactKey", { artifactKey: `${ARTIFACT}-forged` }, "intent_payload_conflict"],
    ["digest", { digest: DIGEST_B }, "intent_payload_conflict"],
    ["expiresAt", { expiresAt: NOW + 999_999 }, "intent_payload_conflict"],
    ["stagingKey", { stagingKey: identity.buildStagingKey(DESC_4) }, "intent_payload_conflict"],
    ["fingerprint", { fingerprint: sha("other-fingerprint") }, "intent_payload_conflict"],
    ["mapId", { mapId: MAP2 }, "intent_payload_conflict"],
    ["contractVersion", { contractVersion: 2 }, "intent_payload_conflict"],
    ["rendererVersion", { rendererVersion: 2 }, "intent_payload_conflict"],
    ["expectedWidth", { expectedWidth: 1234 }, "intent_payload_conflict"],
    ["expectedHeight", { expectedHeight: 1234 }, "intent_payload_conflict"],
    ["canonicalBinding", { canonicalBinding: BINDING + " " }, "publication_conflict"],
    ["sessionId", { sessionId: "cs_foreign" }, "identity_rejected"],
  ];
  for (const [label, over, refusal] of cases) {
    const r = reg(s1, over);
    assert.equal(r.outcome, "refused", label);
    assert.equal(r.refusal, refusal, label);
    assert.equal(r.changed, false, label);
  }
});

test("JN1→R6: joined descriptor re-presenting while a new governing intent lives → joined no-op, pointer unmoved", () => {
  let s = reg(s0(), { expiresAt: NOW + 1000 }).state;
  s = reg(s, { intentId: DESC_2, expiresAt: NOW + 9000 }).state; // join under DESC_2
  s = reg(s, { intentId: DESC_3, expiresAt: NOW + 9000 }, NOW + 2000).state; // fresh R7 (DESC_3 governs)
  const before = JSON.stringify(s.publicationIntentJoins);
  const r = reg(s, { intentId: DESC_2, expiresAt: NOW + 9000 }, NOW + 3000);
  assert.equal(r.outcome, "publication_intent_joined");
  assert.equal(r.publication.intentId, DESC_3);
  assert.equal(r.changed, false);
  assert.equal(JSON.stringify(r.state.publicationIntentJoins), before);
});

test("W-1 earlier/equal cases: an expired descriptor is refused at classification; join record + binding retained, pointer unmoved", () => {
  // Governing intent expires at tG; the joining descriptor's signed expiry tD <= tG.
  for (const [label, tD] of [["earlier", NOW + 500], ["equal", NOW + 1000]]) {
    let s = reg(s0(), { expiresAt: NOW + 1000 }).state;
    s = reg(s, { intentId: DESC_2, expiresAt: tD }).state; // join recorded while governing lived
    const issued = identity.issuePrepareDescriptor({
      sessionId: SID,
      mapId: MAP,
      fingerprint: FINGERPRINT,
      now: NOW,
      ttlMs: tD - NOW,
      descriptorId: DESC_2,
    });
    assert.ok(issued, label);
    // At any now >= tG the descriptor is already dead (tD <= tG): classification refuses.
    const verdict = identity.verifyPrepareDescriptor(issued.descriptor, {
      now: NOW + 1000,
      sessionId: SID,
    });
    assert.equal(verdict.ok, false, label);
    // The refusal is of the presentation, never the record.
    assert.ok(s.publicationIntentJoins[DESC_2], label);
    assert.equal(s.publicationIntentJoins[DESC_2].digest, DIGEST_A, label);
    assert.equal(s.canonicalArtifactByMap[MAP], ARTIFACT, label);
  }
});

test("R7 guard: a registration whose effective expiry is not in the future → identity_rejected, no generation burned", () => {
  const r = reg(s0(), { expiresAt: NOW }); // expiresAt <= now
  assert.equal(r.refusal, "identity_rejected");
  assert.equal(r.state.publicationGenerations[ARTIFACT], undefined);
});

test("register guard (V-5): presented sessionId ≠ document session → identity_rejected before the table", () => {
  const r = reg(s0(), { sessionId: "cs_other_session" });
  assert.equal(r.refusal, "identity_rejected");
});

test("V-6: presented dimensions differing from the binding derivation → intent_payload_conflict", () => {
  const r = reg(s0(), { expectedHeight: 1234 });
  assert.equal(r.refusal, "intent_payload_conflict");
});

/* ------------------------- state machine: Table 2 ------------------------- */

function finalizedState() {
  let s = reg(s0()).state;
  const r = fin(s, {
    observation: {
      finalObjectPresent: true,
      finalMetadata: trustedMetadata(DIGEST_A),
      bodyVerifiedDigest: null,
    },
  });
  assert.equal(r.outcome, "publication_finalized");
  return r.state;
}

test("F6: live governing intent + trusted metadata digest equal → finalized; entry opens archiveEmail pending; by-artifact pointer cleared", () => {
  const s = finalizedState();
  const entry = s.artifactRegistry[ARTIFACT];
  assert.equal(entry.state, "finalized");
  assert.equal(entry.finalizedAt, NOW);
  assert.deepEqual(entry.archiveEmail, {
    state: "pending",
    claimedAt: null,
    dispatchedAt: null,
    claimGeneration: 0,
  });
  assert.equal(s.publicationIntentByArtifact[ARTIFACT], undefined);
  assert.equal(s.canonicalArtifactByMap[MAP], ARTIFACT); // finalize never moves the canonical pointer (P-3)
  assert.equal(sm.isValidEntitlementAuthorityState(s), true);
});

test("F5 + expiry executability: finalize at now === expiresAt → finalization_pending, NO entry written", () => {
  const s1 = reg(s0(), { expiresAt: NOW + 1000 }).state;
  const r = fin(
    s1,
    {
      observation: {
        finalObjectPresent: true,
        finalMetadata: trustedMetadata(DIGEST_A),
        bodyVerifiedDigest: DIGEST_A,
      },
    },
    NOW + 1000, // exactly at expiry: expired
  );
  assert.equal(r.outcome, "refused");
  assert.equal(r.refusal, "finalization_pending");
  assert.equal(r.state.artifactRegistry[ARTIFACT], undefined);
});

test("F5→R7→F6 chain: fresh prepare after expiry finalizes the same stored object", () => {
  let s = reg(s0(), { intentId: DESC_1, expiresAt: NOW + 1000 }).state;
  const pending = fin(s, {
    observation: {
      finalObjectPresent: true,
      finalMetadata: trustedMetadata(DIGEST_A),
      bodyVerifiedDigest: DIGEST_A,
    },
  }, NOW + 2000);
  assert.equal(pending.refusal, "finalization_pending");
  s = reg(pending.state, { intentId: DESC_3, expiresAt: NOW + 2000 + 600_000 }, NOW + 2000).state;
  const r = fin(
    s,
    {
      intentId: DESC_3,
      generation: 2,
      observation: {
        finalObjectPresent: true,
        finalMetadata: trustedMetadata(DIGEST_A),
        bodyVerifiedDigest: DIGEST_A,
      },
    },
    NOW + 2000,
  );
  assert.equal(r.outcome, "publication_finalized");
  assert.equal(r.state.artifactRegistry[ARTIFACT].digest, DIGEST_A);
});

test("F7: trusted digest differing from governing → conflicted entry with evidence; presenter-independent (V-3)", () => {
  const build = () => reg(s0()).state;
  const observation = {
    finalObjectPresent: true,
    finalMetadata: trustedMetadata(DIGEST_B),
    bodyVerifiedDigest: DIGEST_B,
  };
  const byGoverning = fin(build(), { observation });
  const byStale = fin(build(), { intentId: "stale-id", generation: 99, observation });
  assert.equal(byGoverning.outcome, "publication_conflicted");
  assert.equal(byStale.outcome, "publication_conflicted");
  assert.deepEqual(
    byStale.state.artifactRegistry[ARTIFACT],
    byGoverning.state.artifactRegistry[ARTIFACT],
  );
  const evidence = byGoverning.state.artifactRegistry[ARTIFACT].conflictEvidence;
  assert.equal(evidence.governingDigest, DIGEST_A);
  assert.equal(evidence.observedDigest, DIGEST_B);
  assert.equal(evidence.source, "body");
});

test("F8: foreign metadata only → finalization_pending, NEVER conflicted; same object with a body hash → F7 by hashed digest", () => {
  const s1 = reg(s0()).state;
  const foreign = {
    finalObjectPresent: true,
    finalMetadata: { protocol: "other", artifactKey: ARTIFACT, digest: DIGEST_B, bindingDigest: sha(BINDING) },
    bodyVerifiedDigest: null,
  };
  const r1 = fin(s1, { observation: foreign });
  assert.equal(r1.refusal, "finalization_pending");
  assert.equal(r1.state.artifactRegistry[ARTIFACT], undefined);
  const r2 = fin(s1, {
    observation: { ...foreign, bodyVerifiedDigest: DIGEST_B },
  });
  assert.equal(r2.outcome, "publication_conflicted");
});

test("determination: trusted-shaped metadata whose bindingDigest fails → undetermined (no alert, no conflict)", () => {
  const s1 = finalizedState();
  const badBindingDigest = {
    finalObjectPresent: true,
    finalMetadata: { ...trustedMetadata(DIGEST_A), bindingDigest: sha("some other binding") },
    bodyVerifiedDigest: null,
  };
  const r = fin(s1, { observation: badBindingDigest });
  assert.equal(r.outcome, "publication_already_finalized"); // F3 path
  assert.equal(r.state.artifactRegistry[ARTIFACT].integrityAlerts.length, 0);
});

test("F3: finalized entry + absent object → already_finalized, no alert appended", () => {
  const s1 = finalizedState();
  const r = fin(s1, {
    observation: { finalObjectPresent: false, finalMetadata: null, bodyVerifiedDigest: null },
  });
  assert.equal(r.outcome, "publication_already_finalized");
  assert.equal(r.changed, false);
  assert.equal(r.state.artifactRegistry[ARTIFACT].integrityAlerts.length, 0);
});

test("F2: finalized entry + trusted digest different → already_finalized + evidence appended, winner unchanged", () => {
  const s1 = finalizedState();
  const r = fin(s1, {
    observation: {
      finalObjectPresent: true,
      finalMetadata: trustedMetadata(DIGEST_B),
      bodyVerifiedDigest: DIGEST_B,
    },
  });
  assert.equal(r.outcome, "publication_already_finalized");
  assert.equal(r.changed, true);
  const entry = r.state.artifactRegistry[ARTIFACT];
  assert.equal(entry.digest, DIGEST_A);
  assert.equal(entry.integrityAlerts.length, 1);
  assert.equal(entry.integrityAlerts[0].kind, "digest_contradiction");
});

test("F1 discrepancy: body hash matches entry, trusted metadata names a different digest → alert appended, entry unchanged", () => {
  const s1 = finalizedState();
  const r = fin(s1, {
    observation: {
      finalObjectPresent: true,
      finalMetadata: trustedMetadata(DIGEST_B), // metadata lies; body is truth
      bodyVerifiedDigest: DIGEST_A,
    },
  });
  assert.equal(r.outcome, "publication_already_finalized");
  const entry = r.state.artifactRegistry[ARTIFACT];
  assert.equal(entry.digest, DIGEST_A);
  assert.equal(entry.integrityAlerts.length, 1);
  assert.equal(entry.integrityAlerts[0].kind, "metadata_discrepancy");
});

test("F4: conflicted entry is idempotent under any determination", () => {
  let s = reg(s0()).state;
  s = fin(s, {
    observation: { finalObjectPresent: true, finalMetadata: trustedMetadata(DIGEST_B), bodyVerifiedDigest: DIGEST_B },
  }).state;
  const r = fin(s, {
    observation: { finalObjectPresent: false, finalMetadata: null, bodyVerifiedDigest: null },
  });
  assert.equal(r.outcome, "publication_conflicted");
  assert.equal(r.changed, false);
});

test("R3/R4: registration against a finalized entry → already_finalized carrying the entry; against conflicted → publication_conflict", () => {
  const sFin = finalizedState();
  const r3 = reg(sFin, { intentId: DESC_4 });
  assert.equal(r3.refusal, "already_finalized");
  assert.equal(r3.publication.entry.digest, DIGEST_A);
  let sCon = reg(s0()).state;
  sCon = fin(sCon, {
    observation: { finalObjectPresent: true, finalMetadata: trustedMetadata(DIGEST_B), bodyVerifiedDigest: DIGEST_B },
  }).state;
  const r4 = reg(sCon, { intentId: DESC_4 });
  assert.equal(r4.refusal, "publication_conflict");
  assert.equal(r4.publication.entry.state, "conflicted");
});

test("A-2: finalize with divergent presentedBinding against retained-expired-only records → collision, F5 not reached; matching → F5; no records + string → F5", () => {
  const s1 = reg(s0(), { expiresAt: NOW + 1000 }).state; // will be expired-only
  const divergent = fin(
    s1,
    { presentedBinding: BINDING + " ", observation: { finalObjectPresent: false, finalMetadata: null, bodyVerifiedDigest: null } },
    NOW + 2000,
  );
  assert.equal(divergent.refusal, "publication_conflict");
  assert.equal(divergent.changed, false);
  const matching = fin(
    s1,
    { presentedBinding: BINDING, observation: { finalObjectPresent: false, finalMetadata: null, bodyVerifiedDigest: null } },
    NOW + 2000,
  );
  assert.equal(matching.refusal, "finalization_pending");
  const noRecords = fin(
    s0(),
    { presentedBinding: BINDING, observation: { finalObjectPresent: false, finalMetadata: null, bodyVerifiedDigest: null } },
  );
  assert.equal(noRecords.refusal, "finalization_pending");
});

test("A-3 boundary pair: replay under existing intentId differing only in digest → R2 payload conflict; under existing join → JN2", () => {
  let s = reg(s0()).state;
  assert.equal(reg(s, { digest: DIGEST_B }).refusal, "intent_payload_conflict");
  s = reg(s, { intentId: DESC_2 }).state; // join
  assert.equal(reg(s, { intentId: DESC_2, digest: DIGEST_B }).refusal, "intent_payload_conflict");
  // …while a divergent BINDING under the join classifies as collision (R0):
  assert.equal(
    reg(s, { intentId: DESC_2, canonicalBinding: BINDING + " " }).refusal,
    "publication_conflict",
  );
});

test("V-11.3 saturation: the 9th contradiction sets saturated (changed), the 10th changes nothing", () => {
  let s = finalizedState();
  const contradict = (digest, now) =>
    fin(s, {
      observation: { finalObjectPresent: true, finalMetadata: trustedMetadata(digest), bodyVerifiedDigest: digest },
    }, now);
  for (let i = 0; i < 8; i++) {
    const r = contradict(sha(`other-${i}`), NOW + i);
    assert.equal(r.changed, true);
    s = r.state;
  }
  assert.equal(s.artifactRegistry[ARTIFACT].integrityAlerts.length, 8);
  const ninth = contradict(sha("other-8"), NOW + 100);
  assert.equal(ninth.changed, true);
  assert.equal(ninth.state.artifactRegistry[ARTIFACT].integrityAlertsSaturated, true);
  assert.equal(ninth.state.artifactRegistry[ARTIFACT].integrityAlerts.length, 8);
  const tenth = fin(ninth.state, {
    observation: { finalObjectPresent: true, finalMetadata: trustedMetadata(sha("other-9")), bodyVerifiedDigest: sha("other-9") },
  }, NOW + 101);
  assert.equal(tenth.changed, false);
  assert.equal(sm.isValidEntitlementAuthorityState(tenth.state), true);
});

/* ------------------------------ email ops ------------------------------ */

const claim = (state, now = NOW) =>
  sm.applyEntitlementAuthorityOp(state, { type: "claim_archive_email_dispatch", artifactKey: ARTIFACT, now });
const record = (state, claimGeneration, now = NOW) =>
  sm.applyEntitlementAuthorityOp(state, {
    type: "record_archive_email_dispatch",
    artifactKey: ARTIFACT,
    claimGeneration,
    now,
  });

test("email: claim → generation 1; record with that generation → dispatched; claim on dispatched carries the dispatched fact (V-10)", () => {
  const s = finalizedState();
  const c = claim(s);
  assert.equal(c.outcome, "archive_email_claimed");
  assert.equal(c.publication.claimGeneration, 1);
  assert.equal(c.publication.dispatched, false);
  const r = record(c.state, 1);
  assert.equal(r.outcome, "archive_email_dispatch_recorded");
  assert.equal(r.state.artifactRegistry[ARTIFACT].archiveEmail.state, "dispatched");
  const again = claim(r.state);
  assert.equal(again.outcome, "archive_email_claimed");
  assert.equal(again.changed, false);
  assert.equal(again.publication.dispatched, true); // receipt, not an authorisation
});

test("email: record on a pending entry → archive_email_not_claimed; on absent/conflicted → not_finalized", () => {
  const s = finalizedState();
  assert.equal(record(s, 1).refusal, "archive_email_not_claimed");
  assert.equal(record(s0(), 1).refusal, "not_finalized");
  assert.equal(claim(s0()).refusal, "not_finalized");
});

test("email (V-10 fencing): lease-expired re-claim mints generation 2; a generation-1 record is refused stale; generation-2 record lands", () => {
  const s = finalizedState();
  const c1 = claim(s, NOW);
  assert.equal(c1.publication.claimGeneration, 1);
  const live = claim(c1.state, NOW + 1000);
  assert.equal(live.refusal, "archive_email_already_claimed");
  const afterLease = NOW + sm.DISPATCH_CLAIM_LEASE_MS + 1;
  const c2 = claim(c1.state, afterLease);
  assert.equal(c2.outcome, "archive_email_claimed");
  assert.equal(c2.publication.claimGeneration, 2);
  const stale = record(c2.state, 1, afterLease + 10);
  assert.equal(stale.refusal, "archive_email_claim_stale");
  assert.equal(stale.state.artifactRegistry[ARTIFACT].archiveEmail.state, "claimed");
  const good = record(c2.state, 2, afterLease + 20);
  assert.equal(good.outcome, "archive_email_dispatch_recorded");
});

/* --------------------------- purity + validator --------------------------- */

test("purity fence: a full publication sequence leaves the accounting surface deep-equal", () => {
  const before = s0();
  const surfaceBefore = accountingSurface(before);
  let s = reg(before).state;
  s = reg(s, { intentId: DESC_2 }).state;
  s = fin(s, {
    observation: { finalObjectPresent: true, finalMetadata: trustedMetadata(DIGEST_A), bodyVerifiedDigest: null },
  }).state;
  s = claim(s).state;
  s = record(s, 1).state;
  assert.equal(accountingSurface(s), surfaceBefore);
});

test("validator rules: foreign-session records fail (rule 9); unwarranted pointer fails (rule 8); divergent bindings fail (rule 6)", () => {
  const good = reg(s0()).state;
  assert.equal(sm.isValidEntitlementAuthorityState(good), true);
  const foreign = structuredClone(good);
  foreign.publicationIntents[DESC_1].sessionId = "cs_attacker";
  // (also breaks artifactKey recompute; session rule is asserted on the same path)
  assert.equal(sm.isValidEntitlementAuthorityState(foreign), false);
  const unwarranted = structuredClone(good);
  unwarranted.canonicalArtifactByMap = { "map-with-no-intent": ARTIFACT };
  assert.equal(sm.isValidEntitlementAuthorityState(unwarranted), false);
  const divergent = structuredClone(good);
  divergent.publicationIntentJoins["99".repeat(16)] = {
    intentId: "99".repeat(16),
    governingIntentId: DESC_1,
    artifactKey: ARTIFACT,
    sessionId: SID,
    mapId: MAP,
    canonicalBinding: BINDING + " ",
    fingerprint: FINGERPRINT,
    contractVersion: 1,
    rendererVersion: 1,
    digest: DIGEST_A,
    stagingKey: identity.buildStagingKey("99".repeat(16)),
    expiresAt: NOW + 1000,
    joinedAt: NOW,
  };
  assert.equal(sm.isValidEntitlementAuthorityState(divergent), false);
});

test("validator: saturated without 8 alerts fails; claimed with claimGeneration 0 fails (V-10/V-11.3)", () => {
  const s = finalizedState();
  const saturatedBad = structuredClone(s);
  saturatedBad.artifactRegistry[ARTIFACT].integrityAlertsSaturated = true;
  assert.equal(sm.isValidEntitlementAuthorityState(saturatedBad), false);
  const claimed = claim(s).state;
  const genBad = structuredClone(claimed);
  genBad.artifactRegistry[ARTIFACT].archiveEmail.claimGeneration = 0;
  assert.equal(sm.isValidEntitlementAuthorityState(genBad), false);
});

/* ------------------------------ pointer P-4 ------------------------------ */

test("pointer P-4: maintenance sequence, SEAM-2 join case, expiry/finalization stillness, both T34 orderings", () => {
  const recipeY = recipe({ seed: "seed-2" });
  const bindingY = identity.canonicalBindingForRecipe(recipeY);
  const fpY = identity.fingerprintForBinding(bindingY);
  const artifactY = identity.buildArtifactId({ sessionId: SID, mapId: MAP, fingerprint: fpY });
  const dimsY = identity.expectedDimensionsForBinding(bindingY);
  const regY = (state, over = {}, now = NOW) =>
    sm.applyEntitlementAuthorityOp(state, {
      type: "register_publication_intent",
      intent: intentInput({
        intentId: DESC_3,
        artifactKey: artifactY,
        canonicalBinding: bindingY,
        fingerprint: fpY,
        stagingKey: identity.buildStagingKey(DESC_3),
        expectedWidth: dimsY.expectedWidth,
        expectedHeight: dimsY.expectedHeight,
        ...over,
      }),
      now,
    });

  // Maintenance sequence: R7(X) → X; R1 replay → X; R6 join → X; R7(Y) → Y.
  let s = reg(s0()).state;
  assert.equal(s.canonicalArtifactByMap[MAP], ARTIFACT);
  s = reg(s).state;
  assert.equal(s.canonicalArtifactByMap[MAP], ARTIFACT);
  s = reg(s, { intentId: DESC_2 }).state; // join against X
  assert.equal(s.canonicalArtifactByMap[MAP], ARTIFACT);
  s = regY(s).state;
  assert.equal(s.canonicalArtifactByMap[MAP], artifactY);
  // SEAM-2: a join against X afterwards leaves the pointer at Y.
  s = reg(s, { intentId: DESC_4 }).state; // DESC_4 joins X's intent (same digest)
  assert.equal(s.canonicalArtifactByMap[MAP], artifactY);
  // Finalization of X does not move it either.
  const finX = sm.applyEntitlementAuthorityOp(s, {
    type: "finalize_publication",
    artifactKey: ARTIFACT,
    intentId: DESC_1,
    generation: 1,
    observation: {
      finalObjectPresent: true,
      finalMetadata: { ...trustedMetadata(DIGEST_A), artifactKey: ARTIFACT },
      bodyVerifiedDigest: null,
    },
    now: NOW,
  });
  assert.equal(finX.outcome, "publication_finalized");
  assert.equal(finX.state.canonicalArtifactByMap[MAP], artifactY);

  // Both T34 orderings: the pointer always names the SECOND registration.
  const xy = regY(reg(s0()).state).state;
  assert.equal(xy.canonicalArtifactByMap[MAP], artifactY);
  const yx = reg(regY(s0()).state).state;
  assert.equal(yx.canonicalArtifactByMap[MAP], ARTIFACT);
});

test("two maps under one session: distinct identities register + finalize independently", () => {
  const idB = identity.deriveArtifactIdentity({ sessionId: SID, mapId: MAP2, recipe: recipe() });
  let s = reg(s0()).state;
  const rB = sm.applyEntitlementAuthorityOp(s, {
    type: "register_publication_intent",
    intent: intentInput({
      intentId: DESC_2,
      artifactKey: idB.artifactId,
      mapId: MAP2,
      stagingKey: identity.buildStagingKey(DESC_2),
    }),
    now: NOW,
  });
  assert.equal(rB.outcome, "publication_intent_recorded");
  s = rB.state;
  assert.equal(s.canonicalArtifactByMap[MAP], ARTIFACT);
  assert.equal(s.canonicalArtifactByMap[MAP2], idB.artifactId);
  assert.equal(sm.isValidEntitlementAuthorityState(s), true);
});

/* ------------------------------ race evidence ------------------------------ */

test("Class A + V-11.1 fold: concurrent registrations through the serialised authority — different digests: one records, the loser conflicts; folding the AUTHORITY-SIDE commit history reproduces the final state and every per-position outcome (area 9 fix)", async () => {
  clientMod.__resetEntitlementAuthorityMemoryForTests();
  const client = clientMod.createEntitlementAuthorityClient();
  const opA = { type: "register_publication_intent", intent: intentInput({ intentId: DESC_1 }), now: NOW };
  const opB = { type: "register_publication_intent", intent: intentInput({ intentId: DESC_2, digest: DIGEST_B }), now: NOW };
  const [ra, rb] = await Promise.all([client.apply(SID, opA), client.apply(SID, opB)]);
  const outcomes = [ra.outcome, rb.outcome].sort();
  assert.deepEqual(outcomes, ["publication_intent_recorded", "refused"]);
  const loser = ra.outcome === "refused" ? ra : rb;
  assert.equal(loser.refusal, "publication_conflict");
  const final = await client.getState(SID);
  // History = the authority-side serialised commit record (W-3 pin:
  // caller-observed/Promise order cannot substitute). The record is
  // read from the authority and ASSERTED — its existence, its order,
  // and its per-position outcomes are the evidence.
  const history = clientMod.__getEntitlementAuthorityCommitHistoryForTests(SID);
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((h) => h.op.intent.intentId).sort(), [DESC_1, DESC_2]);
  // Position 0 is whichever op the authority committed first: it
  // recorded; position 1 is the loser: refused publication_conflict.
  assert.equal(history[0].outcome, "publication_intent_recorded");
  assert.equal(history[0].refusal, null);
  assert.equal(history[1].outcome, "refused");
  assert.equal(history[1].refusal, "publication_conflict");
  // The caller-observed outcomes agree with the recorded positions for
  // the same ops (the history is the authority's, not a reordering of
  // the responses).
  const recordedByIntent = new Map(history.map((h) => [h.op.intent.intentId, h]));
  assert.equal(recordedByIntent.get(DESC_1).outcome, ra.outcome);
  assert.equal(recordedByIntent.get(DESC_2).outcome, rb.outcome);
  // Fold the RECORDED history through the pure machine: every position
  // reproduces its recorded outcome, and the fold lands on the
  // authority's committed state.
  let folded = sm.createEmptyEntitlementAuthorityState(SID);
  history.forEach((record, i) => {
    const step = sm.applyEntitlementAuthorityOp(folded, record.op);
    assert.equal(step.outcome, record.outcome, `position ${i} outcome`);
    assert.equal(step.refusal ?? null, record.refusal, `position ${i} refusal`);
    folded = step.state;
  });
  // FULL folded-state vs committed-state equality (area 9 fix round
  // 2; G-dot re-check verdict 2026-10-24): the round-1 test compared
  // only four selected maps, so a fold divergence inside
  // publicationIntentByArtifact or artifactRegistry would have
  // passed undetected. The comparison is now the ENTIRE state
  // object, key for key.
  assert.deepEqual(folded, final);
  // Sensitivity controls (acceptance 9.3): the full comparison is
  // PROVEN to detect divergence in exactly the fields the selected
  // comparison omitted — tamper each on a clone of the committed
  // state and require inequality with the fold.
  const tamperByArtifact = structuredClone(final);
  tamperByArtifact.publicationIntentByArtifact[ARTIFACT] = DESC_2;
  assert.notDeepEqual(tamperByArtifact, folded);
  const tamperRegistry = structuredClone(final);
  tamperRegistry.artifactRegistry["download-archive/hd/phantom.png"] = {
    digest: DIGEST_B,
  };
  assert.notDeepEqual(tamperRegistry, folded);
  const tamperTopLevel = structuredClone(final);
  tamperTopLevel.unexpectedField = {};
  assert.notDeepEqual(tamperTopLevel, folded);
});

test("Class A fold (area 9 fix round 2): a richer recorded history — register, same-digest join, finalize — folds to the FULL committed state, artifactRegistry populated", async () => {
  clientMod.__resetEntitlementAuthorityMemoryForTests();
  const client = clientMod.createEntitlementAuthorityClient();
  const digest = DIGEST_A;
  const register = (intentId, overrides = {}) => ({
    type: "register_publication_intent",
    intent: intentInput({ intentId, digest, stagingKey: identity.buildStagingKey(intentId), ...overrides }),
    now: NOW,
  });
  const r1 = await client.apply(SID, register(DESC_1));
  assert.equal(r1.outcome, "publication_intent_recorded");
  const r2 = await client.apply(SID, register(DESC_2));
  assert.equal(r2.outcome, "publication_intent_joined");
  const fin = await client.apply(SID, {
    type: "finalize_publication",
    artifactKey: ARTIFACT,
    intentId: DESC_1,
    generation: r1.publication.generation,
    observation: {
      finalObjectPresent: true,
      finalMetadata: trustedMetadata(digest),
      bodyVerifiedDigest: digest,
    },
    now: NOW + 1,
  });
  assert.equal(fin.outcome, "publication_finalized");
  const final = await client.getState(SID);
  assert.ok(final.artifactRegistry[ARTIFACT], "registry populated by the finalize");
  assert.equal(final.publicationIntentByArtifact[ARTIFACT], undefined);
  const history = clientMod.__getEntitlementAuthorityCommitHistoryForTests(SID);
  assert.equal(history.length, 3);
  let folded = sm.createEmptyEntitlementAuthorityState(SID);
  history.forEach((record, i) => {
    const step = sm.applyEntitlementAuthorityOp(folded, record.op);
    assert.equal(step.outcome, record.outcome, `position ${i} outcome`);
    assert.equal(step.refusal ?? null, record.refusal, `position ${i} refusal`);
    folded = step.state;
  });
  assert.deepEqual(folded, final);
});

test("Class A: concurrent same-digest registrations → exactly one intent + one join", async () => {
  clientMod.__resetEntitlementAuthorityMemoryForTests();
  const client = clientMod.createEntitlementAuthorityClient();
  const opA = { type: "register_publication_intent", intent: intentInput({ intentId: DESC_1 }), now: NOW };
  const opB = { type: "register_publication_intent", intent: intentInput({ intentId: DESC_2 }), now: NOW };
  const [ra, rb] = await Promise.all([client.apply(SID, opA), client.apply(SID, opB)]);
  assert.deepEqual([ra.outcome, rb.outcome].sort(), [
    "publication_intent_joined",
    "publication_intent_recorded",
  ]);
  const final = await client.getState(SID);
  assert.equal(Object.keys(final.publicationIntents).length, 1);
  assert.equal(Object.keys(final.publicationIntentJoins).length, 1);
  assert.equal(sm.isValidEntitlementAuthorityState(final), true);
});

test("email drivers: two concurrent claims through the authority → exactly one claim granted (at-least-once bound, N5)", async () => {
  clientMod.__resetEntitlementAuthorityMemoryForTests();
  const client = clientMod.createEntitlementAuthorityClient();
  await client.apply(SID, { type: "register_publication_intent", intent: intentInput(), now: NOW });
  await client.apply(SID, {
    type: "finalize_publication",
    artifactKey: ARTIFACT,
    intentId: DESC_1,
    generation: 1,
    observation: {
      finalObjectPresent: true,
      finalMetadata: trustedMetadata(DIGEST_A),
      bodyVerifiedDigest: null,
    },
    now: NOW,
  });
  const claimOp = { type: "claim_archive_email_dispatch", artifactKey: ARTIFACT, now: NOW };
  const [c1, c2] = await Promise.all([client.apply(SID, claimOp), client.apply(SID, claimOp)]);
  const granted = [c1, c2].filter((c) => c.outcome === "archive_email_claimed");
  const refused = [c1, c2].filter((c) => c.outcome === "refused");
  assert.equal(granted.length, 1);
  assert.equal(refused.length, 1);
  assert.equal(refused[0].refusal, "archive_email_already_claimed");
});

/** Faithful fake R2 (§8 Class C): honours onlyIf create-only, stores
 * customMetadata verbatim, distinct bytes per key. */
class FakeR2Bucket {
  constructor() {
    this.objects = new Map();
    this.failPuts = 0;
  }
  async put(key, value, options = {}) {
    if (this.failPuts > 0) {
      this.failPuts--;
      const err = new Error("Too many requests");
      err.code = 10058;
      throw err;
    }
    if (options.onlyIf?.etagDoesNotMatch === "*" && this.objects.has(key)) return null;
    const bytes = Buffer.from(value);
    this.objects.set(key, { bytes, customMetadata: { ...(options.customMetadata ?? {}) } });
    return { key, etag: `"etag-${key}"`, httpEtag: `"etag-${key}"`, size: bytes.length, checksums: {}, uploaded: new Date() };
  }
  async head(key) {
    const o = this.objects.get(key);
    if (!o) return null;
    return { key, etag: `"etag-${key}"`, httpEtag: `"etag-${key}"`, size: o.bytes.length, checksums: {}, uploaded: new Date(), customMetadata: o.customMetadata, httpMetadata: {} };
  }
  async get(key) {
    const o = this.objects.get(key);
    if (!o) return null;
    return {
      key,
      etag: `"etag-${key}"`,
      httpEtag: `"etag-${key}"`,
      size: o.bytes.length,
      checksums: {},
      uploaded: new Date(),
      customMetadata: o.customMetadata,
      httpMetadata: {},
      body: null,
      bodyUsed: false,
      arrayBuffer: async () => o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.byteLength),
    };
  }
  async delete(key) {
    this.objects.delete(key);
  }
}

const metaFor = (digest) => ({
  protocol: "dl1-archive-v1",
  artifactKey: ARTIFACT,
  digest,
  bindingDigest: sha(BINDING),
});

test("Class C: two distinct bodies race one fresh key — exactly one created; the stored object is the winner's; loser retries settle as existed", async () => {
  const bucket = new FakeR2Bucket();
  const key = identity.buildFinalKey({
    sessionId: SID, mapId: MAP, fingerprint: FINGERPRINT, contractVersion: 1, rendererVersion: 1,
  });
  const bytesA = new Uint8Array(Buffer.from("winner-or-loser-a"));
  const bytesB = new Uint8Array(Buffer.from("winner-or-loser-b"));
  // Barrier-forced simultaneity (no sleeps): both puts start before either resolves.
  let release;
  const barrier = new Promise((r) => (release = r));
  const gatedPut = async (bytes, digest) => {
    await barrier;
    return storage.promoteCreateOnlyWithBucket(bucket, key, bytes, metaFor(digest), createHash("sha256").update(bytes).digest().buffer);
  };
  const p1 = gatedPut(bytesA, DIGEST_A);
  const p2 = gatedPut(bytesB, DIGEST_B);
  release();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.deepEqual([r1.outcome, r2.outcome].sort(), ["created", "existed"]);
  const stored = bucket.objects.get(key);
  const winnerBytes = r1.outcome === "created" ? bytesA : bytesB;
  const winnerDigest = r1.outcome === "created" ? DIGEST_A : DIGEST_B;
  assert.deepEqual(stored.bytes, Buffer.from(winnerBytes));
  assert.equal(stored.customMetadata.digest, winnerDigest);
  // The loser's bytes appear nowhere.
  const loserRetry = await storage.promoteCreateOnlyWithBucket(
    bucket, key, r1.outcome === "created" ? bytesB : bytesA,
    metaFor(r1.outcome === "created" ? DIGEST_B : DIGEST_A),
    new ArrayBuffer(32),
  );
  assert.equal(loserRetry.outcome, "existed");
  assert.deepEqual(bucket.objects.get(key).bytes, Buffer.from(winnerBytes));
});

test("Class C: a thrown promotion (429-shaped) is UNKNOWN until reconciled — bounded retry then head-compare; head-missing never proves failure", async () => {
  const bucket = new FakeR2Bucket();
  bucket.failPuts = 1; // first attempt throws; the wrapper's bounded retry lands it
  const key = "download-archive/hd/retry/key.png";
  const bytes = new Uint8Array(Buffer.from("retry-body"));
  const r = await storage.promoteCreateOnlyWithBucket(bucket, key, bytes, metaFor(DIGEST_A), new ArrayBuffer(32));
  assert.equal(r.outcome, "created");
  assert.deepEqual(bucket.objects.get(key).bytes, Buffer.from(bytes));
  const deadBucket = new FakeR2Bucket();
  deadBucket.failPuts = 99; // every attempt throws
  const unknown = await storage.promoteCreateOnlyWithBucket(deadBucket, key, bytes, metaFor(DIGEST_A), new ArrayBuffer(32));
  assert.equal(unknown.outcome, "error"); // outcome unknown to the caller: head alone cannot prove non-creation
});

test("U-P2 boundary test: create → delete → create-only put SUCCEEDS again (conditional creation is not lifetime immutability)", async () => {
  const dir = path.join(process.cwd(), ".tmp", "dl1-s4-u-p2");
  const { rm: rmStart } = await import("node:fs/promises");
  await rmStart(dir, { recursive: true, force: true }); // hermetic across runs
  process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR = dir;
  const key = "download-archive/hd/up2/key.png";
  const bytes = new Uint8Array(Buffer.from("u-p2-body"));
  const first = await storage.promoteArtifactCreateOnly(key, bytes, metaFor(DIGEST_A));
  assert.equal(first.outcome, "created");
  const { rm } = await import("node:fs/promises");
  // Remove the stored object (fix round 2: the layout is sharded —
  // remove the whole tree; promotion recreates what it needs).
  await rm(dir, { recursive: true, force: true });
  const second = await storage.promoteArtifactCreateOnly(key, bytes, metaFor(DIGEST_A));
  assert.equal(second.outcome, "created"); // U-P2 labelled: proves the same observable locally
  delete process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR;
});

test("storage taxonomy: head/get distinguish present / genuinely absent / errors-throw", async () => {
  const dir = path.join(process.cwd(), ".tmp", "dl1-s4-taxonomy");
  process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR = dir;
  const key = "download-archive/staging/taxonomy.png";
  await storage.putStagingObject(key, new Uint8Array(Buffer.from("staged")));
  const head = await storage.headArtifactObject(key);
  assert.equal(head.present, true);
  const got = await storage.getArtifactObject(key);
  assert.equal(Buffer.from(got.bytes).toString(), "staged");
  const missing = await storage.headArtifactObject("download-archive/staging/nope.png");
  assert.equal(missing.present, false);
  assert.equal(await storage.getArtifactObject("download-archive/staging/nope.png"), null);
  delete process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR;
});

test("observe (correction round 3 — Codex P2-1): the finalize observation STREAMS the body — digest + metadata with arrayBuffer never called; a mid-stream error throws; a missing key is null", async () => {
  const body = Buffer.alloc(1024 * 1024 + 123);
  for (let i = 0; i < body.length; i++) body[i] = i % 251;
  const chunks = [];
  for (let o = 0; o < body.length; o += 65536) chunks.push(body.subarray(o, o + 65536));
  const streamOf = (failAt = -1) =>
    new ReadableStream({
      start(controller) {
        for (let idx = 0; idx < chunks.length; idx++) {
          if (idx === failAt) {
            controller.error(new Error("mid-stream failure"));
            return;
          }
          controller.enqueue(chunks[idx]);
        }
        controller.close();
      },
    });
  let arrayBufferCalls = 0;
  const bucket = {
    async get(key) {
      if (key === "missing") return null;
      return {
        customMetadata: { ...metaFor(DIGEST_A) },
        body: streamOf(key === "failing" ? 3 : -1),
        arrayBuffer: async () => {
          arrayBufferCalls++;
          throw new Error("arrayBuffer must not be called when a body stream exists");
        },
      };
    },
  };
  const observed = await storage.observeArtifactObjectWithBucket(bucket, "present");
  assert.equal(observed.bodyDigest, sha(body));
  assert.equal(observed.metadata.digest, DIGEST_A);
  assert.equal(observed.metadata.artifactKey, ARTIFACT);
  assert.equal(arrayBufferCalls, 0);
  // A mid-stream read error is an error, never absence (§5.5).
  await assert.rejects(() => storage.observeArtifactObjectWithBucket(bucket, "failing"), /mid-stream failure/);
  assert.equal(await storage.observeArtifactObjectWithBucket(bucket, "missing"), null);
});

test("observe, local seam (correction round 3): a promoted object's observation matches its digest + metadata; a missing key is null", async () => {
  const dir = path.join(process.cwd(), ".tmp", "dl1-s4-observe");
  const { rm } = await import("node:fs/promises");
  await rm(dir, { recursive: true, force: true }); // hermetic across runs
  process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR = dir;
  const key = "download-archive/hd/observe/key.png";
  const bytes = new Uint8Array(Buffer.from("observe-me-body"));
  const promoted = await storage.promoteArtifactCreateOnly(key, bytes, metaFor(DIGEST_A));
  assert.equal(promoted.outcome, "created");
  const observed = await storage.observeArtifactObject(key);
  assert.equal(observed.bodyDigest, sha(bytes));
  assert.equal(observed.metadata.digest, DIGEST_A);
  assert.equal(await storage.observeArtifactObject("download-archive/hd/observe/absent.png"), null);
  delete process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR;
});

test("local promotion (area 6 fix): publication is atomic — overlap readers observe absence or the COMPLETE body, never an empty/partial final file", async () => {
  const dir = path.join(process.cwd(), ".tmp", "dl1-s4-area6");
  const { rm } = await import("node:fs/promises");
  await rm(dir, { recursive: true, force: true }); // hermetic across runs
  process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR = dir;
  const key = "download-archive/hd/area6/key.png";
  // 32 MiB: a non-atomic write would leave a long observable partial window.
  const bytes = new Uint8Array(32 * 1024 * 1024);
  bytes.fill(7);
  let settled = false;
  const promotion = storage
    .promoteArtifactCreateOnly(key, bytes, metaFor(DIGEST_A))
    .then((r) => {
      settled = true;
      return r;
    });
  // Poll the final key for the whole publication window: every
  // observation of a present object must be the complete body.
  const observations = [];
  while (!settled) {
    const head = await storage.headArtifactObject(key);
    if (!head.present) {
      observations.push(0);
      continue;
    }
    const got = await storage.getArtifactObject(key);
    observations.push(got ? got.bytes.length : -1);
  }
  const result = await promotion;
  assert.equal(result.outcome, "created");
  assert.ok(observations.length > 0, "the overlap was actually observed");
  for (const n of observations) {
    assert.ok(n === 0 || n === bytes.length, `partial final file observed: ${n} bytes`);
  }
  const final = await storage.getArtifactObject(key);
  assert.equal(final.bytes.length, bytes.length);
  assert.equal(final.metadata.digest, DIGEST_A);
  // Create-only still holds after the atomic publish, and no temp
  // debris remains anywhere under the directory (fix round 2: files
  // live in shard subdirectories — scan recursively).
  const retry = await storage.promoteArtifactCreateOnly(key, bytes, metaFor(DIGEST_A));
  assert.equal(retry.outcome, "existed");
  const { readdirSync } = await import("node:fs");
  const allNames = [];
  const walk = (d) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      if (name.isDirectory()) walk(path.join(d, name.name));
      else allNames.push(name.name);
    }
  };
  walk(dir);
  assert.deepEqual(allNames.filter((name) => name.includes(".tmp-")), []);
  delete process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR;
});

test("local paths (area 6 fix round 2): every local operation resolves through ONE bounded hash mapping — boundary identities publish, read back, dedupe, and promote", async () => {
  const dir = path.join(process.cwd(), ".tmp", "dl1-s4-area6-bounds");
  const fsp = await import("node:fs/promises");
  const { readdirSync } = await import("node:fs");
  await fsp.rm(dir, { recursive: true, force: true }); // hermetic across runs
  process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR = dir;
  const bodies = new Uint8Array(Buffer.from("boundary-body"));
  // Identity lengths around and beyond the round-1 failure: under the
  // old whole-key base64url component, a key of ~191+ bytes already
  // overflows a 255-byte component once the .meta.json / temp suffixes
  // are added (a max-length final key is ~278 bytes → ~371 encoded).
  const longFinalKey = identity.buildFinalKey({
    sessionId: "s".repeat(128),
    mapId: "m".repeat(64),
    fingerprint: FINGERPRINT,
    contractVersion: 1,
    rendererVersion: 1,
  });
  assert.ok(longFinalKey);
  assert.ok(Buffer.from(longFinalKey, "utf8").toString("base64url").length > 255);
  const keys = [
    "download-archive/staging/short.png",
    longFinalKey,
    `download-archive/hd/${"x".repeat(200)}/k.png`,
    `download-archive/hd/${"y".repeat(500)}/k.png`,
    `download-archive/hd/${"z".repeat(1000)}/k.png`,
    "download-archive/hd/unicode-✓-キー/session:with:colons.png",
    "download-archive/hd/../../traversal.png",
  ];
  // Staging write + head + get (the read paths) for every key…
  for (const key of keys) {
    await storage.putStagingObject(key, bodies);
    const head = await storage.headArtifactObject(key);
    assert.equal(head.present, true, key);
    const got = await storage.getArtifactObject(key);
    assert.deepEqual(Buffer.from(got.bytes), Buffer.from(bodies), key);
  }
  // …then promotion (create-only) + dedupe + metadata read-back on
  // FRESH keys of the same shapes (a staging write IS the file at the
  // key's path, so reusing the staging keys would pre-create them).
  for (const key of keys.map((k) => `${k}#promote`)) {
    const promoted = await storage.promoteArtifactCreateOnly(key, bodies, metaFor(DIGEST_A));
    assert.equal(promoted.outcome, "created", key);
    const again = await storage.promoteArtifactCreateOnly(key, bodies, metaFor(DIGEST_A));
    assert.equal(again.outcome, "existed", key);
    const final = await storage.getArtifactObject(key);
    assert.deepEqual(Buffer.from(final.bytes), Buffer.from(bodies), key);
    assert.equal(final.metadata.digest, DIGEST_A, key);
  }
  // Component bound (acceptance 6.2): walk the tree — every directory
  // and file component is ≤ 255 BYTES, names carry no key material
  // (shard = 2 hex, file = 64 hex, optional .meta.json), and no temp
  // debris survives settlement.
  const components = [];
  const walk = (d) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      components.push(name.name);
      if (name.isDirectory()) walk(path.join(d, name.name));
    }
  };
  walk(dir);
  assert.ok(components.length >= keys.length * 2);
  for (const name of components) {
    assert.ok(Buffer.byteLength(name, "utf8") <= 255, `component too long: ${name}`);
    assert.ok(
      /^[0-9a-f]{2}$/.test(name) || /^[0-9a-f]{64}(\.meta\.json)?$/.test(name),
      `unexpected component shape: ${name}`,
    );
    assert.ok(!name.includes(".tmp-"), `temp debris remains: ${name}`);
  }
  delete process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR;
});

test("local promotion (area 6 fix round 2): a metadata-rename failure removes the meta temp file too; the body stands without its sidecar — the pair is NOT atomic (acceptance 6.6/6.7)", async () => {
  const dir = path.join(process.cwd(), ".tmp", "dl1-s4-area6-rename");
  const fsp = await import("node:fs/promises");
  const { readdirSync, mkdirSync } = await import("node:fs");
  await fsp.rm(dir, { recursive: true, force: true }); // hermetic across runs
  process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR = dir;
  const key = "download-archive/hd/rename-failure/key.png";
  // Pre-create the metadata destination as a DIRECTORY: the sidecar
  // rename then fails deterministically (EISDIR) AFTER the body link
  // has succeeded — the exact round-1 leak path.
  const hash = createHash("sha256").update(key, "utf8").digest("hex");
  const shardDir = path.join(dir, hash.slice(0, 2));
  mkdirSync(shardDir, { recursive: true });
  mkdirSync(path.join(shardDir, `${hash}.meta.json`));
  const bytes = new Uint8Array(Buffer.from("rename-failure-body"));
  const result = await storage.promoteArtifactCreateOnly(key, bytes, metaFor(DIGEST_A));
  // The original publication error remains observable (not masked by
  // cleanup): outcome is "error" carrying the rename failure.
  assert.equal(result.outcome, "error");
  assert.ok(result.error instanceof Error);
  // Cleanup ran on this path too: NO temp file created by the
  // operation remains (the round-1 code leaked the meta temp here).
  const remaining = [];
  const walk = (d) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      if (name.isDirectory()) walk(path.join(d, name.name));
      else remaining.push(name.name);
    }
  };
  walk(dir);
  assert.deepEqual(remaining.filter((n) => n.includes(".tmp-")), []);
  // The recorded final state: the body IS published, complete, with
  // NO metadata sidecar — body and metadata are not an atomic pair,
  // and head/get report exactly that.
  assert.deepEqual(remaining, [hash]);
  const head = await storage.headArtifactObject(key);
  assert.equal(head.present, true);
  assert.equal(head.metadata, null);
  const got = await storage.getArtifactObject(key);
  assert.deepEqual(Buffer.from(got.bytes), Buffer.from(bytes));
  assert.equal(got.metadata, null);
  // A cleanup FAILURE (fs-level fault or process termination) is not
  // separately injectable against the real filesystem in-process; the
  // guarantee is therefore worded as attempted-on-every-path, and the
  // code comment in downloadArchiveStorage.ts carries the limitation
  // verbatim — no assertion here claims unconditional cleanup.
  delete process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR;
});

/* --------------------------- Durable Object --------------------------- */

class FakeSqlStorage {
  constructor(rows = new Map()) {
    this.rows = rows;
  }
  exec(sql, ...params) {
    const head = sql.trimStart().slice(0, 6).toUpperCase();
    if (head.startsWith("CREATE")) return { toArray: () => [] };
    if (head.startsWith("SELECT")) {
      const row = this.rows.get(params[0]);
      return { toArray: () => (row ? [row] : []) };
    }
    if (head.startsWith("INSERT")) {
      const [sessionId, stateJson, updatedAt] = params;
      this.rows.set(sessionId, { session_id: sessionId, state_json: stateJson, updated_at: updatedAt });
      return { toArray: () => [] };
    }
    throw new Error(`unexpected SQL in fake: ${sql.slice(0, 80)}`);
  }
}

test("DO: publication state survives an object restart (real EntitlementAuthorityDO class)", async () => {
  const sql = new FakeSqlStorage();
  const ctx = () => ({
    storage: { sql },
    blockConcurrencyWhile(fn) {
      return fn();
    },
  });
  const first = new EntitlementAuthorityDO(ctx(), {});
  const applied = await first.apply(SID, {
    type: "register_publication_intent",
    intent: intentInput(),
    now: NOW,
  });
  assert.equal(applied.outcome, "publication_intent_recorded");
  const restarted = new EntitlementAuthorityDO(ctx(), {});
  const state = await restarted.getState(SID);
  assert.equal(state.publicationIntents[DESC_1].digest, DIGEST_A);
  assert.equal(state.canonicalArtifactByMap[MAP], ARTIFACT);
  assert.equal(sm.isValidEntitlementAuthorityState(state), true);
});

/* ------------------------------ source pins ------------------------------ */

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..", "..");
const readSrc = (rel) => readFileSync(path.join(appRoot, rel), "utf8");

test("source pins: (v) GET segment is byte-identical to the base capture; (iii) staging keys never appear in it", () => {
  const route = readSrc("src/app/api/download/archive/route.ts");
  const fixture = readFileSync(path.join(here, "fixtures", "archiveRouteGet.base.txt"), "utf8");
  const getStart = route.indexOf("export async function GET");
  const getSegment = route.slice(getStart, getStart + fixture.length);
  assert.equal(getSegment, fixture);
  // The segment boundary is exact: the next character ends the function.
  assert.equal(route[getStart + fixture.length], "\n");
  assert.ok(!getSegment.includes("staging"));
});

test("source pins: (i) no unconditional final-key put in src; (ii) the legacy session key is written ONLY by the flag-OFF legacy handler (area 7 cutover boundary)", () => {
  const storageSrc = readSrc("src/lib/downloadArchiveStorage.ts");
  const routeSrc = readSrc("src/app/api/download/archive/route.ts");
  // (i) every bucket.put in the storage module is either staging (plain,
  // staging-prefixed keys only at call sites) or the promotion put, which
  // must carry the create-only condition.
  const putCalls = storageSrc.match(/bucket\.put\(/g) ?? [];
  assert.equal(putCalls.length, 2);
  assert.ok(storageSrc.includes('etagDoesNotMatch: "*"'));
  // The route's only direct storage write is the legacy handler's
  // bucket.put (the S4 protocol writes exclusively through the storage
  // module's staging/promotion surface).
  const routePuts = routeSrc.match(/\.put\(/g) ?? [];
  assert.equal(routePuts.length, 1);
  // (ii) hdArchiveKey (the legacy key builder) is referenced only by the
  // pre-existing legacy READ paths (route GET segment; the storage
  // module's base hdArchiveObjectExists head), the flag-OFF legacy
  // handler (the one sanctioned write, area 7 P1), and never in any S4
  // protocol/storage section.
  const legacyStart = routeSrc.indexOf("async function handleLegacyPost");
  const routeS4Start = routeSrc.indexOf("/* ================= DL-1 Slice 4 publication protocol");
  assert.ok(legacyStart > -1 && legacyStart < routeS4Start);
  const legacySection = routeSrc.slice(legacyStart, routeS4Start);
  assert.ok(legacySection.includes("ENTITLEMENT_R2.hdArchiveKey(session.sessionId)"));
  // The legacy handler also carries the base archive-ready email wiring.
  assert.ok(legacySection.includes("trySendHdArchiveReadyEmail"));
  assert.ok(routeSrc.slice(0, legacyStart).includes("hdArchiveKey")); // the GET read
  assert.ok(!routeSrc.slice(routeS4Start).includes("hdArchiveKey"));
  const storageS4Start = storageSrc.indexOf("/* ================= DL-1 Slice 4 storage layer");
  assert.ok(!storageSrc.slice(storageS4Start).includes("hdArchiveKey"));
  assert.ok(!/\.put\([^)]*hdArchiveKey/.test(storageSrc + routeSrc));
});

test("source pins: (iv) the publication op list is the §5.4 closed list", () => {
  const stateSrc = readSrc("src/lib/entitlementAuthorityState.ts");
  const cases = stateSrc.match(/case "(register_publication_intent|finalize_publication|claim_archive_email_dispatch|record_archive_email_dispatch)"/g) ?? [];
  assert.equal(cases.length, 4);
});
