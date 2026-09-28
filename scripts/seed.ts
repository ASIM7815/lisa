import { config } from "../src/lib/config/env";
import { seedDemoData } from "../src/lib/services/seed-service";
import { logger } from "../src/lib/utils/logger";

if (config.isProduction) {
  console.error("Demo seed is disabled in production.");
  process.exitCode = 1;
} else {
  seedDemoData().then((result) => {
    logger.info(result.message, { seeded: result.seeded, count: result.count });
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
