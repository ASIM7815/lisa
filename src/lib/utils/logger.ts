/**
 * Minimal structured logger. JSON in production (log aggregators), compact in
 * development. Deliberately dependency-free so it works identically in Next.js
 * route handlers, edge-adjacent server code and standalone scripts.
 */
import { config } from "@/lib/config/env";

type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const threshold = LEVELS[(config.logLevel as Level) in LEVELS ? (config.logLevel as Level) : "info"];

function emit(level: Level, message: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < threshold) return;
  const entry = { ts: new Date().toISOString(), level, message, ...fields };
  const line =
    config.isProduction
      ? JSON.stringify(entry)
      : `${entry.ts} ${level.toUpperCase().padEnd(5)} ${message}${
          fields && Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : ""
        }`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => emit("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit("error", message, fields),
  /** Return a child logger that always carries the given fields. */
  child(base: Record<string, unknown>) {
    return {
      debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, { ...base, ...f }),
      info: (m: string, f?: Record<string, unknown>) => emit("info", m, { ...base, ...f }),
      warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, { ...base, ...f }),
      error: (m: string, f?: Record<string, unknown>) => emit("error", m, { ...base, ...f }),
    };
  },
};

export type Logger = typeof logger;
