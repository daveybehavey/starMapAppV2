import { kv as vercelKv } from "@vercel/kv";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type KvSetOptions = Parameters<typeof vercelKv.set>[2];
type CloudflareKvNamespace = {
  get<T>(key: string, type: "json"): Promise<T | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

const CLOUDFLARE_KV_BINDING = "STAR_MAP_KV";
const hasVercelEnv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const memoryStore: Map<string, unknown> =
  (globalThis as typeof globalThis & { __starmapKv?: Map<string, unknown> }).__starmapKv ?? new Map();

if (!(globalThis as typeof globalThis & { __starmapKv?: Map<string, unknown> }).__starmapKv) {
  (globalThis as typeof globalThis & { __starmapKv?: Map<string, unknown> }).__starmapKv = memoryStore;
}

async function getCloudflareKv(): Promise<CloudflareKvNamespace | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const bindings = env as unknown as Record<string, unknown> | undefined;
    return (bindings?.[CLOUDFLARE_KV_BINDING] as CloudflareKvNamespace | undefined) ?? null;
  } catch {
    return null;
  }
}

function ttlFromOptions(options?: KvSetOptions) {
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
      return await cfKv.get<T>(key, "json");
    }
    if (!hasVercelEnv) {
      return memoryStore.has(key) ? (memoryStore.get(key) as T) : null;
    }
    return vercelKv.get<T>(key);
  },
  async set<T>(key: string, value: T, options?: KvSetOptions): Promise<"OK"> {
    const cfKv = await getCloudflareKv();
    if (cfKv) {
      const ttl = ttlFromOptions(options);
      await cfKv.put(key, JSON.stringify(value), ttl ? { expirationTtl: ttl } : undefined);
      return "OK";
    }
    if (!hasVercelEnv) {
      memoryStore.set(key, value);
      return "OK";
    }
    return (await vercelKv.set<T>(key, value, options)) as "OK";
  },
};
