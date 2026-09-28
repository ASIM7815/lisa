import { apiRoute, parseOrThrow, readJson } from "@/lib/api/http";
import { tables } from "@/lib/db";
import { createCase, listCases } from "@/lib/services/case-service";
import { analyzeCase } from "@/lib/services/analysis-service";
import { getSettings } from "@/lib/services/settings-service";
import { logger } from "@/lib/utils/logger";
import { createCaseSchema } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (request) => {
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const result = await listCases(params);
  return { ...result, counts: await getCounts() };
});

export const POST = apiRoute(async (request) => {
  const body = parseOrThrow(createCaseSchema, await readJson(request));
  const record = await createCase(body, "Operator");
  let analysis = null;
  let analysisError: string | undefined;
  if ((await getSettings()).autoAnalyze) {
    try {
      analysis = await analyzeCase(record.id);
    } catch (error) {
      analysisError = error instanceof Error ? error.message : "Analysis could not start";
      logger.warn("auto-analysis failed after case creation", { caseRef: record.ref, error: analysisError });
    }
  }
  return Response.json({ case: record, analysis, ...(analysisError ? { analysisError } : {}) }, { status: 201 });
}, { write: true });

async function getCounts() {
  const [all, open, awaiting, resolved] = await Promise.all([
    tables.cases.count(),
    tables.cases.count({ status: { $in: ["open", "analyzing", "awaiting_decision", "in_progress"] } }),
    tables.cases.count({ status: "awaiting_decision" }),
    tables.cases.count({ status: "resolved" }),
  ]);
  return { all, open, awaiting, resolved };
}
