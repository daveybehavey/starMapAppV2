/**
 * CASL RD-C — the consent tombstone store's shared mechanics (GM-7).
 *
 * Authority chain: A1 (gdot-casl-remediation-design-2026-10-29.md) GM-7 as
 * amended by RD-C's verdict in the B1 amendment round
 * (casl-b1-amendment-round-2026-10-30.md, AM-05..AM-08), the corrected
 * dependency statement in S87-3, and the acceptance criteria in S88-6.
 * Build issue: #458. The B1A-MODEL physical mapping (§3.1/§3.3) places the
 * tombstone records INSIDE the identity's coordinator document — the
 * store's physical form under the shipped single-document architecture
 * (A1 C-3) — indexed logically by keyedDigest under each non-retired
 * digest-key version. The pure record/lookup/register mechanics live
 * here; the state transitions live in consistencyCoordinatorState.ts;
 * the flow-level gathering (register reads, key resolution, digest
 * computation) lives at the bottom of this module so every caller
 * resolves the same facts the same way.
 *
 * GM-7A: a tombstone contains EXACTLY six fields — keyedDigest,
 * digestKeyVersion, generation, terminalEventClass, terminalAt,
 * authorityId — and nothing else: no address, no unsubscribe token, no
 * message content, no free-text reason. Extra fields fail validation.
 *
 * GM-7B(a) as corrected by GM-7E / the GC-1 package: tombstones are
 * retained WITHOUT scheduled expiry while necessary, under the accepted
 * reassessment schedule. There is deliberately NO expiry/TTL/deletion
 * code path in this module: deletion is a recorded owner decision
 * expressly accepting resurrection risk, an owner act — not a mechanism
 * this build automates. The retention PERIOD is a GC-1 acceptance; it
 * is carried as a governed parameter by the register's recorded review
 * state, never as a hard-coded value in code.
 *
 * GM-7C: every tombstone records its digestKeyVersion; lookup tries
 * every non-retired version, current first, and a hit under any
 * non-retired version is a hit. Rotation is an operator act recorded in
 * the register (new version, rotation event, the retirement date chosen
 * for the outgoing version, and the interval/window RECORDED at
 * rotation time — never a hard-coded interval in code). A version may
 * be retired ONLY when a re-keying sweep has re-stamped every live
 * record under it, or the gate has recorded acceptance that lookups
 * under it will fail; a recorded retirement date alone never retires
 * anything. The re-key sweep uses only legitimately available
 * normalized addresses and never reacquires an erased address — the
 * digest is one-way, so no code path here can turn a tombstone back
 * into an address.
 *
 * Lookup honesty (S87-3 §3.1 / S88-6 AC-17): when a required version's
 * key material is unavailable, or stored evidence cannot be verified
 * against the live versions, the lookup is INDETERMINATE. An
 * indeterminate lookup never establishes consent and never reads as a
 * miss: the creation gate refuses on it (fail-closed).
 *
 * Access purpose (GM-7A / S88-6 AC-20): tombstone lookups exist only
 * for suppression enforcement, reconstruction prevention, and audit of
 * those two. Nothing here supports targeting, enrichment, profiling,
 * or address reconstruction, and the store's shape (one-way keyed
 * digests, no address material) makes those uses impossible rather
 * than merely discouraged.
 */
import { createHmac } from "node:crypto";

import { kv } from "@/lib/kv";

/** The three terminal event classes a GM-7A tombstone may record. */
export const PROMOTION_TERMINAL_EVENT_CLASSES = [
  "global_unsubscribe",
  "review_only_opt_out",
  "erasure_with_suppression",
] as const;

export type PromotionTerminalEventClass =
  (typeof PROMOTION_TERMINAL_EVENT_CLASSES)[number];

/**
 * A GM-7A consent tombstone: the complete, proof-minimum record that an
 * identity's consent evidence reduces to (GM-7B(c)). Exactly six
 * fields; {@link isValidPromotionTombstone} rejects anything else.
 */
export type PromotionTombstone = {
  /** HMAC of the normalized address under the digest key of
   *  `digestKeyVersion` — never the address itself. */
  keyedDigest: string;
  /** The digest-key version `keyedDigest` was computed under (GM-7C(a)). */
  digestKeyVersion: number;
  /** The generation the terminal event created (GM-7D(2) reconstructs
   *  at generation + 1). */
  generation: number;
  terminalEventClass: PromotionTerminalEventClass;
  /** Commit timestamp of the terminal event, epoch ms. */
  terminalAt: number;
  /** The coordinator object identity that committed the event
   *  (`promotion:v1:<emailHash>`). */
  authorityId: string;
};

const TOMBSTONE_FIELDS = [
  "authorityId",
  "digestKeyVersion",
  "generation",
  "keyedDigest",
  "terminalAt",
  "terminalEventClass",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/**
 * Strict GM-7A schema validation: exactly the six fields, each of the
 * right shape. A record carrying an address, a token, content, a
 * free-text reason, or ANY extra field is rejected — extra fields fail
 * RD-C schema acceptance by rule, they are not ignored.
 */
export function isValidPromotionTombstone(value: unknown): value is PromotionTombstone {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.length !== TOMBSTONE_FIELDS.length) return false;
  for (let i = 0; i < keys.length; i += 1) {
    if (keys[i] !== TOMBSTONE_FIELDS[i]) return false;
  }
  if (typeof value.keyedDigest !== "string" || value.keyedDigest.length === 0) return false;
  if (!isPositiveInt(value.digestKeyVersion)) return false;
  if (!isPositiveInt(value.generation)) return false;
  if (
    typeof value.terminalEventClass !== "string" ||
    !(PROMOTION_TERMINAL_EVENT_CLASSES as readonly string[]).includes(value.terminalEventClass)
  ) {
    return false;
  }
  if (typeof value.terminalAt !== "number" || !Number.isFinite(value.terminalAt) || value.terminalAt < 0) {
    return false;
  }
  if (typeof value.authorityId !== "string" || value.authorityId.length === 0) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Digest keys (GM-7C)                                                 */
/* ------------------------------------------------------------------ */

/**
 * Minimum key-material length, mirroring the codebase's signing-secret
 * precedent (getSigningSecret in promotionSubscriptions.ts requires
 * >= 16 chars before a secret is usable).
 */
export const PROMOTION_DIGEST_KEY_MIN_LENGTH = 16;

/** The env binding that carries version `n`'s digest key material. */
export function promotionDigestKeyEnvName(version: number): string {
  return `PROMOTION_DIGEST_KEY_V${version}`;
}

/**
 * Resolve the key material for one digest-key version from the
 * environment. Returns null when the version's key is not provisioned
 * or is too short to be key material — an unavailable key is a normal,
 * reportable condition (it makes lookups under that version
 * indeterminate), never an implicit "no records exist".
 */
export function resolvePromotionDigestKey(
  version: number,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (!isPositiveInt(version)) return null;
  const raw = env[promotionDigestKeyEnvName(version)];
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  return key.length >= PROMOTION_DIGEST_KEY_MIN_LENGTH ? key : null;
}

/**
 * The keyed digest of a normalized address under one version's key
 * material: HMAC-SHA256 over `promotion-tombstone:<address>`,
 * base64url — the same construction as the shipped review-suppression
 * identity hash (reviewRequestSuppression.ts), under its own domain
 * separator so the two systems' digests can never collide.
 */
export function computePromotionKeyedDigest(normalizedEmail: string, keyMaterial: string): string {
  return createHmac("sha256", keyMaterial)
    .update(`promotion-tombstone:${normalizedEmail}`)
    .digest("base64url");
}

/* ------------------------------------------------------------------ */
/* The digest-key version register (GM-7C(c)/(d))                      */
/* ------------------------------------------------------------------ */

export type PromotionDigestKeyVersionStatus = "active" | "retired";

/** The only two bases on which a version may retire (GM-7C(d)). */
export type PromotionDigestKeyRetirementBasis =
  | "rekey_sweep_complete"
  | "gate_accepted_lookup_loss";

export type PromotionDigestKeyVersionRecord = {
  version: number;
  status: PromotionDigestKeyVersionStatus;
  /** When this version was created (the initial version: the register
   *  bootstrap instant; later versions: their rotation instant). */
  createdAt: number;
  /** The retirement date CHOSEN for this version when it was rotated
   *  away from (a recorded operational parameter — reaching it retires
   *  nothing by itself). Null while the version is current or when no
   *  date was recorded. */
  chosenRetirementAt: number | null;
  /** The rotation interval recorded at rotation time, in days, when
   *  the operator recorded one. An operational parameter of the
   *  rotation act (GM-7C(e)); code never supplies a default. */
  rotationIntervalDays: number | null;
  /** The rotation window recorded at rotation time, in days, when the
   *  operator recorded one. Same rule as the interval. */
  rotationWindowDays: number | null;
  retiredAt: number | null;
  retirementBasis: PromotionDigestKeyRetirementBasis | null;
};

export type PromotionDigestKeyEvent = {
  kind: "rotation" | "retirement";
  at: number;
  /** Rotation: the outgoing version. Retirement: the retired version. */
  version: number;
  /** Rotation only: the new current version created by the act. */
  newVersion?: number;
  /** Rotation only: the retirement date chosen for the outgoing
   *  version, exactly as recorded by the operator. */
  outgoingChosenRetirementAt?: number | null;
  /** Retirement only: the basis that permitted the retirement. */
  basis?: PromotionDigestKeyRetirementBasis;
};

/**
 * The digest-key register: key METADATA (versions, statuses, rotation
 * events) — never key material and never consent evidence. Key material
 * lives only in the environment bindings (see
 * {@link resolvePromotionDigestKey}); consent authority stays in the
 * coordinator (INV-1 is untouched: this register authorizes nothing,
 * it records which digest versions lookups must cover).
 */
export type PromotionDigestKeyRegister = {
  /** Optimistic-concurrency revision: every act must name the
   *  revision it read; a stale act is refused, never merged. */
  revision: number;
  currentVersion: number;
  versions: Record<string, PromotionDigestKeyVersionRecord>;
  events: PromotionDigestKeyEvent[];
};

/**
 * The bootstrap register, used when no register has ever been recorded:
 * version 1 is the sole, current, active version. This is a defined
 * initial state, not an inference from missing evidence — no tombstone
 * can predate the register because writing one requires key material
 * and the erasure act that records this register's first event.
 */
export function initialPromotionDigestKeyRegister(now: number): PromotionDigestKeyRegister {
  return {
    revision: 0,
    currentVersion: 1,
    versions: {
      "1": {
        version: 1,
        status: "active",
        createdAt: now,
        chosenRetirementAt: null,
        rotationIntervalDays: null,
        rotationWindowDays: null,
        retiredAt: null,
        retirementBasis: null,
      },
    },
    events: [],
  };
}

export function isValidPromotionDigestKeyRegister(value: unknown): value is PromotionDigestKeyRegister {
  if (!isRecord(value)) return false;
  if (typeof value.revision !== "number" || !Number.isInteger(value.revision) || value.revision < 0) return false;
  if (!isPositiveInt(value.currentVersion)) return false;
  if (!isRecord(value.versions) || !Array.isArray(value.events)) return false;
  const current = value.versions[String(value.currentVersion)];
  if (!isRecord(current) || current.status !== "active") return false;
  for (const record of Object.values(value.versions)) {
    if (!isRecord(record)) return false;
    if (!isPositiveInt(record.version)) return false;
    if (record.status !== "active" && record.status !== "retired") return false;
    if (record.status === "retired" && record.retirementBasis === null) return false;
  }
  return true;
}

/** Every version lookups must cover: all non-retired, current first
 *  (GM-7C(b)). */
export function nonRetiredDigestKeyVersions(register: PromotionDigestKeyRegister): number[] {
  const rest = Object.values(register.versions)
    .filter((record) => record.status !== "retired" && record.version !== register.currentVersion)
    .map((record) => record.version)
    .sort((a, b) => b - a);
  return [register.currentVersion, ...rest];
}

export type DigestKeyRegisterActResult = {
  register: PromotionDigestKeyRegister;
  changed: boolean;
  /** Set when the act was refused; the register is returned unchanged. */
  refusal?: string;
};

function cloneRegister(register: PromotionDigestKeyRegister): PromotionDigestKeyRegister {
  return JSON.parse(JSON.stringify(register)) as PromotionDigestKeyRegister;
}

function checkRevision(
  register: PromotionDigestKeyRegister,
  expectedRevision: number,
): string | null {
  if (register.revision !== expectedRevision) {
    return `stale_register_revision:${register.revision}!=${expectedRevision}`;
  }
  return null;
}

/**
 * GM-7C(c) rotation — an operator act, modelled as a pure transition so
 * the act is testable and its recording is exact. The act creates the
 * new current version and records: the rotation event, the retirement
 * date CHOSEN for the outgoing version, and the operational interval /
 * window exactly as the operator recorded them (null when not
 * recorded — code invents no interval). It re-keys NOTHING in place:
 * every existing record keeps the version stamp it was written under.
 */
export function applyRotatePromotionDigestKeys(
  register: PromotionDigestKeyRegister,
  input: {
    now: number;
    expectedRevision: number;
    outgoingChosenRetirementAt: number | null;
    rotationIntervalDays?: number | null;
    rotationWindowDays?: number | null;
  },
): DigestKeyRegisterActResult {
  const stale = checkRevision(register, input.expectedRevision);
  if (stale) return { register, changed: false, refusal: stale };
  const next = cloneRegister(register);
  const outgoing = next.versions[String(next.currentVersion)];
  const newVersion = next.currentVersion + 1;
  outgoing.chosenRetirementAt = input.outgoingChosenRetirementAt;
  outgoing.rotationIntervalDays = input.rotationIntervalDays ?? null;
  outgoing.rotationWindowDays = input.rotationWindowDays ?? null;
  next.versions[String(newVersion)] = {
    version: newVersion,
    status: "active",
    createdAt: input.now,
    chosenRetirementAt: null,
    rotationIntervalDays: null,
    rotationWindowDays: null,
    retiredAt: null,
    retirementBasis: null,
  };
  next.events.push({
    kind: "rotation",
    at: input.now,
    version: outgoing.version,
    newVersion,
    outgoingChosenRetirementAt: input.outgoingChosenRetirementAt,
  });
  next.currentVersion = newVersion;
  next.revision += 1;
  return { register: next, changed: true };
}

/**
 * GM-7C(d) retirement. Refused unless the version exists, is not the
 * current version, is not already retired, AND the act carries one of
 * the two permitted bases: a completed re-keying sweep over every live
 * record under the version, or a gate-recorded acceptance that lookups
 * under it will fail. A chosen retirement date having passed is NOT a
 * basis and retires nothing (S88-6 AC-16's retirement-gate case).
 */
export function applyRetirePromotionDigestKeyVersion(
  register: PromotionDigestKeyRegister,
  input: {
    now: number;
    expectedRevision: number;
    version: number;
    basis: PromotionDigestKeyRetirementBasis | null;
  },
): DigestKeyRegisterActResult {
  const stale = checkRevision(register, input.expectedRevision);
  if (stale) return { register, changed: false, refusal: stale };
  if (input.version === register.currentVersion) {
    return { register, changed: false, refusal: "cannot_retire_current_version" };
  }
  const record = register.versions[String(input.version)];
  if (!record) return { register, changed: false, refusal: "unknown_version" };
  if (record.status === "retired") {
    return { register, changed: false, refusal: "already_retired" };
  }
  if (input.basis !== "rekey_sweep_complete" && input.basis !== "gate_accepted_lookup_loss") {
    return { register, changed: false, refusal: "retirement_basis_required" };
  }
  const next = cloneRegister(register);
  const target = next.versions[String(input.version)];
  target.status = "retired";
  target.retiredAt = input.now;
  target.retirementBasis = input.basis;
  next.events.push({ kind: "retirement", at: input.now, version: input.version, basis: input.basis });
  next.revision += 1;
  return { register: next, changed: true };
}

/* ------------------------------------------------------------------ */
/* Lookup (GM-7C(b) + S87-3 §3.1 honesty rules)                        */
/* ------------------------------------------------------------------ */

/**
 * The facts a lookup is evaluated against, gathered at the flow layer
 * (where the address and the environment are available) and passed
 * into the pure evaluation: the candidate digest of the address under
 * every version whose key material resolved, the versions lookups must
 * cover, and which of those versions' keys actually resolved.
 */
export type PromotionTombstoneLookupFacts = {
  digestsByVersion: Record<string, string>;
  nonRetiredVersions: number[];
  resolvableVersions: number[];
};

export type PromotionTombstoneLookupOutcome =
  | { outcome: "hit"; tombstone: PromotionTombstone }
  | { outcome: "no_hit" }
  | { outcome: "indeterminate"; reason: string };

/**
 * Evaluate one identity's stored tombstones against the lookup facts.
 *
 * - HIT: a stored tombstone's digest equals the address's candidate
 *   digest under a non-retired version whose key resolved (GM-7C(b):
 *   a hit under any non-retired version is a hit).
 * - INDETERMINATE: a stored tombstone sits under a non-retired version
 *   whose key did NOT resolve (it might be a hit we cannot see), or a
 *   stored tombstone under a resolved non-retired version does not
 *   match the address's digest for that version (the record in this
 *   identity's own authority object cannot be accounted for — key
 *   material changed out of band, or the record is corrupt; either way
 *   the honest answer is refusal, not a miss). Indeterminate NEVER
 *   establishes consent (AC-17).
 * - NO HIT: no stored tombstones, or every stored tombstone sits under
 *   a retired version — invisible by the retirement act's own recorded
 *   basis (sweep-complete, or gate-accepted lookup loss), which is the
 *   one path on which a tombstone legitimately stops answering.
 */
export function evaluatePromotionTombstoneLookup(input: {
  tombstones: readonly PromotionTombstone[];
  facts: PromotionTombstoneLookupFacts;
}): PromotionTombstoneLookupOutcome {
  const { tombstones, facts } = input;
  const nonRetired = new Set(facts.nonRetiredVersions);
  const resolvable = new Set(facts.resolvableVersions);
  let indeterminateReason: string | null = null;
  let hit: PromotionTombstone | null = null;
  for (const tombstone of tombstones) {
    if (!nonRetired.has(tombstone.digestKeyVersion)) continue;
    if (!resolvable.has(tombstone.digestKeyVersion)) {
      indeterminateReason = `digest_key_unavailable:v${tombstone.digestKeyVersion}`;
      continue;
    }
    const candidate = facts.digestsByVersion[String(tombstone.digestKeyVersion)];
    if (candidate === tombstone.keyedDigest) {
      // Several tombstones can share one digest (same address, same
      // key version, successive terminal events). The hit that
      // governs is the LATEST terminal event — the highest
      // generation — because GM-7D(2) reconstructs at ITS
      // generation + 1; answering with an earlier tombstone would
      // resurrect a superseded generation.
      if (
        !hit ||
        tombstone.generation > hit.generation ||
        (tombstone.generation === hit.generation && tombstone.terminalAt > hit.terminalAt)
      ) {
        hit = tombstone;
      }
      continue;
    }
    indeterminateReason = `tombstone_digest_mismatch:v${tombstone.digestKeyVersion}`;
  }
  // Indeterminate dominates a hit: when any stored tombstone under a
  // live version cannot be resolved, the GOVERNING record cannot be
  // established (the unresolvable one may be the latest terminal
  // event), so the honest outcome is refusal, not the older hit.
  if (indeterminateReason) return { outcome: "indeterminate", reason: indeterminateReason };
  if (hit) return { outcome: "hit", tombstone: hit };
  return { outcome: "no_hit" };
}

/* ------------------------------------------------------------------ */
/* Register persistence + fact gathering (flow layer)                  */
/* ------------------------------------------------------------------ */

/** KV key for the digest-key register. Metadata only (see the register
 *  type comment); consent authority remains the coordinator. */
export const PROMOTION_DIGEST_KEY_REGISTER_KEY = "promotions:digest-key-register";

/**
 * Read the register, error-preserving (the #454 lesson: a KV read that
 * swallows its error makes an unreadable register look like an empty
 * one, which here would silently shrink lookup coverage). An ABSENT
 * register is the defined bootstrap state; an UNREADABLE one throws
 * KvReadError and every caller must fail closed on it.
 */
export async function readPromotionDigestKeyRegister(now: number): Promise<PromotionDigestKeyRegister> {
  const stored = await kv.getErrorPreserving<unknown>(PROMOTION_DIGEST_KEY_REGISTER_KEY);
  if (stored === null || stored === undefined) return initialPromotionDigestKeyRegister(now);
  if (!isValidPromotionDigestKeyRegister(stored)) {
    throw new Error("promotion digest-key register is malformed; refusing to infer coverage");
  }
  return stored;
}

export async function writePromotionDigestKeyRegister(
  register: PromotionDigestKeyRegister,
): Promise<void> {
  await kv.set(PROMOTION_DIGEST_KEY_REGISTER_KEY, register);
}

/**
 * Gather the lookup facts for one normalized address: the register's
 * non-retired versions and the address's candidate digest under every
 * version whose key material resolves. Throws when the register cannot
 * be read — coverage is then unknown and no caller may proceed as if
 * it were complete.
 */
export function gatherPromotionTombstoneLookupFactsSync(input: {
  normalizedEmail: string;
  register: PromotionDigestKeyRegister;
  env?: Record<string, string | undefined>;
}): PromotionTombstoneLookupFacts {
  const nonRetiredVersions = nonRetiredDigestKeyVersions(input.register);
  const digestsByVersion: Record<string, string> = {};
  const resolvableVersions: number[] = [];
  for (const version of nonRetiredVersions) {
    const key = resolvePromotionDigestKey(version, input.env);
    if (key === null) continue;
    resolvableVersions.push(version);
    digestsByVersion[String(version)] = computePromotionKeyedDigest(input.normalizedEmail, key);
  }
  return { digestsByVersion, nonRetiredVersions, resolvableVersions };
}

export async function gatherPromotionTombstoneLookupFacts(input: {
  normalizedEmail: string;
  now: number;
  env?: Record<string, string | undefined>;
}): Promise<PromotionTombstoneLookupFacts> {
  const register = await readPromotionDigestKeyRegister(input.now);
  return gatherPromotionTombstoneLookupFactsSync({
    normalizedEmail: input.normalizedEmail,
    register,
    env: input.env,
  });
}
