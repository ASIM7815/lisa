import { randomUUID } from "node:crypto";

/** Collision-resistant, sortable-enough ids. */
export function newId(prefix?: string): string {
  const id = randomUUID();
  return prefix ? `${prefix}_${id.replace(/-/g, "").slice(0, 20)}` : id;
}

/** Sequential-ish human reference, e.g. CS-2026-000123. */
export function newRef(prefix: string, sequence: number): string {
  const year = new Date().getUTCFullYear();
  return `${prefix}-${year}-${String(sequence).padStart(6, "0")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
