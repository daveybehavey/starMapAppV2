import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  getArtifactObject,
  getDownloadArchiveR2Bucket,
  headArtifactObject,
  promoteArtifactCreateOnly,
  putStagingObject,
} from "@/lib/downloadArchiveStorage";
import { trySendHdArchiveReadyEmail } from "@/lib/accountAccessDelivery";
import { isEntitlementAuthorityRoutingEnabled } from "@/lib/referralRewardAuthority";
import {
  ARCHIVE_PROTOCOL_MARKER,
  DESCRIPTOR_TTL_MS,
  buildFinalKey,
  buildStagingKey,
  deriveArtifactIdentity,
  expectedDimensionsForBinding,
  issuePrepareDescriptor,
  sha256Hex,
  verifyPrepareDescriptor,
  type ArtifactIdentity,
} from "@/lib/downloadArchiveIdentity";
import { createEntitlementAuthorityClient } from "@/lib/entitlementAuthority";
import type {
  EntitlementAuthorityState,
  FinalizeObservation,
  PublicationIntent,
} from "@/lib/entitlementAuthorityState";
import {
  ENTITLEMENT_KV,
  ENTITLEMENT_R2,
  evaluateDigitalAccess,
  type ClaimTokenRecord,
  type StripeSessionEntitlement,
} from "@/lib/entitlementsStore";
import { ARCHIVE_MAX_BYTES, readCountedBody, validatePngBytes } from "@/lib/pngValidation";
import { PREMIUM_COOKIE_NAME } from "@/lib/premium";
import type { MapRecipe } from "@/lib/renderSky";
import { kv } from "@/lib/kv";

export const runtime = "nodejs";

const LOCAL_FALLBACK_DIR = process.env.STARMAP_DOWNLOAD_ARCHIVE_DIR?.trim() || path.join(process.cwd(), ".tmp", "download-archive");
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://starmapco.com").replace(/\/+$/, "");

async function requireEntitledSession(token: string) {
  const claim = await kv.get<ClaimTokenRecord>(ENTITLEMENT_KV.claim(token));
  if (!claim?.sessionId) return null;

  const record = await kv.get<StripeSessionEntitlement>(ENTITLEMENT_KV.stripeSession(claim.sessionId));
  if (!record || !evaluateDigitalAccess(record)) return null;

  return { sessionId: claim.sessionId, record, mapId: claim.mapId ?? record.mapId ?? undefined };
}

async function readLocalObject(key: string) {
  const safeName = Buffer.from(key, "utf8").toString("base64url");
  const filePath = path.join(LOCAL_FALLBACK_DIR, safeName);
  try {
    return await fs.readFile(filePath);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim() || "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  const session = await requireEntitledSession(token);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const key = ENTITLEMENT_R2.hdArchiveKey(session.sessionId);
  const bucket = await getDownloadArchiveR2Bucket();
  let bodyBytes: Uint8Array | null = null;

  if (bucket) {
    const object = await bucket.get(key);
    if (!object) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const arrayBuffer = await object.arrayBuffer();
    bodyBytes = new Uint8Array(arrayBuffer);
  } else {
    bodyBytes = await readLocalObject(key);
    if (!bodyBytes) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
  }

  const filenameBase = session.mapId ? `starmapco-${session.mapId}` : `starmapco-${session.sessionId}`;
  const body = Buffer.from(bodyBytes);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "private, max-age=0, no-store",
      "content-disposition": `attachment; filename="${filenameBase}.png"`,
    },
  });
}

/* ================= Legacy POST — the cutover boundary (area 7 P1) =================
 * The live legacy archive flow, preserved EXACTLY as at base (1a1113b)
 * behind the DL1_AUTHORITY_ROUTING_ENABLED flag: while the flag is OFF
 * (its state until the Slice 6 cutover — David's Sequence A), POST is
 * this handler and nothing else: descriptorless upload → legacy-key
 * storage → archive-ready email. The S4 publication protocol below
 * serves POST only once the flag is ON. The flag is never set in this
 * slice's configuration; the gate's ruling (G-dot conformance verdict
 * 2026-10-24) is that an early flip at S4 merge is NOT acceptable. */

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

async function writeLocalObject(key: string, bytes: Uint8Array) {
  const safeName = Buffer.from(key, "utf8").toString("base64url");
  const filePath = path.join(LOCAL_FALLBACK_DIR, safeName);
  await fs.mkdir(LOCAL_FALLBACK_DIR, { recursive: true });
  await fs.writeFile(filePath, bytes);
}

async function handleLegacyPost(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim() || "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  const session = await requireEntitledSession(token);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type")?.trim().toLowerCase() || "";
  if (!contentType.includes("image/png")) {
    return NextResponse.json(
      { ok: false, error: "content-type must be image/png" },
      { status: 415 },
    );
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ ok: false, error: "invalid_size" }, { status: 413 });
  }

  const key = ENTITLEMENT_R2.hdArchiveKey(session.sessionId);
  const bucket = await getDownloadArchiveR2Bucket();

  if (bucket) {
    await bucket.put(key, bytes, {
      httpMetadata: {
        contentType: "image/png",
      },
      customMetadata: {
        sessionId: session.sessionId,
        mapId: session.mapId ?? "",
      },
    });
  } else {
    await writeLocalObject(key, bytes);
  }

  void trySendHdArchiveReadyEmail({
    siteOrigin: siteUrl,
    sessionId: session.sessionId,
  }).catch((err) => {
    console.warn("HD archive ready email failed", err);
  });

  return NextResponse.json({ ok: true, sessionId: session.sessionId, bytes: bytes.length });
}

/* ================= DL-1 Slice 4 publication protocol (§5.2/§5.6–§5.9) =================
 * POST is the publication protocol: JSON identify / reconcile, the
 * descriptor-form upload, and the legacy fused form — reachable ONLY
 * while DL1_AUTHORITY_ROUTING_ENABLED is ON (see the cutover boundary
 * above; until the S6 cutover the legacy handler serves every POST).
 * The GET above is NOT modified (OQ-1 ruling): it serves only the
 * legacy session-key object, and no S4 path serves a new-protocol
 * artifact.
 *
 * Email (§5.9): finalization opens `archiveEmail.state = "pending"` in
 * the authority, atomically with the registry entry. New-protocol
 * artifacts are NEVER dispatched in this slice — the delivery-
 * resolvability fence gates the whole claim → send → record sequence,
 * claim included, because the S4 GET cannot serve them. The pending
 * record persists as Slice 5's drain obligation. The legacy flow keeps
 * its archive-ready email via `trySendHdArchiveReadyEmail`, wired in
 * the legacy handler only. */

type ResolvedSession = {
  sessionId: string;
  record: StripeSessionEntitlement;
  claimMapId: string | undefined;
  recordMapId: string | undefined;
  viaCookie: boolean;
};

function identityRejected() {
  return NextResponse.json(
    { ok: false, error: "identity_rejected", state: "identity_rejected" },
    { status: 401 },
  );
}

function publicationConflict() {
  return NextResponse.json(
    { ok: false, error: "publication_conflict", state: "publication_conflict" },
    { status: 409 },
  );
}

function retryable(state: "upload_failed" | "finalization_pending", status = 503) {
  return NextResponse.json({ ok: false, error: state, state }, { status });
}

/** §5.6 same-origin check for cookie-authenticated mutations: scheme +
 * host + port (default-port normalised) against the configured origin. */
function originMatchesSite(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const presented = new URL(origin);
    const trusted = new URL(siteUrl);
    const normalise = (u: URL) =>
      `${u.protocol}//${u.hostname}:${u.port || (u.protocol === "https:" ? "443" : "80")}`;
    return normalise(presented) === normalise(trusted);
  } catch {
    return false;
  }
}

/**
 * §5.6 resolver. Precedence: when a claim token is present it governs
 * and the cookie is ignored entirely. The cookie yields a sessionId
 * only; the session record is loaded and `evaluateDigitalAccess` runs
 * exactly as on the token path. Cookie-authenticated mutations are
 * same-origin only.
 */
async function resolveSession(req: NextRequest): Promise<ResolvedSession | null> {
  const token = req.nextUrl.searchParams.get("token")?.trim() || "";
  if (token) {
    const claim = await kv.get<ClaimTokenRecord>(ENTITLEMENT_KV.claim(token));
    if (!claim?.sessionId) return null;
    const record = await kv.get<StripeSessionEntitlement>(
      ENTITLEMENT_KV.stripeSession(claim.sessionId),
    );
    if (!record || !evaluateDigitalAccess(record)) return null;
    return {
      sessionId: claim.sessionId,
      record,
      claimMapId: claim.mapId ?? undefined,
      recordMapId: record.mapId ?? undefined,
      viaCookie: false,
    };
  }
  const cookieSessionId = req.cookies.get(PREMIUM_COOKIE_NAME)?.value?.trim() || "";
  if (!cookieSessionId) return null;
  if (!originMatchesSite(req)) return null;
  const record = await kv.get<StripeSessionEntitlement>(
    ENTITLEMENT_KV.stripeSession(cookieSessionId),
  );
  if (!record || !evaluateDigitalAccess(record)) return null;
  return {
    sessionId: cookieSessionId,
    record,
    claimMapId: undefined,
    recordMapId: record.mapId ?? undefined,
    viaCookie: true,
  };
}

/**
 * §5.2 ACQUISITION rule (identify, descriptor classification, upload):
 * fresh derivation governs. Runs before any registry or storage access.
 * Any failure is `identity_rejected` (the caller maps null → 401).
 */
async function deriveIdentityForMap(
  session: ResolvedSession,
  candidateMapId: string | undefined,
): Promise<ArtifactIdentity | null> {
  if (
    session.claimMapId &&
    session.recordMapId &&
    session.claimMapId !== session.recordMapId
  ) {
    return null; // conflicting record: today's silent claim-preference is abolished
  }
  const boundMapId = session.claimMapId ?? session.recordMapId;
  const candidate = candidateMapId ?? boundMapId;
  if (!candidate) return null;
  if (boundMapId && candidate !== boundMapId) return null;
  const recipe = await kv.get<MapRecipe>(ENTITLEMENT_KV.mapRecipe(candidate));
  if (!recipe) return null; // no canonical recipe, no identity
  return deriveArtifactIdentity({
    sessionId: session.sessionId,
    mapId: candidate,
    recipe,
  });
}

/** §5.5 governance derivation for readers (identify/dedupe): the
 * pointer-named intent governs iff live at `now`. */
function governingIntentFromState(
  state: EntitlementAuthorityState,
  artifactKey: string,
  now: number,
): PublicationIntent | null {
  const intentId = (state.publicationIntentByArtifact ?? {})[artifactKey];
  if (!intentId) return null;
  const intent = (state.publicationIntents ?? {})[intentId];
  if (!intent || intent.artifactKey !== artifactKey) return null;
  return now < intent.expiresAt ? intent : null;
}

/** Collision check over persisted state (§5.1 site (a) shape): any
 * record for this artifactId holding a divergent binding string. */
function stateHasCollision(
  state: EntitlementAuthorityState,
  identity: ArtifactIdentity,
): boolean {
  const entry = (state.artifactRegistry ?? {})[identity.artifactId];
  if (entry && entry.canonicalBinding !== identity.canonicalBinding) return true;
  for (const intent of Object.values(state.publicationIntents ?? {})) {
    if (
      intent.artifactKey === identity.artifactId &&
      intent.canonicalBinding !== identity.canonicalBinding
    ) {
      return true;
    }
  }
  for (const join of Object.values(state.publicationIntentJoins ?? {})) {
    if (
      join.artifactKey === identity.artifactId &&
      join.canonicalBinding !== identity.canonicalBinding
    ) {
      return true;
    }
  }
  return false;
}

async function observeFinalObject(finalKey: string): Promise<FinalizeObservation> {
  const object = await getArtifactObject(finalKey);
  if (!object) {
    return { finalObjectPresent: false, finalMetadata: null, bodyVerifiedDigest: null };
  }
  return {
    finalObjectPresent: true,
    finalMetadata: object.metadata,
    // The caller actually read and hashed the final object's body in
    // this request (§5.4 trusted-producer rule).
    bodyVerifiedDigest: sha256Hex(object.bytes),
  };
}

/* ------------------------------- identify -------------------------------- */

async function handleIdentify(session: ResolvedSession, mapId: string | undefined) {
  const identity = await deriveIdentityForMap(session, mapId);
  if (!identity) return identityRejected();
  const client = createEntitlementAuthorityClient();
  const state = await client.getState(session.sessionId);
  const now = Date.now();
  if (state && stateHasCollision(state, identity)) return publicationConflict();
  const entry = state ? (state.artifactRegistry ?? {})[identity.artifactId] : undefined;
  // V-8 identify decision table (recovery named, never bare):
  if (entry?.state === "finalized") {
    // I-1 — terminal fact, no descriptor.
    return NextResponse.json({
      ok: true,
      state: "already_finalized",
      artifactId: identity.artifactId,
    });
  }
  if (entry?.state === "conflicted") {
    // I-2 — terminal; support path.
    return publicationConflict();
  }
  const governing = state ? governingIntentFromState(state, identity.artifactId, now) : null;
  if (governing) {
    let present: boolean | null = null;
    try {
      present = (await headArtifactObject(identity.finalKey)).present;
    } catch {
      present = null; // read error collapses to NEITHER row (V-8 note 3)
    }
    if (present === true) {
      // I-4 — bytes exist; arbitration, not re-upload, is what is missing.
      return NextResponse.json({
        ok: true,
        state: "finalization_pending",
        artifactId: identity.artifactId,
        recovery: "reconcile",
      });
    }
    if (present === false) {
      // I-3 — the intent exists; the bytes never landed. Descriptor issued.
      const issued = issuePrepareDescriptor({
        sessionId: session.sessionId,
        mapId: identity.mapId,
        fingerprint: identity.fingerprint,
        contractVersion: identity.contractVersion,
        rendererVersion: identity.rendererVersion,
        now,
      });
      if (!issued) return identityRejected(); // signing secret absent: fail closed (OQ-3)
      return NextResponse.json({
        ok: true,
        state: "finalization_pending",
        artifactId: identity.artifactId,
        descriptor: issued.descriptor,
        recovery: "upload",
      });
    }
    return NextResponse.json({
      ok: true,
      state: "finalization_pending",
      artifactId: identity.artifactId,
      recovery: "reconcile",
    });
  }
  // I-5 — no entry, no live governing intent: identified, fresh upload.
  const issued = issuePrepareDescriptor({
    sessionId: session.sessionId,
    mapId: identity.mapId,
    fingerprint: identity.fingerprint,
    contractVersion: identity.contractVersion,
    rendererVersion: identity.rendererVersion,
    now,
  });
  if (!issued) return identityRejected();
  return NextResponse.json({
    ok: true,
    state: "identified",
    artifactId: identity.artifactId,
    descriptor: issued.descriptor,
  });
}

/* -------------------------------- upload --------------------------------- */

type UploadForm = {
  session: ResolvedSession;
  identity: ArtifactIdentity;
  intentId: string;
  intentExpiresAt: number;
  stagingKey: string;
  fused: boolean;
};

/**
 * The shared upload pipeline (§5.9/§5.10): counted read → validate →
 * hash → finalized-repost comparison → stage → register (Table 1) →
 * promote (§5.8) → finalize (Table 2). Only after finalization does any
 * form return a success shape.
 */
async function runPublicationUpload(req: NextRequest, form: UploadForm) {
  const { session, identity, fused } = form;
  const client = createEntitlementAuthorityClient();

  // §5.10 step 1 — counted read; abort the moment the count exceeds the cap.
  if (!req.body) {
    return NextResponse.json({ ok: false, error: "invalid_size" }, { status: 413 });
  }
  const counted = await readCountedBody(
    req.body as unknown as AsyncIterable<Uint8Array>,
    ARCHIVE_MAX_BYTES,
  );
  if (!counted.ok) {
    return NextResponse.json(
      { ok: false, error: "invalid_size", state: "upload_failed" },
      { status: 413 },
    );
  }
  const bytes = counted.bytes;
  if (!bytes.length) {
    return NextResponse.json({ ok: false, error: "invalid_size" }, { status: 413 });
  }

  // §5.10 steps 2–4 — chunk/CRC validation, streaming-inflate validation
  // against the binding-derived dimensions, SHA-256. Invalid bytes are
  // never written anywhere, staging included.
  const dims = expectedDimensionsForBinding(identity.canonicalBinding);
  if (!dims) return identityRejected();
  const validation = await validatePngBytes(bytes, dims);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.reason, state: "upload_failed" },
      { status: 422 },
    );
  }
  const digest = validation.digest;

  const successShape = (alreadyFinalized: boolean) =>
    fused
      ? // Today's success shape, returned ONLY after finalization (§5.9).
        NextResponse.json({ ok: true, sessionId: session.sessionId, bytes: bytes.length })
      : NextResponse.json({
          ok: true,
          state: alreadyFinalized ? "already_finalized" : "finalized",
          artifactId: identity.artifactId,
        });

  // Finalized-repost comparison (§5.9 fused form; clause V-7 descriptor
  // form): the comparison always runs once this request's digest exists.
  const stateBefore = await client.getState(session.sessionId);
  if (stateBefore && stateHasCollision(stateBefore, identity)) {
    return publicationConflict();
  }
  const entryBefore = stateBefore
    ? (stateBefore.artifactRegistry ?? {})[identity.artifactId]
    : undefined;
  if (entryBefore?.state === "finalized") {
    return entryBefore.digest === digest ? successShape(true) : publicationConflict();
  }
  if (entryBefore?.state === "conflicted") return publicationConflict();

  // §5.10 step 5 — staging (untrusted scratch), then registration.
  try {
    await putStagingObject(form.stagingKey, bytes);
  } catch {
    return retryable("upload_failed");
  }
  const registered = await client.apply(session.sessionId, {
    type: "register_publication_intent",
    intent: {
      intentId: form.intentId,
      artifactKey: identity.artifactId,
      sessionId: session.sessionId,
      mapId: identity.mapId,
      canonicalBinding: identity.canonicalBinding,
      fingerprint: identity.fingerprint,
      contractVersion: identity.contractVersion,
      rendererVersion: identity.rendererVersion,
      digest,
      stagingKey: form.stagingKey,
      expectedWidth: dims.expectedWidth,
      expectedHeight: dims.expectedHeight,
      expiresAt: form.intentExpiresAt,
    },
    now: Date.now(),
  });
  if (!registered) return retryable("upload_failed"); // authority unavailable: retryable, never absence
  if (registered.outcome === "refused") {
    switch (registered.refusal) {
      case "already_finalized": {
        const carried = registered.publication?.entry;
        return carried && carried.digest === digest
          ? successShape(true)
          : publicationConflict();
      }
      case "publication_conflict":
        return publicationConflict();
      case "intent_payload_conflict":
        return NextResponse.json(
          { ok: false, error: "intent_payload_conflict", state: "publication_conflict" },
          { status: 409 },
        );
      case "identity_rejected":
        return identityRejected();
      default:
        return retryable("upload_failed");
    }
  }
  const governingIntentId = registered.publication?.intentId ?? form.intentId;
  const generation = registered.publication?.generation ?? 0;

  // §5.8 create-only promotion of the validated in-memory body (never a
  // staging re-read).
  const promotion = await promoteArtifactCreateOnly(identity.finalKey, bytes, {
    protocol: ARCHIVE_PROTOCOL_MARKER,
    artifactKey: identity.artifactId,
    digest,
    bindingDigest: sha256Hex(identity.canonicalBinding),
  });
  if (promotion.outcome === "error") return retryable("upload_failed");

  // Finalize (Table 2) from a fresh observation; one internal reconcile
  // retry before answering finalization_pending (§5.9 fused rule).
  for (let attempt = 0; attempt < 2; attempt++) {
    let observation: FinalizeObservation;
    try {
      observation = await observeFinalObject(identity.finalKey);
    } catch {
      return retryable("finalization_pending"); // storage errors are never absence
    }
    const finalized = await client.apply(session.sessionId, {
      type: "finalize_publication",
      artifactKey: identity.artifactId,
      intentId: governingIntentId,
      generation,
      observation,
      presentedBinding: identity.canonicalBinding,
      now: Date.now(),
    });
    if (!finalized) return retryable("finalization_pending");
    // Terminal-success digest comparison (conformance fix round, area
    // 7 P2 — bot CB-P2a as ruled by the gate): success is reported only
    // when the entry the authority finalized names THIS request's
    // digest. Arbitration is presenter-independent (V-3), so this
    // finalize call can land on a successor's entry (F1/F2/F6 over the
    // current governing intent); acknowledging that entry as this
    // upload's success would be false. Mirrors the finalized-repost
    // comparison and the register-refusal comparison above.
    const finalizedEntry = finalized.publication?.entry;
    if (finalized.outcome === "publication_finalized") {
      return finalizedEntry && finalizedEntry.digest === digest
        ? successShape(false)
        : publicationConflict();
    }
    if (finalized.outcome === "publication_already_finalized") {
      return finalizedEntry && finalizedEntry.digest === digest
        ? successShape(true)
        : publicationConflict();
    }
    if (finalized.outcome === "publication_conflicted") return publicationConflict();
    if (finalized.outcome === "refused" && finalized.refusal === "publication_conflict") {
      return publicationConflict();
    }
    // finalization_pending: loop once for the internal reconcile retry.
  }
  return retryable("finalization_pending");
}

async function handleDescriptorUpload(req: NextRequest, session: ResolvedSession) {
  const descriptorToken = req.headers.get("x-prepare-descriptor")?.trim() || "";
  const now = Date.now();
  // §5.7 classification (exactly this order): (1) unparseable / bad
  // signature / expired / session-mismatched → identity_rejected. This
  // is where W-1's earlier/equal expiry-relation cases die: an expired
  // descriptor is refused here, before Table 1 — its join record (if
  // any) is retained in authority state, the pointer unmoved.
  const verified = verifyPrepareDescriptor(descriptorToken, {
    now,
    sessionId: session.sessionId,
  });
  if (!verified.ok) return identityRejected();
  // (2) identity drift vs the freshly derived identity → prepare_stale.
  const identity = await deriveIdentityForMap(session, verified.payload.mapId);
  if (!identity) return identityRejected();
  if (
    verified.payload.fingerprint !== identity.fingerprint ||
    verified.payload.contractVersion !== identity.contractVersion ||
    verified.payload.rendererVersion !== identity.rendererVersion
  ) {
    return NextResponse.json(
      { ok: false, error: "prepare_stale", state: "prepare_stale" },
      { status: 409 },
    );
  }
  const stagingKey = buildStagingKey(verified.payload.descriptorId);
  if (!stagingKey) return identityRejected();
  // (3) proceed to upload. intentId = descriptorId; the intent's expiry
  // is the descriptor's signed expiry (descriptor-form sourcing, §5.4).
  return runPublicationUpload(req, {
    session,
    identity,
    intentId: verified.payload.descriptorId,
    intentExpiresAt: verified.payload.expiresAt,
    stagingKey,
    fused: false,
  });
}

async function handleFusedUpload(req: NextRequest, session: ResolvedSession) {
  const identity = await deriveIdentityForMap(session, undefined);
  if (!identity) return identityRejected();
  // Fused form: route-minted unique intentId; the expiry is route-stamped
  // now + the §5.7 descriptor TTL, exactly as if a descriptor had been
  // issued at this internal identify (§5.4 expiry sourcing).
  const intentId = randomBytes(16).toString("hex");
  const stagingKey = buildStagingKey(intentId);
  if (!stagingKey) return identityRejected();
  return runPublicationUpload(req, {
    session,
    identity,
    intentId,
    intentExpiresAt: Date.now() + DESCRIPTOR_TTL_MS,
    stagingKey,
    fused: true,
  });
}

/* ------------------------------- reconcile ------------------------------- */

async function handleReconcile(session: ResolvedSession, artifactId: string) {
  // Reconciliation runs NO fresh derivation and loads no recipe (§5.2):
  // the recorded intent governs. The artifactId is parsed only to locate
  // the object and to check the session binding.
  const parts = artifactId.split(":");
  if (parts.length !== 6 || parts[0] !== "hd1") return identityRejected();
  const [, sessionIdPart, mapId, fingerprint, contractPart, rendererPart] = parts;
  if (sessionIdPart !== session.sessionId) return identityRejected();
  const finalKey = buildFinalKey({
    sessionId: sessionIdPart,
    mapId,
    fingerprint,
    contractVersion: Number(contractPart.slice(1)),
    rendererVersion: Number(rendererPart.slice(1)),
  });
  if (!finalKey) return identityRejected();
  const client = createEntitlementAuthorityClient();
  const state = await client.getState(session.sessionId);
  const governing = state
    ? governingIntentFromState(state, artifactId, Date.now())
    : null;
  let observation: FinalizeObservation;
  try {
    observation = await observeFinalObject(finalKey);
  } catch {
    return retryable("finalization_pending");
  }
  const finalized = await client.apply(session.sessionId, {
    type: "finalize_publication",
    artifactKey: artifactId,
    intentId: governing?.intentId ?? "",
    generation: governing?.generation ?? 0,
    observation,
    presentedBinding: null, // standalone reconcile: no string comparison (§5.4)
    now: Date.now(),
  });
  if (!finalized) return retryable("finalization_pending");
  if (finalized.outcome === "publication_finalized") {
    return NextResponse.json({ ok: true, state: "finalized", artifactId });
  }
  if (finalized.outcome === "publication_already_finalized") {
    return NextResponse.json({ ok: true, state: "already_finalized", artifactId });
  }
  if (finalized.outcome === "publication_conflicted") return publicationConflict();
  if (finalized.outcome === "refused" && finalized.refusal === "publication_conflict") {
    return publicationConflict();
  }
  return retryable("finalization_pending");
}

/* --------------------------------- POST ---------------------------------- */

/**
 * The cutover boundary (area 7 P1): with DL1_AUTHORITY_ROUTING_ENABLED
 * OFF — its state until the Slice 6 cutover — POST is the legacy flow
 * exactly as at base. The S4 publication protocol serves POST only with
 * the flag ON. The flag is read per request, like the webhook's.
 */
export async function POST(req: NextRequest) {
  if (!isEntitlementAuthorityRoutingEnabled()) return handleLegacyPost(req);
  return handleProtocolPost(req);
}

async function handleProtocolPost(req: NextRequest) {
  const contentType = req.headers.get("content-type")?.trim().toLowerCase() || "";

  if (contentType.includes("application/json")) {
    // Authentication / session authorisation runs on EVERY operation,
    // before any registry or storage access (§5.6 as amended by V-4).
    const session = await resolveSession(req);
    if (!session) return identityRejected();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }
    const op = (body as { op?: unknown } | null)?.op;
    if (op === "identify") {
      const mapId = (body as { mapId?: unknown }).mapId;
      return handleIdentify(session, typeof mapId === "string" ? mapId : undefined);
    }
    if (op === "reconcile") {
      const artifactId = (body as { artifactId?: unknown }).artifactId;
      return handleReconcile(session, typeof artifactId === "string" ? artifactId : "");
    }
    return NextResponse.json({ ok: false, error: "unknown_op" }, { status: 400 });
  }

  // Byte-carrying forms (descriptor upload + legacy fused). Legacy
  // conventions preserved: 400 on a missing token when no credential of
  // any kind is presented; 401 unauthorised; 415 content-type.
  const token = req.nextUrl.searchParams.get("token")?.trim() || "";
  const hasCookie = Boolean(req.cookies.get(PREMIUM_COOKIE_NAME)?.value);
  const hasDescriptor = Boolean(req.headers.get("x-prepare-descriptor")?.trim());
  const session = await resolveSession(req);
  if (!session) {
    if (!token && !hasCookie && !hasDescriptor) {
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
    }
    return NextResponse.json(
      { ok: false, error: "identity_rejected", state: "identity_rejected" },
      { status: 401 },
    );
  }
  if (!contentType.includes("image/png")) {
    return NextResponse.json(
      { ok: false, error: "content-type must be image/png" },
      { status: 415 },
    );
  }
  if (hasDescriptor) return handleDescriptorUpload(req, session);
  return handleFusedUpload(req, session);
}
