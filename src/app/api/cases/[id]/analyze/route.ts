import { apiRoute, parseOrThrow, readJson } from "@/lib/api/http";
import { analyzeCase } from "@/lib/services/analysis-service";
import { analyzeSchema } from "@/lib/validation/schemas";

export const POST = apiRoute(async (request, { params }) => {
  const { id } = await params;
  const body = parseOrThrow(analyzeSchema, await readJson(request));
  return { analysis: await analyzeCase(id, body.force) };
}, { write: true });
