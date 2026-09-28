import { tables } from "@/lib/db";
import type { BusinessCase, Outcome } from "@/lib/domain/types";
import { ACTION_LABELS, CATEGORY_LABELS } from "@/lib/domain/types";
import { providerModes } from "@/lib/config/env";
import { memoryProviderStatus } from "@/lib/services/memory-service";
import { cacheGet, cacheSet } from "@/lib/cache";

const DAY = 86_400_000;

export async function getDashboardData() {
  const cached = await cacheGet<Awaited<ReturnType<typeof computeDashboardData>>>("dashboard:v1");
  if (cached) return cached;
  const result = await computeDashboardData();
  await cacheSet("dashboard:v1", result, 20);
  return result;
}

async function computeDashboardData() {
  const [cases, analyses, decisions, lessons, memoryStatus] = await Promise.all([
    tables.cases.list({ orderBy: "createdAt", order: "desc", limit: 5_000 }),
    tables.analyses.list({ orderBy: "createdAt", order: "desc", limit: 5_000 }),
    tables.decisions.list({ orderBy: "createdAt", order: "desc", limit: 5_000 }),
    tables.lessons.list({ orderBy: "createdAt", order: "desc", limit: 5_000 }),
    memoryProviderStatus().catch(() => ({ configured: false, ok: false, mode: "hindsight" as const, provider: "Hindsight" })),
  ]);
  const now = Date.now();
  const monthStart = new Date(now - 30 * DAY).toISOString();
  const priorStart = new Date(now - 60 * DAY).toISOString();
  const recentCases = cases.filter((item) => item.createdAt >= monthStart);
  const previousCases = cases.filter((item) => item.createdAt >= priorStart && item.createdAt < monthStart);
  const resolved = cases.filter((item) => item.status === "resolved");
  const resolvedRecent = resolved.filter((item) => item.resolvedAt && item.resolvedAt >= monthStart);
  const successful = resolved.filter((item) => item.outcome === "success" || item.outcome === "partial");
  const previousSuccessful = resolved.filter(
    (item) => item.resolvedAt && item.resolvedAt >= priorStart && item.resolvedAt < monthStart && (item.outcome === "success" || item.outcome === "partial"),
  );
  const resolvedPrior = resolved.filter((item) => item.resolvedAt && item.resolvedAt >= priorStart && item.resolvedAt < monthStart);
  const open = cases.filter((item) => !["resolved", "dismissed"].includes(item.status));
  const awaiting = cases.filter((item) => item.status === "awaiting_decision");
  const totalOutcomes = resolved.length;
  const successRate = totalOutcomes > 0 ? successful.length / totalOutcomes : 0;
  const priorRate = resolvedPrior.length > 0 ? previousSuccessful.length / resolvedPrior.length : 0;

  const trend = Array.from({ length: 7 }, (_, i) => {
    const end = now - (6 - i) * 7 * DAY;
    const start = end - 7 * DAY;
    const bucket = cases.filter((item) => {
      const at = new Date(item.createdAt).getTime();
      return at >= start && at < end;
    });
    const bucketResolved = bucket.filter((item) => item.status === "resolved");
    const bucketGood = bucketResolved.filter((item) => item.outcome === "success" || item.outcome === "partial");
    return {
      label: new Date(start).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      cases: bucket.length,
      resolved: bucketResolved.length,
      successRate: bucketResolved.length ? Math.round((bucketGood.length / bucketResolved.length) * 100) : 0,
    };
  });

  const categoryCounts = groupCounts(cases, (item) => item.category)
    .map(([key, count]) => ({ category: key, label: CATEGORY_LABELS[key as keyof typeof CATEGORY_LABELS] ?? key, count }))
    .sort((a, b) => b.count - a.count);

  const outcomeCounts = ["success", "partial", "failure", "unknown"].map((outcome) => ({
    outcome,
    count: resolved.filter((item) => item.outcome === outcome).length,
  }));

  const lessonsByAction = groupCounts(lessons, (item) => item.actionCategory).map(([key, count]) => {
    const group = lessons.filter((lesson) => lesson.actionCategory === key);
    const good = group.filter((lesson) => lesson.outcome === "success" || lesson.outcome === "partial").length;
    return {
      actionCategory: key,
      label: ACTION_LABELS[key as keyof typeof ACTION_LABELS] ?? key,
      count,
      successRate: count ? Math.round((good / count) * 100) : 0,
    };
  });

  const averageResolutionHours = mean(
    resolved
      .filter((item) => item.resolvedAt)
      .map((item) => (new Date(item.resolvedAt!).getTime() - new Date(item.createdAt).getTime()) / 3_600_000)
      .filter((value) => value >= 0),
  );

  return {
    generatedAt: new Date().toISOString(),
    providers: providerModes(),
    memoryStatus,
    metrics: {
      totalCases: cases.length,
      totalCasesChange: delta(recentCases.length, previousCases.length),
      openCases: open.length,
      awaitingDecision: awaiting.length,
      resolvedCases: resolved.length,
      resolvedThisMonth: resolvedRecent.length,
      successRate,
      successRateChange: Math.round((successRate - priorRate) * 100),
      memoryCount: lessons.length,
      averageResolutionHours,
      analysesCount: analyses.length,
      decisionsCount: decisions.length,
    },
    trend,
    categoryCounts,
    outcomeCounts,
    lessonsByAction,
    recentCases: cases.slice(0, 8).map((item) => toRecentCase(item)),
    recentLessons: lessons.slice(0, 5),
  };
}

function groupCounts<T>(items: T[], getKey: (item: T) => string): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const item of items) map.set(getKey(item), (map.get(getKey(item)) ?? 0) + 1);
  return [...map.entries()];
}

function delta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function toRecentCase(record: BusinessCase) {
  return {
    id: record.id,
    ref: record.ref,
    title: record.title,
    category: record.category,
    priority: record.priority,
    status: record.status,
    outcome: record.outcome as Outcome | null,
    customer: record.customer,
    createdAt: record.createdAt,
  };
}
