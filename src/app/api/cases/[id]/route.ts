import { apiRoute, parseOrThrow, readJson } from "@/lib/api/http";
import { updateCase } from "@/lib/services/case-service";
import { getCaseDetails } from "@/lib/services/case-service";
import { updateCaseSchema } from "@/lib/validation/schemas";

export const GET = apiRoute(async (_request, { params }) => {
  const { id } = await params;
  return getCaseDetails(id);
});

export const PATCH = apiRoute(async (request, { params }) => {
  const { id } = await params;
  const body = parseOrThrow(updateCaseSchema, await readJson(request));
  return { case: await updateCase(id, body) };
}, { write: true });
