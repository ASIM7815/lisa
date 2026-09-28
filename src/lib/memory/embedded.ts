/**
 * Useful local memory fallback when Hindsight isn't configured. It stores the
 * same experience records in the app database and does token-weighted lexical
 * retrieval. This is deliberately surfaced as `local-embedded` in the UI: it
 * is not represented as Hindsight or as semantic retrieval.
 */
import { tables } from "@/lib/db";
import type { MemoryMatch, Outcome } from "@/lib/domain/types";
import { newId } from "@/lib/utils/ids";

const STOP = new Set([
  "about", "after", "again", "also", "been", "before", "being", "between", "could", "does", "during",
  "each", "from", "have", "into", "just", "more", "most", "other", "over", "same", "should", "some",
  "such", "than", "that", "their", "them", "then", "there", "these", "they", "this", "those", "through",
  "under", "very", "what", "when", "where", "which", "while", "with", "would", "your", "customer", "case",
  "issue", "problem", "help", "please", "lisa", "order", "customer",
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP.has(word)),
  );
}

function similarity(query: Set<string>, content: string, category?: string): number {
  const words = tokens(content);
  if (query.size === 0 || words.size === 0) return 0;
  let intersection = 0;
  for (const word of query) if (words.has(word)) intersection++;
  const overlap = intersection / Math.sqrt(query.size * words.size);
  const categoryBoost = category && [...query].some((word) => category.includes(word)) ? 0.08 : 0;
  return Math.min(0.99, overlap + categoryBoost);
}

export async function retainEmbedded(input: {
  content: string;
  context?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  sourceCaseId?: string;
  outcome?: Outcome;
  decision?: string;
  actionCategory?: string;
  occurredAt?: string;
}): Promise<void> {
  await tables.memoryUnits.insert({
    id: newId("mem"),
    bank: "lisa-operations",
    content: input.content,
    context: input.context ?? null,
    type: "experience",
    tags: input.tags ?? [],
    metadata: input.metadata ?? {},
    sourceCaseId: input.sourceCaseId ?? null,
    outcome: input.outcome ?? null,
    decision: input.decision ?? null,
    actionCategory: input.actionCategory ?? null,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
}

export async function recallEmbedded(query: string, limit = 8): Promise<MemoryMatch[]> {
  const all = await tables.memoryUnits.list({ orderBy: "createdAt", order: "desc", limit: 1_000 });
  const queryTokens = tokens(query);
  return all
    .map((row) => {
      const content = String(row.content ?? "");
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const score = similarity(queryTokens, content, String(metadata.category ?? ""));
      return {
        id: String(row.id),
        text: content,
        type: "experience" as const,
        score,
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
        entities: [],
        context: typeof row.context === "string" ? row.context : undefined,
        sourceCaseId: typeof row.sourceCaseId === "string" ? row.sourceCaseId : undefined,
        sourceCaseRef: typeof metadata.caseRef === "string" ? metadata.caseRef : undefined,
        outcome: isOutcome(row.outcome) ? row.outcome : undefined,
        decision: typeof row.decision === "string" ? (row.decision as MemoryMatch["decision"]) : undefined,
        actionCategory:
          typeof row.actionCategory === "string" ? (row.actionCategory as MemoryMatch["actionCategory"]) : undefined,
        occurredAt: typeof row.occurredAt === "string" ? row.occurredAt : undefined,
        mentionedAt: typeof row.createdAt === "string" ? row.createdAt : undefined,
      };
    })
    .filter((result) => result.score >= 0.015)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function memoryCount(): Promise<number> {
  return tables.memoryUnits.count();
}

function isOutcome(value: unknown): value is Outcome {
  return value === "success" || value === "partial" || value === "failure" || value === "unknown";
}
