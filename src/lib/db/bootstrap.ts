import { driver, TABLES } from "@/lib/db";
import { config } from "@/lib/config/env";
import { logger } from "@/lib/utils/logger";
import { AppError } from "@/lib/utils/errors";

let ready: Promise<void> | null = null;

export async function ensureDatabaseReady(): Promise<void> {
  if (config.isProduction && !config.database.configured) {
    throw new AppError("DATABASE_URL is required in production; local file storage is development-only", 503, "database_not_configured");
  }
  if (!config.database.configured || !config.database.autoMigrate) return;
  ready ??= (async () => {
    await driver.query("SELECT 1");
    logger.debug("database ready", { driver: driver.kind, tables: Object.keys(TABLES).length });
  })().catch((error) => {
    ready = null;
    throw error;
  });
  await ready;
}
