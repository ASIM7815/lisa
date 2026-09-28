/**
 * Production Hindsight Cloud / self-hosted adapter.
 *
 * Uses Hindsight's versioned REST API directly so the app stays small and the
 * exact retain/recall payloads are visible here. All network calls are
 * server-only, bounded by a timeout, and return safe errors (never API keys).
 */
import { config } from "@/lib/config/env";
import type { MemoryMatch } from "@/lib/domain/types";
import { logger } from "@/lib/utils/logger";

export interface RetainInput {
  content: string;
  context?: string;
  timestamp?: string;
  metadata?: Record<string, string>;
  tags?: string[];
  documentId?: string;
  async?: boolean;
}

export interface RecallInput {
  query: string;
  budget?: "low" | "mid" | "high";
  maxTokens?: number;
  types?: Array<"world" | "experience" | "observation">;
}

export interface RecallOutput {
  results: MemoryMatch[];
  latencyMs: number;
  provider: string;
}

export class HindsightClient {
  private readonly base: string;
  private readonly tenant: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private bankReady: Promise<void> | null = null;

  constructor() {
    this.base = config.hindsight.baseUrl;
    this.tenant = config.hindsight.tenant;
    this.apiKey = config.hindsight.apiKey;
    this.timeoutMs = config.hindsight.timeoutMs;
  }

  get configured(): boolean {
    return config.hindsight.configured;
  }

  private bankPath(bank = config.hindsight.bank): string {
    return `/v1/${this.tenant}/banks/${encodeURIComponent(bank)}`;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    if (this.apiKey) headers.set("Authorization", `Bearer ${this.apiKey}`);

    try {
      const response = await fetch(`${this.base}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        // Do not log or echo provider response bodies; they can contain user data.
        throw new Error(`Hindsight HTTP ${response.status}`);
      }
      if (response.status === 204) return {} as T;
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Hindsight request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Create the shared bank if absent; safe to call on every process start. */
  async ensureBank(): Promise<void> {
    if (!this.configured) return;
    this.bankReady ??= (async () => {
      try {
        await this.request(this.bankPath(), {
          method: "PUT",
          body: JSON.stringify({
            name: "LISA Operations",
            mission:
              "Remember resolved business operations cases, the decisions made, and their real outcomes. On recall, prioritize experiences and learned patterns that help handle similar customer, delivery, supplier, and operations issues. Distinguish success from failure. Never treat a recommendation as a resolved fact.",
            disposition: { skepticism: 3, literalism: 4, empathy: 4 },
            retain_mission:
              "Retain business operations cases, named entities, operator decisions and real outcomes. Preserve whether actions succeeded, partially worked, failed, or have unknown outcomes. Keep the case reference as source metadata. Do not convert recommendations into completed actions.",
            reflect_mission:
              "Compare related resolved business cases and their actual outcomes. Explain what worked and what failed, cite case references, and distinguish remembered evidence from inference. Never invent a case or claim an action was executed.",
          }),
        });
        logger.info("hindsight bank ready", { bank: config.hindsight.bank });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        if (/409|already exists|already created|conflict/i.test(message)) return;
        try {
          await this.request(this.bankPath(), { method: "GET" });
          return;
        } catch {
          this.bankReady = null;
          logger.warn("hindsight bank setup deferred", { bank: config.hindsight.bank, error: message });
        }
      }
    })().catch((error) => {
      this.bankReady = null;
      throw error;
    });
    await this.bankReady;
  }

  async retain(input: RetainInput, bank = config.hindsight.bank): Promise<void> {
    if (!this.configured) throw new Error("Hindsight is not configured");
    await this.ensureBank();
    const item: Record<string, unknown> = {
      content: input.content,
      context: input.context,
      timestamp: input.timestamp ?? new Date().toISOString(),
      metadata: input.metadata,
      tags: input.tags,
      document_id: input.documentId,
    };
    Object.keys(item).forEach((key) => item[key] === undefined && delete item[key]);
    await this.request(this.bankPath(bank) + "/memories", {
      method: "POST",
      body: JSON.stringify({ items: [item], async: input.async ?? false }),
    });
  }

  async recall(input: RecallInput, bank = config.hindsight.bank): Promise<RecallOutput> {
    if (!this.configured) throw new Error("Hindsight is not configured");
    const started = performance.now();
    const body: Record<string, unknown> = {
      query: input.query,
      budget: input.budget ?? "mid",
      max_tokens: input.maxTokens ?? 2_400,
      types: input.types ?? ["experience", "observation", "world"],
    };
    let raw: Record<string, unknown>;
    try {
      raw = await this.request(this.bankPath(bank) + "/memories/recall", {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (error) {
      // Newer server versions accept max_tokens; older versions may only accept
      // max_tokens through a nested config. Retry once without non-core params.
      const message = error instanceof Error ? error.message : "";
      if (!/422|unknown field|extra inputs/i.test(message)) throw error;
      delete body.max_tokens;
      raw = await this.request(this.bankPath(bank) + "/memories/recall", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    const candidates = Array.isArray(raw.results)
      ? raw.results
      : Array.isArray(raw.memories)
        ? raw.memories
        : [];
    const results: MemoryMatch[] = candidates.map((entry, index) => {
      const item = entry as Record<string, unknown>;
      const metadata = (item.metadata && typeof item.metadata === "object" ? item.metadata : {}) as Record<
        string,
        unknown
      >;
      return {
        id: String(item.id ?? item.memory_id ?? `hindsight-${index}`),
        text: String(item.text ?? item.content ?? item.fact ?? ""),
        type: normalizeType(item.type ?? item.fact_type),
        score: normalizeScore(item.score ?? item.relevance),
        tags: stringArray(item.tags),
        entities: stringArray(item.entities),
        context: typeof item.context === "string" ? item.context : undefined,
        sourceCaseId: stringFrom(metadata.source_case_id ?? item.source_case_id),
        sourceCaseRef: stringFrom(metadata.source_case_ref ?? item.source_case_ref),
        outcome: normalizeOutcome(metadata.outcome ?? item.outcome),
        decision: stringFrom(metadata.decision ?? item.decision) as MemoryMatch["decision"],
        actionCategory: stringFrom(metadata.action_category ?? item.action_category) as MemoryMatch["actionCategory"],
        occurredAt: stringFrom(item.occurred_start ?? item.occurred_at),
        mentionedAt: stringFrom(item.mentioned_at),
      };
    });

    return {
      results,
      latencyMs: Math.round(performance.now() - started),
      provider: "Hindsight",
    };
  }

  async reflect(query: string, bank = config.hindsight.bank): Promise<string | null> {
    if (!this.configured) return null;
    const raw = await this.request<Record<string, unknown>>(this.bankPath(bank) + "/reflect", {
      method: "POST",
      body: JSON.stringify({ query, budget: "mid" }),
    });
    const text = raw.text ?? raw.response ?? raw.answer;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const started = performance.now();
    try {
      await this.request(`/v1/${this.tenant}/banks?limit=1`, { method: "GET" });
      return { ok: true, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : "unknown",
      };
    }
  }
}

function normalizeType(value: unknown): MemoryMatch["type"] {
  const type = String(value ?? "experience").toLowerCase();
  if (type.includes("observation")) return "observation";
  if (type.includes("world")) return "world";
  return "experience";
}

function normalizeScore(value: unknown): number {
  const n = Number(value ?? 0.5);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n > 1 ? n / 100 : n)) : 0.5;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? v : String((v as Record<string, unknown>)?.name ?? v)));
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeOutcome(value: unknown): MemoryMatch["outcome"] {
  return value === "success" || value === "partial" || value === "failure" || value === "unknown"
    ? value
    : undefined;
}

export const hindsight = new HindsightClient();
