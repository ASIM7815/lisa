import { config } from "@/lib/config/env";
import { logger } from "@/lib/utils/logger";

interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
}

const globalKey = "__lisa_cache__";
type GlobalCache = typeof globalThis & { [globalKey]?: Map<string, CacheEntry> };
const globalCache = globalThis as GlobalCache;
const local = globalCache[globalKey] ?? (globalCache[globalKey] = new Map());
let redisClient: import("ioredis").default | null = null;
let redisPromise: Promise<import("ioredis").default | null> | null = null;
let redisFailed = false;
let localOperations = 0;

async function redis() {
  if (!config.redis.configured || redisFailed) return null;
  if (redisClient) return redisClient;
  redisPromise ??= (async () => {
    try {
      const Redis = (await import("ioredis")).default;
      const client = new Redis(config.redis.url, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2_500,
        keyPrefix: config.redis.keyPrefix,
        retryStrategy: (attempt) => (attempt > 2 ? null : Math.min(attempt * 200, 1_000)),
      });
      client.on("error", (error) => {
        redisFailed = true;
        logger.warn("redis connection error; using local cache", { error: error.message });
      });
      await client.connect();
      redisClient = client;
      return client;
    } catch (error) {
      redisFailed = true;
      logger.warn("redis unavailable; using local cache", { error: error instanceof Error ? error.message : "unknown" });
      return null;
    }
  })();
  return redisPromise;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = await redis();
  if (client) {
    try {
      const raw = await client.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      // fall through to local
    }
  }
  const entry = local.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    local.delete(key);
    return null;
  }
  return entry.value as T;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds = 60): Promise<void> {
  const client = await redis();
  if (client) {
    try {
      await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
      return;
    } catch {
      // fall through to local
    }
  }
  local.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1_000 });
}

export async function cacheDelete(key: string): Promise<void> {
  local.delete(key);
  const client = await redis();
  if (client) await client.del(key).catch(() => undefined);
}

export async function cacheClear(): Promise<void> {
  local.clear();
  const client = await redis();
  if (client) {
    // Avoid flushing a shared Redis database: delete only keys owned by LISA.
    try {
      const keys = await client.keys(`${config.redis.keyPrefix}*`);
      if (keys.length) await client.del(...keys.map((key) => key.replace(config.redis.keyPrefix, "")));
    } catch { /* cache invalidation is best-effort */ }
  }
}

export async function cacheStatus() {
  if (!config.redis.configured) return { ok: true, mode: "in-memory" as const, entries: local.size };
  const client = await redis();
  if (!client) return { ok: false, mode: "in-memory-fallback" as const, entries: local.size };
  try {
    const pong = await client.ping();
    return { ok: pong === "PONG", mode: "redis" as const, entries: local.size };
  } catch (error) {
    return { ok: false, mode: "in-memory-fallback" as const, error: error instanceof Error ? error.message : "unknown" };
  }
}

/** Simple fixed-window limiter; Redis-backed across instances when configured. */
export async function rateLimit(key: string, limit: number, windowSeconds = 60) {
  const client = await redis();
  if (client) {
    try {
      const count = await client.incr(`rl:${key}`);
      if (count === 1) await client.expire(`rl:${key}`, windowSeconds);
      const ttl = await client.ttl(`rl:${key}`);
      return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetIn: Math.max(0, ttl) };
    } catch {
      // local fallback
    }
  }
  const now = Date.now();
  if (++localOperations % 100 === 0) {
    for (const [key, entry] of local) if (entry.expiresAt <= now) local.delete(key);
  }
  const mapKey = `__rate:${key}`;
  const current = local.get(mapKey) as CacheEntry<{ count: number }> | undefined;
  if (!current || current.expiresAt <= now) {
    local.set(mapKey, { value: { count: 1 }, expiresAt: now + windowSeconds * 1_000 });
    return { allowed: true, remaining: limit - 1, resetIn: windowSeconds };
  }
  const count = current.value.count + 1;
  local.set(mapKey, { ...current, value: { count } });
  return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetIn: Math.ceil((current.expiresAt - now) / 1_000) };
}
