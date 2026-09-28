/**
 * Centralised, validated environment configuration.
 *
 * Every secret in LISA lives here and is read only on the server. Nothing in
 * this module is importable from a client component (Next.js will throw at
 * build time if a `NEXT_PUBLIC_`-free module leaks into the browser bundle).
 */

function str(value: string | undefined, fallback = ""): string {
  return value === undefined || value === "" ? fallback : value;
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const e = process.env;

export const config = {
  env: str(e.NODE_ENV, "development"),
  get isProduction(): boolean {
    return this.env === "production";
  },
  logLevel: str(e.LISA_LOG_LEVEL, "info"),

  groq: {
    apiKey: str(e.GROQ_API_KEY),
    baseUrl: str(e.GROQ_BASE_URL, "https://api.groq.com/openai/v1").replace(/\/+$/, ""),
    model: str(e.GROQ_MODEL, "llama-3.3-70b-versatile"),
    fastModel: str(e.GROQ_FAST_MODEL, "llama-3.1-8b-instant"),
    timeoutMs: int(e.GROQ_TIMEOUT_MS, 30_000),
    maxRetries: int(e.GROQ_MAX_RETRIES, 2),
    get configured(): boolean {
      return this.apiKey.length > 0;
    },
  },

  hindsight: {
    apiKey: str(e.HINDSIGHT_API_KEY),
    baseUrl: str(e.HINDSIGHT_BASE_URL, "https://api.hindsight.vectorize.io").replace(/\/+$/, ""),
    tenant: str(e.HINDSIGHT_TENANT, "default"),
    bank: str(e.HINDSIGHT_BANK, "lisa-operations"),
    timeoutMs: int(e.HINDSIGHT_TIMEOUT_MS, 20_000),
    /**
     * Cloud requires an API key; a self-hosted server on localhost does not.
     */
    get configured(): boolean {
      return this.apiKey.length > 0 || /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(this.baseUrl);
    },
    /** e.g. https://api.hindsight.vectorize.io/v1/default/banks/{bank} */
    bankPath(bank: string): string {
      return `/v1/${this.tenant}/banks/${encodeURIComponent(bank)}`;
    },
  },

  database: {
    url: str(e.DATABASE_URL),
    poolMax: int(e.DATABASE_POOL_MAX, 10),
    idleTimeoutMs: int(e.DATABASE_IDLE_TIMEOUT_MS, 30_000),
    connectionTimeoutMs: int(e.DATABASE_CONNECTION_TIMEOUT_MS, 10_000),
    ssl: str(e.DATABASE_SSL, "require"),
    autoMigrate: bool(e.LISA_AUTO_MIGRATE, true),
    get configured(): boolean {
      return this.url.length > 0;
    },
  },

  redis: {
    url: str(e.REDIS_URL),
    keyPrefix: str(e.REDIS_KEY_PREFIX, "lisa:"),
    get configured(): boolean {
      return this.url.length > 0;
    },
  },

  app: {
    apiToken: str(e.LISA_API_TOKEN),
    rateLimitPerMinute: int(e.LISA_RATE_LIMIT_PER_MINUTE, 120),
    dataDir: str(e.LISA_DATA_DIR, ".lisa"),
  },
} as const;

export type AppConfig = typeof config;

/**
 * Human-readable provider mode. Surfaced by `GET /api/health` and the status
 * pill in the UI so an operator always knows whether LISA is running on real
 * Groq/Hindsight/Postgres or on the built-in local fallbacks.
 */
export function providerModes() {
  return {
    llm: config.groq.configured ? ("groq" as const) : ("local-heuristic" as const),
    memory: config.hindsight.configured ? ("hindsight" as const) : ("local-embedded" as const),
    database: config.database.configured ? ("postgres" as const) : ("file" as const),
    cache: config.redis.configured ? ("redis" as const) : ("memory" as const),
  };
}
