import { tables } from "@/lib/db";
import { config, providerModes } from "@/lib/config/env";
import { nowIso } from "@/lib/utils/ids";

export interface LisaSettings {
  businessName: string;
  operatorName: string;
  slaHours: Record<string, number>;
  autoAnalyze: boolean;
  memoryEnabled: boolean;
  theme: "light" | "dark" | "system";
}

const DEFAULTS: LisaSettings = {
  businessName: "Northstar Commerce",
  operatorName: "Alex Morgan",
  slaHours: { critical: 1, high: 4, medium: 24, low: 72 },
  autoAnalyze: false,
  memoryEnabled: true,
  theme: "light",
};

export async function getSettings(): Promise<LisaSettings> {
  const row = await tables.settings.get("app");
  return { ...DEFAULTS, ...((row?.value ?? {}) as Partial<LisaSettings>) };
}

export async function updateSettings(patch: Partial<LisaSettings>): Promise<LisaSettings> {
  const current = await getSettings();
  const updated = { ...current, ...patch, slaHours: { ...current.slaHours, ...(patch.slaHours ?? {}) } };
  await tables.settings.upsert({ key: "app", value: updated, updatedAt: nowIso() });
  return updated;
}

export async function getSystemStatus() {
  const [db, memory, cache] = await Promise.all([
    import("@/lib/db").then(({ driver }) => driver.ping()),
    import("@/lib/services/memory-service").then(({ memoryProviderStatus }) => memoryProviderStatus()),
    import("@/lib/cache").then(({ cacheStatus }) => cacheStatus()),
  ]);
  return {
    app: { name: "LISA", version: "1.0.0", environment: config.env, uptimeSeconds: Math.round(process.uptime()) },
    providers: providerModes(),
    services: {
      database: { ...db, driver: providerModes().database },
      memory,
      cache,
      groq: { configured: config.groq.configured, provider: config.groq.configured ? "Groq" : "Local rules engine" },
    },
  };
}
