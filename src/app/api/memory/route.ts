import { apiRoute } from "@/lib/api/http";
import { tables } from "@/lib/db";
import { memoryProviderStatus } from "@/lib/services/memory-service";

export const GET = apiRoute(async () => {
  const [status, lessons, units] = await Promise.all([
    memoryProviderStatus(),
    tables.lessons.list({ orderBy: "createdAt", order: "desc", limit: 100 }),
    tables.memoryUnits.list({ orderBy: "createdAt", order: "desc", limit: 100 }),
  ]);
  const outcomeCounts = {
    success: lessons.filter((item) => item.outcome === "success").length,
    partial: lessons.filter((item) => item.outcome === "partial").length,
    failure: lessons.filter((item) => item.outcome === "failure").length,
    unknown: lessons.filter((item) => item.outcome === "unknown").length,
  };
  return {
    provider: status,
    totalLessons: await tables.lessons.count(),
    totalLocalMemories: await tables.memoryUnits.count(),
    outcomeCounts,
    lessons: lessons.map((lesson) => ({
      ...lesson,
      caseTitle: lesson.pattern.replace(`${lesson.category}: `, ""),
    })),
    recentMemories: units.slice(0, 12).map((item) => ({
      id: item.id,
      text: item.content,
      context: item.context,
      outcome: item.outcome,
      tags: item.tags,
      createdAt: item.createdAt,
    })),
  };
});
