import { apiRoute, readJson } from "@/lib/api/http";
import { config } from "@/lib/config/env";
import { seedDemoData } from "@/lib/services/seed-service";
import { AppError } from "@/lib/utils/errors";

export const POST = apiRoute(async (request) => {
  if (config.isProduction) throw new AppError("Demo reset is disabled in production", 403, "forbidden");
  const confirmation = await readJson<{ confirm?: string }>(request);
  if (confirmation.confirm !== "RESET DEMO DATA") {
    throw new AppError("Confirmation phrase does not match", 400, "confirmation_required");
  }
  return seedDemoData({ force: true });
}, { write: true });
