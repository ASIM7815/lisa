import { apiRoute, parseOrThrow, readJson } from "@/lib/api/http";
import { resolveCase } from "@/lib/services/decision-service";
import { resolveCaseSchema } from "@/lib/validation/schemas";

export const POST = apiRoute(async (request, { params }) => {
  const { id } = await params;
  const body = parseOrThrow(resolveCaseSchema, await readJson(request));
  return { resolution: await resolveCase(id, body) };
}, { write: true });
