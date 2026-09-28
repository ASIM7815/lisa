import { config } from "@/lib/config/env";
import { tables } from "@/lib/db";
import type {
  ActionCategory,
  AnalysisMemoryTrace,
  BusinessCase,
  CaseCategory,
  DecisionAction,
  LearnedAdjustment,
  MemoryMatch,
  Outcome,
  SimilarCase,
} from "@/lib/domain/types";
import { ACTION_LABELS } from "@/lib/domain/types";
import { hindsight } from "@/lib/memory/hindsight";
import { recallEmbedded, retainEmbedded } from "@/lib/memory/embedded";
import { logger } from "@/lib/utils/logger";

export interface ExperienceInput {
  caseRecord: BusinessCase;
  decision: DecisionAction | null;
  actionCategory: ActionCategory;
  action: string;
  outcome: Outcome;
  outcomeNote: string;
  lesson: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (s: string) => new Set(norm(s).split(/\s+/).filter((x) => x.length > 2));

function lexicalScore(a: string, b: string): number {
  const aa = tokens(a);
  const bb = tokens(b);
  if (!aa.size || !bb.size) return 0;
  let matches = 0;
  for (const t of aa) if (bb.has(t)) matches++;
  return Math.min(1, matches / Math.sqrt(aa.size * bb.size));
}

function outcomeValue(outcome: Outcome): number {
  if (outcome === "success") return 1;
  if (outcome === "partial") return 0.5;
  if (outcome === "failure") return 0;
  return 0.5;
}

export async function recallForCase(record: BusinessCase): Promise<AnalysisMemoryTrace> {
  const started = performance.now();
  const query = `${record.category.replace(/_/g, " ")} ${record.title}. ${record.description}`;
  let matches: MemoryMatch[] = [];
  let provider = "Local embedded memory";
  let providerMode: "live" | "local" = "local";
  try {
    if (config.hindsight.configured) {
      const result = await hindsight.recall({ query, budget: "mid", maxTokens: 2_400 });
      matches = result.results;
      provider = result.provider;
      providerMode = "live";
    } else {
      matches = await recallEmbedded(query, 12);
    }
  } catch (error) {
    // A temporary Hindsight outage should degrade gracefully; persist the trace
    // as local fallback, while health reports Hindsight as degraded.
    logger.warn("hindsight recall failed; using local fallback", {
      error: error instanceof Error ? error.message : "unknown",
    });
    matches = await recallEmbedded(query, 12);
    provider = "Local fallback (Hindsight unavailable)";
    providerMode = "local";
  }

  const localCases = await tables.cases.list({ orderBy: "createdAt", order: "desc", limit: 250 });
  const resolved = localCases.filter((item) => item.status === "resolved" && item.id !== record.id);
  const localSimilar = resolved
    .map((item) => ({ record: item, score: lexicalScore(query, `${item.category} ${item.title} ${item.description}`) }))
    .filter((item) => item.score >= 0.06)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const decisionRows = await tables.decisions.list({ orderBy: "createdAt", order: "desc", limit: 500 });
  const decisionByCase = new Map(decisionRows.map((decision) => [decision.caseId, decision]));

  const fromMemory = matches
    .map((match): SimilarCase | null => {
      const local = match.sourceCaseId ? localCases.find((c) => c.id === match.sourceCaseId) : undefined;
      const refMatch = !local && match.sourceCaseRef ? localCases.find((c) => c.ref === match.sourceCaseRef) : undefined;
      const item = local ?? refMatch;
      if (!item || item.id === record.id || item.status !== "resolved") return null;
      const decision = decisionByCase.get(item.id);
      return {
        caseId: item.id,
        ref: item.ref,
        title: item.title,
        category: item.category,
        score: match.score,
        decision: (decision?.action as DecisionAction | undefined) ?? match.decision ?? null,
        actionCategory:
          (match.actionCategory as ActionCategory | undefined) ??
          (decision?.modifiedRecommendation?.actionCategory as ActionCategory | undefined) ??
          null,
        outcome: item.outcome ?? match.outcome ?? null,
        outcomeNote: item.outcomeNote,
        resolvedAt: item.resolvedAt,
        takeaway: match.text,
      };
    })
    .filter((item): item is SimilarCase => Boolean(item));

  const similarCases = dedupeSimilar([...fromMemory, ...localSimilar.map(({ record: item, score }) => {
    const decision = decisionByCase.get(item.id);
    return {
      caseId: item.id,
      ref: item.ref,
      title: item.title,
      category: item.category,
      score,
      decision: decision?.action ?? null,
      actionCategory:
        (decision?.modifiedRecommendation?.actionCategory as ActionCategory | undefined) ?? null,
      outcome: item.outcome,
      outcomeNote: item.outcomeNote,
      resolvedAt: item.resolvedAt,
      takeaway: item.outcomeNote,
    } satisfies SimilarCase;
  })]).slice(0, 8);

  const adjustments = await deriveAdjustments(record.category, similarCases);
  const reflection =
    similarCases.length > 0
      ? `${similarCases.length} related resolved case${similarCases.length === 1 ? "" : "s"} found. ${summarizeOutcomes(similarCases)}`
      : "No matching resolved experience yet. This recommendation is based on the current case details and standard operating practice.";

  return {
    query,
    provider,
    providerMode,
    matchCount: matches.length,
    matches: matches.slice(0, 8),
    adjustments,
    similarCases,
    reflection,
    latencyMs: Math.round(performance.now() - started),
  };
}

function dedupeSimilar(cases: SimilarCase[]): SimilarCase[] {
  const map = new Map<string, SimilarCase>();
  for (const item of cases) {
    const prev = map.get(item.caseId);
    if (!prev || item.score > prev.score) map.set(item.caseId, item);
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}

async function deriveAdjustments(category: CaseCategory, similar: SimilarCase[]): Promise<LearnedAdjustment[]> {
  const lessonRows = await tables.lessons.list({ where: { category }, orderBy: "createdAt", order: "desc", limit: 500 });
  const groups = new Map<ActionCategory, { total: number; sum: number; weight: number }>();
  for (const lesson of lessonRows) {
    const key = lesson.actionCategory as ActionCategory;
    const group = groups.get(key) ?? { total: 0, sum: 0, weight: 0 };
    const weight = Math.max(0.1, Number(lesson.weight) || 1);
    group.total++;
    group.sum += outcomeValue(lesson.outcome) * weight;
    group.weight += weight;
    groups.set(key, group);
  }
  for (const item of similar) {
    if (!item.actionCategory || !item.outcome) continue;
    const key = item.actionCategory;
    const group = groups.get(key) ?? { total: 0, sum: 0, weight: 0 };
    const weight = Math.max(0.2, item.score);
    group.total++;
    group.sum += outcomeValue(item.outcome) * weight;
    group.weight += weight;
    groups.set(key, group);
  }

  return [...groups.entries()]
    .filter(([, value]) => value.total >= 1 && value.weight > 0)
    .map(([actionCategory, value]) => {
      const successRate = value.sum / value.weight;
      const magnitude = Math.min(0.35, Math.abs(successRate - 0.55) * Math.min(value.total / 3, 1) * 0.5);
      const direction = successRate >= 0.55 ? "boost" : "penalty";
      return {
        actionCategory,
        direction,
        magnitude,
        evidenceCount: value.total,
        successRate,
        reason: `${Math.round(successRate * 100)}% positive outcomes across ${value.total} similar ${ACTION_LABELS[actionCategory].toLowerCase()} experience${value.total === 1 ? "" : "s"}`,
      } satisfies LearnedAdjustment;
    })
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, 6);
}

function summarizeOutcomes(items: SimilarCase[]): string {
  const outcomes = items.reduce(
    (acc, item) => {
      if (item.outcome) acc[item.outcome]++;
      return acc;
    },
    { success: 0, partial: 0, failure: 0, unknown: 0 },
  );
  const parts: string[] = [];
  if (outcomes.success) parts.push(`${outcomes.success} successful`);
  if (outcomes.partial) parts.push(`${outcomes.partial} partial`);
  if (outcomes.failure) parts.push(`${outcomes.failure} unsuccessful`);
  if (!parts.length) return "Outcomes are not yet recorded.";
  return `Past outcomes: ${parts.join(", ")}.`;
}

export async function retainResolvedExperience(input: ExperienceInput): Promise<void> {
  const { caseRecord, decision, actionCategory, action, outcome, outcomeNote, lesson } = input;
  const content = [
    `Resolved business case ${caseRecord.ref} (${caseRecord.category.replace(/_/g, " ")}).`,
    `Issue: ${caseRecord.title}. ${caseRecord.description}`,
    `Action taken: ${action}${decision ? ` (operator decision: ${decision})` : ""}.`,
    `Outcome: ${outcome}. ${outcomeNote}`,
    `Lesson: ${lesson}`,
  ].join(" ");
  const metadata = {
    source_case_id: caseRecord.id,
    source_case_ref: caseRecord.ref,
    category: caseRecord.category,
    outcome,
    decision: decision ?? "not recorded",
    action_category: actionCategory,
  };

  if (config.hindsight.configured) {
    try {
      await hindsight.retain({
        content,
        context: `Resolved case ${caseRecord.ref}; outcome=${outcome}; category=${caseRecord.category}`,
        timestamp: caseRecord.resolvedAt ?? new Date().toISOString(),
        documentId: `lisa-case-${caseRecord.id}`,
        metadata: Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k, String(v)])),
        tags: ["lisa", `category:${caseRecord.category}`, `outcome:${outcome}`, `case:${caseRecord.ref}`],
        async: false,
      });
    } catch (error) {
      logger.error("hindsight retain failed; writing local copy", {
        caseRef: caseRecord.ref,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  // Local copy supports fallback and direct similar-case linking even when
  // Hindsight is active or temporarily offline.
  await retainEmbedded({
    content,
    context: `Resolved ${caseRecord.ref}`,
    tags: [caseRecord.category, outcome, actionCategory],
    metadata: { ...metadata, caseRef: caseRecord.ref },
    sourceCaseId: caseRecord.id,
    outcome,
    decision: decision ?? undefined,
    actionCategory,
    occurredAt: caseRecord.resolvedAt ?? new Date().toISOString(),
  });
}

export async function memoryProviderStatus() {
  if (!config.hindsight.configured) {
    return { configured: false, ok: true, mode: "local-embedded" as const, provider: "Local embedded memory" };
  }
  const health = await hindsight.health();
  return { configured: true, ...health, mode: "hindsight" as const, provider: "Hindsight" };
}
