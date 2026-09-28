import { apiRoute } from "@/lib/api/http";
import { config } from "@/lib/config/env";
import { driver } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async () => {
  const db = await driver.ping();
  return {
    ok: db.ok,
    name: "LISA",
    version: "1.0.0",
    environment: config.env,
    uptimeSeconds: Math.round(process.uptime()),
    providers: {
      llm: config.groq.configured ? "groq" : "local-heuristic",
      memory: config.hindsight.configured ? "hindsight" : "local-embedded",
      database: driver.kind,
      cache: config.redis.configured ? "redis" : "memory",
    },
    services: { database: db },
    authenticationRequired: Boolean(config.app.apiToken),
    timestamp: new Date().toISOString(),
  };
}, { public: true, rateLimited: false });
