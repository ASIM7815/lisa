import { config } from "../src/lib/config/env";
import { PostgresDriver } from "../src/lib/db/postgres-driver";
import { TABLES, buildSchemaDDL } from "../src/lib/db/schema";
import { logger } from "../src/lib/utils/logger";

async function main() {
  if (!config.database.configured) {
    throw new Error("DATABASE_URL is required. Migrations do not run against the local file store.");
  }
  const driver = new PostgresDriver();
  try {
    for (const statement of buildSchemaDDL().split(";\n").map((part) => part.trim()).filter(Boolean)) {
      await driver.query(statement);
    }
    logger.info("database schema applied", { tables: Object.keys(TABLES).length });
  } finally {
    await driver.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
