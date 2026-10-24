/**
 * DL-1 Slice 4 — artifact identity, binding, and prepare-descriptor module
 * (brief v3 §5.1 + §5.7, as amended by v3.1/v3.2/v3.3 and the pointer
 * amendment).
 *
 * Identity is server-derived: (sessionId, mapId, fingerprint,
 * contractVersion, rendererVersion). The canonical binding is the verbatim
 * output of `stableMapRecipeFingerprint` over the server-loaded recipe; the
 * fingerprint is the lowercase hex SHA-256 of that string. Client-supplied
 * ids, fingerprints, and metadata are never binding proof.
 *
 * Descriptor signing secret (OQ-3, named by the gate 2026-10-24): the
 * dedicated binding `DL1_DESCRIPTOR_SIGNING_SECRET`, resolved ONLY through
 * `getDescriptorSigningSecrets` below. Missing/unusable → fail closed
 * (`identity_rejected` at the route): descriptors are never issued or
 * verified unsigned or weakly signed, and no unrelated secret (payments or
 * otherwise) is ever a fallback. Provisioning is an owner/dashboard
 * activation prerequisite and is NOT part of this slice's build.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { aspectRatioToNumber } from "@/lib/aspectRatio";
import { stableMapRecipeFingerprint } from "@/lib/mapRecipeFingerprint";
import type { MapRecipe } from "@/lib/renderSky";

/** Fingerprint contract v1: the as-built field set of
 * `stableMapRecipeFingerprint`, frozen (brief §5.1). Any change to a
 * contract input bumps this version — never silently remints identities. */
export const FINGERPRINT_CONTRACT_VERSION = 1;

/** Renderer version (brief §5.1): bumped by any render-pipeline change that
 * alters output pixels for the same recipe. Introduced at 1 by this slice. */
export const RENDERER_VERSION = 1;

/** Key-component maxima (brief §5.1, S7-A N6 — named constants). */
export const MAX_SESSION_ID_LENGTH = 128;
export const MAX_MAP_ID_LENGTH = 64;

/** Descriptor lifetime (RES-3 rule-specified constant, set by the lane):
 * identify → the client renders/encodes a 6000 px PNG → upload. 30 minutes
 * covers the render+encode on low-end hardware with wide margin. */
export const DESCRIPTOR_TTL_MS = 30 * 60 * 1000;

/** Protocol marker written into promotion metadata (brief §5.8). */
export const ARCHIVE_PROTOCOL_MARKER = "dl1-archive-v1";

const KEY_COMPONENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const DESCRIPTOR_ID_PATTERN = /^[0-9a-f]{32}$/;

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Canonical binding for a server-loaded recipe (§5.1). */
export function canonicalBindingForRecipe(
  recipe: Pick<
    MapRecipe,
    | "datetimeISO"
    | "location"
    | "textBoxes"
    | "selectedStyle"
    | "aspectRatio"
    | "shape"
    | "renderOptions"
    | "seed"
    | "version"
  >,
): string {
  return stableMapRecipeFingerprint(recipe);
}

/** Fingerprint = lowercase hex SHA-256 of the binding string (UTF-8). */
export function fingerprintForBinding(canonicalBinding: string): string {
  return sha256Hex(canonicalBinding);
}

/**
 * Expected export dimensions are a pure function of the binding (§5.1):
 * width is always 6000; height = max(1, round(6000 / ratio)) with the ratio
 * taken from the binding's `aspectRatio` alone. Returns null when the
 * binding does not parse — a binding this module cannot read cannot ground
 * an intent (validator rule 1 asserts the same derivation over persisted
 * state in entitlementAuthorityState.ts).
 */
export function expectedDimensionsForBinding(
  canonicalBinding: string,
): { expectedWidth: number; expectedHeight: number } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(canonicalBinding);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const aspectRatio = (parsed as { aspectRatio?: unknown }).aspectRatio;
  const ratio = aspectRatioToNumber(
    aspectRatio === "3:4" || aspectRatio === "2:3" || aspectRatio === "4:5"
      ? aspectRatio
      : "square",
  );
  return {
    expectedWidth: 6000,
    expectedHeight: Math.max(1, Math.round(6000 / ratio)),
  };
}

/** Key components are validated before any key is built (§5.1): charset
 * AND length; failure → `identity_rejected` at the caller (no silent
 * encoding, no truncation). */
export function isValidKeyComponent(value: string, maxLength: number): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    KEY_COMPONENT_PATTERN.test(value)
  );
}

export type ArtifactIdentity = {
  sessionId: string;
  mapId: string;
  canonicalBinding: string;
  fingerprint: string;
  contractVersion: number;
  rendererVersion: number;
  artifactId: string;
  finalKey: string;
};

/** artifactId = `hd1:<sessionId>:<mapId>:<fingerprint>:c<cv>:r<rv>` (§5.1).
 * Returns null when any component fails validation. */
export function buildArtifactId(input: {
  sessionId: string;
  mapId: string;
  fingerprint: string;
  contractVersion?: number;
  rendererVersion?: number;
}): string | null {
  const contractVersion = input.contractVersion ?? FINGERPRINT_CONTRACT_VERSION;
  const rendererVersion = input.rendererVersion ?? RENDERER_VERSION;
  if (!isValidKeyComponent(input.sessionId, MAX_SESSION_ID_LENGTH)) return null;
  if (!isValidKeyComponent(input.mapId, MAX_MAP_ID_LENGTH)) return null;
  if (!FINGERPRINT_PATTERN.test(input.fingerprint)) return null;
  if (!Number.isInteger(contractVersion) || contractVersion < 0 || contractVersion > 999999) {
    return null;
  }
  if (!Number.isInteger(rendererVersion) || rendererVersion < 0 || rendererVersion > 999999) {
    return null;
  }
  return `hd1:${input.sessionId}:${input.mapId}:${input.fingerprint}:c${contractVersion}:r${rendererVersion}`;
}

/** Final storage key (§5.1). Null on invalid components. */
export function buildFinalKey(input: {
  sessionId: string;
  mapId: string;
  fingerprint: string;
  contractVersion?: number;
  rendererVersion?: number;
}): string | null {
  const contractVersion = input.contractVersion ?? FINGERPRINT_CONTRACT_VERSION;
  const rendererVersion = input.rendererVersion ?? RENDERER_VERSION;
  if (!buildArtifactId({ ...input, contractVersion, rendererVersion })) return null;
  return `download-archive/hd/${input.sessionId}/${input.mapId}-${input.fingerprint}-c${contractVersion}-r${rendererVersion}.png`;
}

/** Staging key (§5.1): `download-archive/staging/<descriptorId>.png`.
 * Never served, never trusted. Null on a malformed descriptorId. */
export function buildStagingKey(descriptorId: string): string | null {
  if (!DESCRIPTOR_ID_PATTERN.test(descriptorId)) return null;
  return `download-archive/staging/${descriptorId}.png`;
}

/** Derive the full identity from a server-loaded recipe (§5.1/§5.2). */
export function deriveArtifactIdentity(input: {
  sessionId: string;
  mapId: string;
  recipe: Parameters<typeof canonicalBindingForRecipe>[0];
  contractVersion?: number;
  rendererVersion?: number;
}): ArtifactIdentity | null {
  const canonicalBinding = canonicalBindingForRecipe(input.recipe);
  const fingerprint = fingerprintForBinding(canonicalBinding);
  const artifactId = buildArtifactId({
    sessionId: input.sessionId,
    mapId: input.mapId,
    fingerprint,
    contractVersion: input.contractVersion,
    rendererVersion: input.rendererVersion,
  });
  const finalKey = buildFinalKey({
    sessionId: input.sessionId,
    mapId: input.mapId,
    fingerprint,
    contractVersion: input.contractVersion,
    rendererVersion: input.rendererVersion,
  });
  if (!artifactId || !finalKey) return null;
  return {
    sessionId: input.sessionId,
    mapId: input.mapId,
    canonicalBinding,
    fingerprint,
    contractVersion: input.contractVersion ?? FINGERPRINT_CONTRACT_VERSION,
    rendererVersion: input.rendererVersion ?? RENDERER_VERSION,
    artifactId,
    finalKey,
  };
}

/* ------------------------- prepare descriptor (§5.7) ------------------------ */

export type PrepareDescriptorPayload = {
  v: 1;
  descriptorId: string;
  sessionId: string;
  mapId: string;
  fingerprint: string;
  contractVersion: number;
  rendererVersion: number;
  issuedAt: number;
  expiresAt: number;
};

const DESCRIPTOR_SECRET_MIN_LENGTH = 16;

/**
 * The ONE named accessor for the descriptor-signing secret (OQ-3 as named
 * by the gate, amendment v3.3 clause W-4): the dedicated binding
 * `DL1_DESCRIPTOR_SIGNING_SECRET`. An optional
 * `DL1_DESCRIPTOR_SIGNING_SECRET_PREVIOUS` is accepted for VERIFICATION
 * only during a rotation window (§5.7: rotation is an ops concern; no
 * rotation machinery is built in this slice). No other secret qualifies —
 * secret separation is strict (the reviewRequestEmail precedent).
 * Returns [] while the binding is missing/unusable: issuance and
 * verification then fail closed.
 */
export function getDescriptorSigningSecrets(
  env: Record<string, string | undefined> = process.env,
): string[] {
  const secrets: string[] = [];
  for (const key of ["DL1_DESCRIPTOR_SIGNING_SECRET", "DL1_DESCRIPTOR_SIGNING_SECRET_PREVIOUS"] as const) {
    const value = env[key]?.trim();
    if (value && value.length >= DESCRIPTOR_SECRET_MIN_LENGTH) secrets.push(value);
  }
  return secrets;
}

/** Canonical serialisation of the descriptor payload (fixed key order —
 * the §5.7 signing input). */
export function canonicalDescriptorSerialization(payload: PrepareDescriptorPayload): string {
  return JSON.stringify({
    v: payload.v,
    descriptorId: payload.descriptorId,
    sessionId: payload.sessionId,
    mapId: payload.mapId,
    fingerprint: payload.fingerprint,
    contractVersion: payload.contractVersion,
    rendererVersion: payload.rendererVersion,
    issuedAt: payload.issuedAt,
    expiresAt: payload.expiresAt,
  });
}

function signDescriptorPayload(payload: PrepareDescriptorPayload, secret: string): string {
  return createHmac("sha256", secret).update(canonicalDescriptorSerialization(payload)).digest("hex");
}

/**
 * Issue a signed prepare descriptor (§5.7). Returns null when no signing
 * secret is usable (fail closed — the route answers `identity_rejected`).
 * `descriptorId` may be supplied by tests; production issuance always
 * mints a fresh 128-bit random id.
 */
export function issuePrepareDescriptor(input: {
  sessionId: string;
  mapId: string;
  fingerprint: string;
  contractVersion?: number;
  rendererVersion?: number;
  now: number;
  ttlMs?: number;
  descriptorId?: string;
  env?: Record<string, string | undefined>;
}): { descriptor: string; payload: PrepareDescriptorPayload } | null {
  const secrets = getDescriptorSigningSecrets(input.env);
  if (secrets.length === 0) return null;
  const descriptorId = input.descriptorId ?? randomBytes(16).toString("hex");
  if (!DESCRIPTOR_ID_PATTERN.test(descriptorId)) return null;
  const payload: PrepareDescriptorPayload = {
    v: 1,
    descriptorId,
    sessionId: input.sessionId,
    mapId: input.mapId,
    fingerprint: input.fingerprint,
    contractVersion: input.contractVersion ?? FINGERPRINT_CONTRACT_VERSION,
    rendererVersion: input.rendererVersion ?? RENDERER_VERSION,
    issuedAt: input.now,
    expiresAt: input.now + (input.ttlMs ?? DESCRIPTOR_TTL_MS),
  };
  const body = Buffer.from(canonicalDescriptorSerialization(payload), "utf8").toString("base64url");
  return { descriptor: `${body}.${signDescriptorPayload(payload, secrets[0])}`, payload };
}

export type DescriptorVerification =
  | { ok: true; payload: PrepareDescriptorPayload }
  | { ok: false; reason: "identity_rejected" };

/**
 * Verify a presented descriptor (§5.7 classification step 1): unparseable /
 * bad signature / expired / session-mismatched → `identity_rejected`. This
 * is the check W-1's expiry-relation cases turn on: a descriptor whose
 * signed expiry has passed is refused HERE, before Table 1 is ever
 * evaluated — its join record (if any) is retained in authority state, but
 * the presentation itself is dead.
 */
export function verifyPrepareDescriptor(
  descriptor: string,
  input: {
    now: number;
    sessionId?: string;
    env?: Record<string, string | undefined>;
  },
): DescriptorVerification {
  const fail: DescriptorVerification = { ok: false, reason: "identity_rejected" };
  const secrets = getDescriptorSigningSecrets(input.env);
  if (secrets.length === 0) return fail;
  const dot = descriptor.lastIndexOf(".");
  if (dot <= 0) return fail;
  const body = descriptor.slice(0, dot);
  const signature = descriptor.slice(dot + 1);
  if (!/^[0-9a-f]{64}$/.test(signature)) return fail;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return fail;
  }
  if (!parsed || typeof parsed !== "object") return fail;
  const p = parsed as Record<string, unknown>;
  if (p.v !== 1) return fail;
  if (typeof p.descriptorId !== "string" || !DESCRIPTOR_ID_PATTERN.test(p.descriptorId)) return fail;
  if (typeof p.sessionId !== "string" || typeof p.mapId !== "string") return fail;
  if (typeof p.fingerprint !== "string" || !FINGERPRINT_PATTERN.test(p.fingerprint)) return fail;
  if (!Number.isInteger(p.contractVersion) || !Number.isInteger(p.rendererVersion)) return fail;
  if (typeof p.issuedAt !== "number" || typeof p.expiresAt !== "number") return fail;
  const payload: PrepareDescriptorPayload = {
    v: 1,
    descriptorId: p.descriptorId,
    sessionId: p.sessionId,
    mapId: p.mapId,
    fingerprint: p.fingerprint,
    contractVersion: p.contractVersion as number,
    rendererVersion: p.rendererVersion as number,
    issuedAt: p.issuedAt,
    expiresAt: p.expiresAt,
  };
  // Re-serialise canonically and compare the signature in constant time
  // against every accepted secret (current, then previous-in-rotation).
  const provided = Buffer.from(signature, "hex");
  let signatureOk = false;
  for (const secret of secrets) {
    const expected = Buffer.from(signDescriptorPayload(payload, secret), "hex");
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) {
      signatureOk = true;
      break;
    }
  }
  if (!signatureOk) return fail;
  // Liveness is `now < expiresAt` (§5.5 boundary): at expiry, dead.
  if (!(input.now < payload.expiresAt)) return fail;
  if (input.sessionId !== undefined && payload.sessionId !== input.sessionId) return fail;
  return { ok: true, payload };
}
