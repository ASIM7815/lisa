import { apiRoute } from "@/lib/api/http";
import { getDashboardData } from "@/lib/services/analytics-service";

export const dynamic = "force-dynamic";
export const GET = apiRoute(async () => {
  const data = await getDashboardData();
  return {
    generatedAt: data.generatedAt,
    metrics: data.metrics,
    trend: data.trend,
    categoryCounts: data.categoryCounts,
    outcomeCounts: data.outcomeCounts,
    lessonsByAction: data.lessonsByAction,
    providers: data.providers,
    memoryStatus: data.memoryStatus,
  };
});
