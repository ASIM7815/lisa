import { apiRoute, parseOrThrow, readJson } from "@/lib/api/http";
import { createCase } from "@/lib/services/case-service";
import { importCasesSchema } from "@/lib/validation/schemas";

export const POST = apiRoute(async (request) => {
  const body = parseOrThrow(importCasesSchema, await readJson(request));
  const created = [];
  for (const item of body.cases) {
    created.push(await createCase({ ...item, source: item.source === "manual" ? body.source : item.source }, "Import"));
  }
  return { imported: created.length, cases: created };
}, { write: true });
