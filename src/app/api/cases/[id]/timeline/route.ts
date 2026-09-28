import { apiRoute } from "@/lib/api/http";
import { getCase } from "@/lib/services/case-service";
import { tables } from "@/lib/db";

export const GET = apiRoute(async (_request, { params }) => {
  const { id } = await params;
  await getCase(id);
  const timeline = await tables.timeline.list({ where: { caseId: id }, orderBy: "createdAt", order: "asc" });
  return { timeline };
});
