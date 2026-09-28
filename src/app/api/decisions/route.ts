import { apiRoute } from "@/lib/api/http";
import { tables } from "@/lib/db";

export const GET = apiRoute(async (request) => {
  const params = new URL(request.url).searchParams;
  const action = params.get("action");
  const rows = await tables.decisions.list({ orderBy: "createdAt", order: "desc", limit: 250 });
  const decisions = action && action !== "all" ? rows.filter((item) => item.action === action) : rows;
  const allCases = await tables.cases.list({ limit: 5_000 });
  const allAnalyses = await tables.analyses.list({ orderBy: "createdAt", order: "desc", limit: 5_000 });
  return {
    decisions: decisions.map((item) => ({
      ...item,
      case: allCases.find((record) => record.id === item.caseId) ?? null,
      analysis: allAnalyses.find((analysis) => analysis.id === item.analysisId) ?? null,
    })),
    totals: {
      all: rows.length,
      approved: rows.filter((item) => item.action === "approve").length,
      modified: rows.filter((item) => item.action === "modify").length,
      rejected: rows.filter((item) => item.action === "reject").length,
    },
  };
});
