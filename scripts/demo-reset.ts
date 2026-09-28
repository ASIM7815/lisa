import { config } from "../src/lib/config/env";
import { seedDemoData } from "../src/lib/services/seed-service";

if (config.isProduction) {
  console.error("Refusing to reset data in production.");
  process.exitCode = 1;
} else {
  seedDemoData({ force: true }).then((result) => {
    console.log(`Demo data reset: ${result.count} cases, ${result.resolved} resolved experience records.`);
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
