import { config } from "@/lib/config/env";
import { logger } from "@/lib/utils/logger";
import { TABLES } from "./schema";
import { createTable, type Driver } from "./driver";
import { PostgresDriver } from "./postgres-driver";
import { FileDriver } from "./file-driver";
import type {
  BusinessCase,
  CaseAnalysis,
  ChatMessage,
  DecisionRecord,
  Lesson,
  TimelineEvent,
} from "@/lib/domain/types";

const GLOBAL_KEY = "__lisa_driver__";
type GlobalWithDriver = typeof globalThis & { [GLOBAL_KEY]?: Driver };

function makeDriver(): Driver {
  if (config.database.configured) {
    try {
      logger.info("storage driver selected", { driver: "postgres" });
      return new PostgresDriver();
    } catch (error) {
      logger.error("postgres driver initialization failed", {
        error: error instanceof Error ? error.message : "unknown error",
      });
      throw error;
    }
  }
  logger.info("storage driver selected", { driver: "file", note: "set DATABASE_URL for production" });
  return new FileDriver();
}

const globalWithDriver = globalThis as GlobalWithDriver;
export const driver = globalWithDriver[GLOBAL_KEY] ?? (globalWithDriver[GLOBAL_KEY] = makeDriver());

export const tables = {
  cases: createTable<BusinessCase>(driver, TABLES.cases),
  analyses: createTable<CaseAnalysis>(driver, TABLES.analyses),
  decisions: createTable<DecisionRecord>(driver, TABLES.decisions),
  timeline: createTable<TimelineEvent>(driver, TABLES.timeline),
  lessons: createTable<Lesson>(driver, TABLES.lessons),
  memoryUnits: createTable<Record<string, unknown>>(driver, TABLES.memoryUnits),
  chatMessages: createTable<ChatMessage>(driver, TABLES.chatMessages),
  settings: createTable<{ key: string; value: unknown; updatedAt: string }>(driver, TABLES.settings),
};

export type { Driver } from "./driver";
export { TABLES, buildSchemaDDL } from "./schema";
export { FileDriver } from "./file-driver";
