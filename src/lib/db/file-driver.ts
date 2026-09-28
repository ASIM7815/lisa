/**
 * File-backed storage driver.
 *
 * Used when `DATABASE_URL` is not set: local development, the hackathon demo
 * box, and CI. It implements exactly the same `Driver` contract as Postgres so
 * no service code needs to know which one is active. Writes are atomic
 * (temp file + rename) and serialised through a promise chain, so concurrent
 * route handlers cannot interleave a partial write.
 *
 * NOT suitable for multi-instance production deployments — set DATABASE_URL.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config/env";
import { TABLES, buildSchemaDDL, type TableSpec } from "./schema";
import { applyListInMemory, type Driver, type Row } from "./driver";
import type { ListOptions, Where } from "./query";
import { logger } from "@/lib/utils/logger";

type Store = Record<string, Row[]>;

const EMPTY: Store = {};

export class FileDriver implements Driver {
  readonly kind = "file" as const;

  private cache: Store | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private readonly filePath: string;

  constructor(dataDir = config.app.dataDir) {
    this.filePath = path.resolve(process.cwd(), dataDir, "data.json");
  }

  private async load(): Promise<Store> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Store;
      this.cache = { ...EMPTY, ...parsed };
    } catch {
      this.cache = { ...EMPTY };
      for (const spec of ALL_TABLES) this.cache[spec.name] ??= [];
      logger.info("file store initialised", { path: this.filePath });
    }
    return this.cache;
  }

  private async persist(store: Store): Promise<void> {
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(store, null, 2), "utf8");
      await rename(tmp, this.filePath);
    });
    await this.writeQueue;
  }

  async select(spec: TableSpec, options: ListOptions): Promise<Row[]> {
    const store = await this.load();
    return applyListInMemory(store[spec.name] ?? [], options);
  }

  async count(spec: TableSpec, where?: Where): Promise<number> {
    const rows = await this.select(spec, { where });
    return rows.length;
  }

  async insert(spec: TableSpec, row: Row): Promise<Row> {
    const store = await this.load();
    const table = store[spec.name] ?? [];
    const clone = structuredClone(row);
    table.push(clone);
    store[spec.name] = table;
    await this.persist(store);
    return clone;
  }

  async update(spec: TableSpec, id: string, patch: Row): Promise<Row | null> {
    const store = await this.load();
    const table = store[spec.name] ?? [];
    const pkName = spec.columns.find((c) => c.pk)?.name ?? "id";
    const index = table.findIndex((row) => row[pkName] === id);
    if (index === -1) return null;
    const merged = { ...table[index], ...structuredClone(patch) };
    table[index] = merged;
    store[spec.name] = table;
    await this.persist(store);
    return merged;
  }

  async upsert(spec: TableSpec, row: Row): Promise<Row> {
    const store = await this.load();
    const table = store[spec.name] ?? [];
    const pkName = spec.columns.find((c) => c.pk)?.name ?? "id";
    const id = row[pkName];
    const index = table.findIndex((existing) => existing[pkName] === id);
    const clone = structuredClone(row);
    if (index === -1) table.push(clone);
    else table[index] = { ...table[index], ...clone };
    store[spec.name] = table;
    await this.persist(store);
    return table[index === -1 ? table.length - 1 : index];
  }

  async remove(spec: TableSpec, id: string): Promise<boolean> {
    const store = await this.load();
    const table = store[spec.name] ?? [];
    const pkName = spec.columns.find((c) => c.pk)?.name ?? "id";
    const next = table.filter((row) => row[pkName] !== id);
    if (next.length === table.length) return false;
    store[spec.name] = next;
    await this.persist(store);
    return true;
  }

  /**
   * The file driver has no SQL engine. Only the two statements the app relies
   * on outside of CRUD are supported here; everything else is a no-op so the
   * local experience never hard-fails.
   */
  async query(sql: string, params: unknown[] = []): Promise<Row[]> {
    const trimmed = sql.trim().toLowerCase();
    if (trimmed.startsWith("create table") || trimmed.startsWith("create index")) return [];
    if (trimmed.startsWith("delete from")) {
      const match = sql.match(/delete\s+from\s+"?(\w+)"?/i);
      if (match) {
        const store = await this.load();
        store[match[1]] = [];
        await this.persist(store);
      }
      return [];
    }
    logger.warn("file driver ignored unsupported SQL", { sql: sql.slice(0, 120), params: params.length });
    return [];
  }

  async close(): Promise<void> {
    this.cache = null;
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const started = performance.now();
    try {
      await this.load();
      return { ok: true, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : "unknown error",
      };
    }
  }

  async truncateAll(specs: TableSpec[]): Promise<void> {
    const store = await this.load();
    for (const spec of specs) store[spec.name] = [];
    await this.persist(store);
  }
}

const ALL_TABLES = Object.values(TABLES) as TableSpec[];

export const FILE_STORE_SCHEMA_DDL = buildSchemaDDL();
