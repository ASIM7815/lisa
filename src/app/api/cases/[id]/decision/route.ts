import { apiRoute, parseOrThrow, readJson } from "@/lib/api/http";
import { recordDecision } from "@/lib/services/decision-service";
import { decisionSchema } from "@/lib/validation/schemas";

export const POST = apiRoute(async (request, { params }) => {
  const { id } = await params;
  const body = parseOrThrow(decisionSchema, await readJson(request));
  return { decision: await recordDecision(id, body) };
}, { write: true });
