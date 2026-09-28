import { apiRoute, parseOrThrow, readJson } from "@/lib/api/http";
import { config } from "@/lib/config/env";
import { AppError } from "@/lib/utils/errors";
import { seedDemoSchema } from "@/lib/validation/schemas";
import { seedDemoData } from "@/lib/services/seed-service";

export const POST = apiRoute(async (request) => {
  if (config.isProduction) throw new AppError("Demo seeding is disabled in production", 403, "forbidden");
  const body = parseOrThrow(seedDemoSchema, await readJson(request));
  return seedDemoData({ force: false }).then((result) => ({ ...result, scenario: body.scenario }));
}, { write: true });
