import { getCloudflareContext } from "@opennextjs/cloudflare";
import fs from "node:fs/promises";
import path from "node:path";

type KvSetOptions = { ex?: number; px?: number };
type KvIncrOptions = { ex?: number; px?: number };
type KvListOptions = { prefix?: string; cursor?: string; limit?: number };
type CloudflareKvNamespace = {
  get<T>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }>;
};

const CLOUDFLARE_KV_BINDING = "STAR_MAP_KV";
const memoryStore: Map<string, unknown> =
  (globalThis as typeof globalThis & { __starmapKv?: Map<string, unknown> }).__starmapKv ?? new Map();
const fallbackKvDir = process.env.STARMAP_KV_DIR?.trim() || path.join(process.cwd(), ".tmp", "kv-store");
// Playwright/CI uses a local Next server. Some KV adapters can report `null` even after writes.
// In CI we mirror writes into local memory + fallback-file storage to keep API regression tests deterministic.
const MIRROR_KV_LOCAL_IN_CI = process.env.CI === "1";

if (!(globalThis as typeof globalThis & { __starmapKv?: Map<string, unknown> }).__starmapKv) {
  (globalThis as typeof globalThis & { __starmapKv?: Map<string, unknown> }).__starmapKv = memoryStore;
}

/** Surfaces a durable Cloudflare KV write failure (never converted into local-only success). */
export class KvDurableWriteError extends Error {
  readonly code = "kv_durable_write_failed";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "KvDurableWriteError";
  }
}

/** Surfaces a durable Cloudflare KV delete failure (never converted into local-only success). */
export class KvDurableDeleteError extends Error {
  readonly code = "kv_durable_delete_failed";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "KvDurableDeleteError";
  }
}

/**
 * Ordinary (non-durable) KV write failed without a safe local fallback.
 * Callers that treat KV as best-effort analytics/cache must soft-catch this;
 * never convert a Cloudflare binding failure into a fake filesystem success on Workers.
 */
export class KvSoftWriteError extends Error {
  readonly code = "kv_soft_write_failed";
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "KvSoftWriteError";
  }
}

/** True for strict durable put/delete failures that must not be swallowed as soft errors. */
export function isDurableKvPersistenceError(error: unknown): boolean {
  return error instanceof KvDurableWriteError || error instanceof KvDurableDeleteError;
}

/**
 * Explicit boundary for intentional local/CI KV mode.
 * Production Cloudflare outages must not silently fall through here when a binding was expected.
 */
export function isLocalKvFallbackAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.STARMAP_KV_ALLOW_LOCAL === "1") return true;
  if (env.CI === "1") return true;
  const nodeEnv = env.NODE_ENV?.trim();
  return nodeEnv === "development" || nodeEnv === "test";
}

function fallbackFilePathForKey(key: string) {
  const encoded = Buffer.from(key, "utf8").toString("base64url");
  return path.join(fallbackKvDir, `${encoded}.json`);
}

async function readFallbackValue<T>(key: string): Promise<T | null> {
  const filePath = fallbackFilePathForKey(key);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeFallbackValue<T>(key: string, value: T): Promise<void> {
  const filePath = fallbackFilePathForKey(key);
  await fs.mkdir(fallbackKvDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value), "utf8");
}

async function removeFallbackValue(key: string): Promise<void> {
  const filePath = fallbackFilePathForKey(key);
  try {
    await fs.unlink(filePath);
  } catch {
    // Missing fallback file is a successful delete outcome.
  }
}

async function getCloudflareKv(): Promise<CloudflareKvNamespace | null> {
  const timeoutMs = 120;
  try {
    const cloudflareContext = await Promise.race([
      getCloudflareContext({ async: true }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!cloudflareContext) return null;
    const { env } = cloudflareContext;
    const bindings = env as unknown as Record<string, unknown> | undefined;
    return (bindings?.[CLOUDFLARE_KV_BINDING] as CloudflareKvNamespace | undefined) ?? null;
  } catch {
    return null;
  }
}

function ttlFromOptions(options?: { ex?: number; px?: number }) {
  if (!options) return undefined;
  const ex = (options as { ex?: number }).ex;
  if (typeof ex === "number" && Number.isFinite(ex)) return Math.max(1, Math.floor(ex));
  const px = (options as { px?: number }).px;
  if (typeof px === "number" && Number.isFinite(px)) return Math.max(1, Math.ceil(px / 1000));
  return undefined;
}

/**
 * Durable put orchestration used by {@link kv.setDurable}.
 * When a Cloudflare namespace is present, put failures propagate and must not populate local fallback.
 * Exported for focused unit tests with injectable deps.
 */
export async function persistDurableKvPut<T>(input: {
  cfKv: CloudflareKvNamespace | null;
  allowLocalFallback: boolean;
  mirrorLocalInCi: boolean;
  key: string;
  value: T;
  ttlSeconds?: number;
  memoryStore: Map<string, unknown>;
  writeFallback: (key: string, value: T) => Promise<void>;
}): Promise<"OK"> {
  if (input.cfKv) {
    try {
      await input.cfKv.put(
        input.key,
        JSON.stringify(input.value),
        input.ttlSeconds ? { expirationTtl: input.ttlSeconds } : undefined
      );
    } catch (error) {
      // Do not write memory/file fallback after a remote failure — a later read must not
      // falsely make this write appear durable on this worker.
      throw new KvDurableWriteError("Cloudflare KV durable put failed", { cause: error });
    }
    if (input.mirrorLocalInCi) {
      input.memoryStore.set(input.key, input.value);
      await input.writeFallback(input.key, input.value);
    }
    return "OK";
  }

  if (!input.allowLocalFallback) {
    throw new KvDurableWriteError(
      "Cloudflare KV binding unavailable for durable write (local fallback not permitted)"
    );
  }

  input.memoryStore.set(input.key, input.value);
  await input.writeFallback(input.key, input.value);
  return "OK";
}

/**
 * Durable delete orchestration used by {@link kv.deleteDurable}.
 * When a Cloudflare namespace is present, delete failures propagate and must not
 * clear local copies in a way that falsely reports durable success.
 * After a successful remote delete, local memory/file mirrors are cleared so CI
 * mirroring cannot retain stale PII.
 * Exported for focused unit tests with injectable deps.
 */
export async function persistDurableKvDelete(input: {
  cfKv: CloudflareKvNamespace | null;
  allowLocalFallback: boolean;
  key: string;
  memoryStore: Map<string, unknown>;
  removeFallback: (key: string) => Promise<void>;
}): Promise<"OK"> {
  if (input.cfKv) {
    try {
      await input.cfKv.delete(input.key);
    } catch (error) {
      throw new KvDurableDeleteError("Cloudflare KV durable delete failed", { cause: error });
    }
    // Remote delete succeeded — drop any local mirrors (including CI write mirrors).
    input.memoryStore.delete(input.key);
    await input.removeFallback(input.key);
    return "OK";
  }

  if (!input.allowLocalFallback) {
    throw new KvDurableDeleteError(
      "Cloudflare KV binding unavailable for durable delete (local fallback not permitted)"
    );
  }

  input.memoryStore.delete(input.key);
  await input.removeFallback(input.key);
  return "OK";
}

/**
 * Negative-control helper: ordinary set semantics that swallow CF put failures into local success.
 * Used only in tests to prove the old marker-only durable race.
 */
export async function persistOrdinaryKvPutWithLocalFallbackOnRemoteFailure<T>(input: {
  cfKv: CloudflareKvNamespace;
  key: string;
  value: T;
  ttlSeconds?: number;
  memoryStore: Map<string, unknown>;
  writeFallback: (key: string, value: T) => Promise<void>;
}): Promise<"OK"> {
  try {
    await input.cfKv.put(
      input.key,
      JSON.stringify(input.value),
      input.ttlSeconds ? { expirationTtl: input.ttlSeconds } : undefined
    );
    return "OK";
  } catch {
    input.memoryStore.set(input.key, input.value);
    await input.writeFallback(input.key, input.value);
    return "OK";
  }
}

/**
 * Ordinary put orchestration for {@link kv.set}.
 * When a Cloudflare namespace is present, put failures must NOT fall through to filesystem APIs
 * (Workers have no durable local FS). Local memory/file is used only when CF is absent and
 * {@link isLocalKvFallbackAllowed} is true.
 */
export async function persistOrdinaryKvPut<T>(input: {
  cfKv: CloudflareKvNamespace | null;
  allowLocalFallback: boolean;
  mirrorLocalInCi: boolean;
  key: string;
  value: T;
  ttlSeconds?: number;
  memoryStore: Map<string, unknown>;
  writeFallback: (key: string, value: T) => Promise<void>;
}): Promise<"OK"> {
  if (input.cfKv) {
    try {
      await input.cfKv.put(
        input.key,
        JSON.stringify(input.value),
        input.ttlSeconds ? { expirationTtl: input.ttlSeconds } : undefined
      );
      if (input.mirrorLocalInCi) {
        input.memoryStore.set(input.key, input.value);
        await input.writeFallback(input.key, input.value);
      }
      return "OK";
    } catch (error) {
      throw new KvSoftWriteError("Cloudflare KV ordinary put failed", { cause: error });
    }
  }

  if (!input.allowLocalFallback) {
    throw new KvSoftWriteError(
      "Cloudflare KV binding unavailable for ordinary write (local fallback not permitted)"
    );
  }

  input.memoryStore.set(input.key, input.value);
  await input.writeFallback(input.key, input.value);
  return "OK";
}

/**
 * Ordinary incr orchestration for {@link kv.incr}.
 * Same Workers-safe rule as {@link persistOrdinaryKvPut}: CF present + failure ⇒ no filesystem.
 */
export async function persistOrdinaryKvIncr(input: {
  cfKv: CloudflareKvNamespace | null;
  allowLocalFallback: boolean;
  key: string;
  by: number;
  ttlSeconds?: number;
  readLocal: (key: string) => Promise<number | null>;
  memoryStore: Map<string, unknown>;
  writeFallback: (key: string, value: number) => Promise<void>;
}): Promise<number> {
  if (input.cfKv) {
    try {
      const current = (await input.cfKv.get<number>(input.key, "json")) ?? 0;
      const next = current + input.by;
      await input.cfKv.put(
        input.key,
        JSON.stringify(next),
        input.ttlSeconds ? { expirationTtl: input.ttlSeconds } : undefined
      );
      return next;
    } catch (error) {
      throw new KvSoftWriteError("Cloudflare KV ordinary incr failed", { cause: error });
    }
  }

  if (!input.allowLocalFallback) {
    throw new KvSoftWriteError(
      "Cloudflare KV binding unavailable for ordinary incr (local fallback not permitted)"
    );
  }

  const current = Number((await input.readLocal(input.key)) ?? 0);
  const next = current + input.by;
  input.memoryStore.set(input.key, next);
  await input.writeFallback(input.key, next);
  return next;
}

export const kv = {
  async get<T>(key: string): Promise<T | null> {
    if (MIRROR_KV_LOCAL_IN_CI && memoryStore.has(key)) {
      return memoryStore.get(key) as T;
    }
    const cfKv = await getCloudflareKv();
    if (cfKv) {
      try {
        const value = await cfKv.get<T>(key, "json");
        if (value !== null || !MIRROR_KV_LOCAL_IN_CI) return value;
      } catch {
        // Fall through to local fallback storage in dev/test or transient KV outages.
      }
    }
    if (memoryStore.has(key)) {
      return memoryStore.get(key) as T;
    }
    const fallbackValue = await readFallbackValue<T>(key);
    if (fallbackValue !== null) {
      memoryStore.set(key, fallbackValue);
    }
    return fallbackValue;
  },
  async set<T>(key: string, value: T, options?: KvSetOptions): Promise<"OK"> {
    const cfKv = await getCloudflareKv();
    return persistOrdinaryKvPut({
      cfKv,
      allowLocalFallback: isLocalKvFallbackAllowed(),
      mirrorLocalInCi: MIRROR_KV_LOCAL_IN_CI,
      key,
      value,
      ttlSeconds: ttlFromOptions(options),
      memoryStore,
      writeFallback: writeFallbackValue,
    });
  },
  /**
   * Strict durable write for recovery canonical-session success.
   * When Cloudflare KV is bound, put failures propagate and do not populate local fallback.
   * Local memory/file is used only when CF is intentionally absent (dev/CI/explicit allow).
   */
  async setDurable<T>(key: string, value: T, options?: KvSetOptions): Promise<"OK"> {
    const cfKv = await getCloudflareKv();
    return persistDurableKvPut({
      cfKv,
      allowLocalFallback: isLocalKvFallbackAllowed(),
      mirrorLocalInCi: MIRROR_KV_LOCAL_IN_CI,
      key,
      value,
      ttlSeconds: ttlFromOptions(options),
      memoryStore,
      writeFallback: writeFallbackValue,
    });
  },
  /**
   * Strict durable delete for privacy-sensitive keys (e.g. print-order PII past retention).
   * When Cloudflare KV is bound, delete failures propagate and do not report local-only success.
   * Local memory/file is used only when CF is intentionally absent (dev/CI/explicit allow).
   */
  async deleteDurable(key: string): Promise<"OK"> {
    const cfKv = await getCloudflareKv();
    return persistDurableKvDelete({
      cfKv,
      allowLocalFallback: isLocalKvFallbackAllowed(),
      key,
      memoryStore,
      removeFallback: removeFallbackValue,
    });
  },
  async incr(key: string, by = 1, options?: KvIncrOptions): Promise<number> {
    const cfKv = await getCloudflareKv();
    return persistOrdinaryKvIncr({
      cfKv,
      allowLocalFallback: isLocalKvFallbackAllowed(),
      key,
      by,
      ttlSeconds: ttlFromOptions(options),
      readLocal: async (localKey) => {
        if (memoryStore.has(localKey)) {
          return Number(memoryStore.get(localKey) ?? 0);
        }
        return readFallbackValue<number>(localKey);
      },
      memoryStore,
      writeFallback: writeFallbackValue,
    });
  },
  async list(
    options?: KvListOptions
  ): Promise<{ keys: string[]; listComplete: boolean; cursor?: string | null }> {
    const cfKv = await getCloudflareKv();
    if (cfKv) {
      try {
        const result = await cfKv.list({
          prefix: options?.prefix,
          cursor: options?.cursor,
          limit: options?.limit,
        });
        return {
          keys: result.keys.map((entry) => entry.name),
          listComplete: result.list_complete,
          cursor: result.cursor ?? null,
        };
      } catch {
        // Fall through to local fallback storage in dev/test or transient KV outages.
      }
    }

    const prefix = options?.prefix ?? "";
    const limit = Math.max(1, Math.min(1000, Math.floor(options?.limit ?? 1000)));
    const localKeys = Array.from(memoryStore.keys())
      .filter((key) => key.startsWith(prefix))
      .sort();
    const startIndex = options?.cursor ? Number.parseInt(options.cursor, 10) || 0 : 0;
    const slice = localKeys.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + slice.length < localKeys.length ? String(startIndex + slice.length) : null;
    return {
      keys: slice,
      listComplete: nextCursor === null,
      cursor: nextCursor,
    };
  },
};
