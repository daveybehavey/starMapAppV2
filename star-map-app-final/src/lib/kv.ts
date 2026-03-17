import { getCloudflareContext } from "@opennextjs/cloudflare";
import fs from "node:fs/promises";
import path from "node:path";

type KvSetOptions = { ex?: number; px?: number };
type KvIncrOptions = { ex?: number; px?: number };
type KvListOptions = { prefix?: string; cursor?: string; limit?: number };
type CloudflareKvNamespace = {
  get<T>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
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

if (!(globalThis as typeof globalThis & { __starmapKv?: Map<string, unknown> }).__starmapKv) {
  (globalThis as typeof globalThis & { __starmapKv?: Map<string, unknown> }).__starmapKv = memoryStore;
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

export const kv = {
  async get<T>(key: string): Promise<T | null> {
    const cfKv = await getCloudflareKv();
    if (cfKv) {
      try {
        return await cfKv.get<T>(key, "json");
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
    if (cfKv) {
      const ttl = ttlFromOptions(options);
      try {
        await cfKv.put(key, JSON.stringify(value), ttl ? { expirationTtl: ttl } : undefined);
        return "OK";
      } catch {
        // Fall through to local fallback storage in dev/test or transient KV outages.
      }
    }
    memoryStore.set(key, value);
    await writeFallbackValue(key, value);
    return "OK";
  },
  async incr(key: string, by = 1, options?: KvIncrOptions): Promise<number> {
    const cfKv = await getCloudflareKv();
    const ttl = ttlFromOptions(options);
    if (cfKv) {
      try {
        const current = (await cfKv.get<number>(key, "json")) ?? 0;
        const next = current + by;
        await cfKv.put(key, JSON.stringify(next), ttl ? { expirationTtl: ttl } : undefined);
        return next;
      } catch {
        // Fall through to local fallback storage in dev/test or transient KV outages.
      }
    }
    const current = Number((await kv.get<number>(key)) ?? 0);
    const next = current + by;
    memoryStore.set(key, next);
    await writeFallbackValue(key, next);
    return next;
  },
  async list(options?: KvListOptions): Promise<{ keys: string[]; listComplete: boolean; cursor?: string | null }> {
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
    const nextCursor = startIndex + slice.length < localKeys.length ? String(startIndex + slice.length) : null;
    return {
      keys: slice,
      listComplete: nextCursor === null,
      cursor: nextCursor,
    };
  },
};
