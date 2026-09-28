import { primaryKeyOf, type TableSpec } from "./schema";
import { matchesWhere, sortRows, type ListOptions, type Row, type Where } from "./query";

export type { Row };

export interface Driver {
  readonly kind: "postgres" | "file";
  select(table: TableSpec, options: ListOptions): Promise<Row[]>;
  count(table: TableSpec, where?: Where): Promise<number>;
  insert(table: TableSpec, row: Row): Promise<Row>;
  upsert(table: TableSpec, row: Row): Promise<Row>;
  update(table: TableSpec, id: string, patch: Row): Promise<Row | null>;
  remove(table: TableSpec, id: string): Promise<boolean>;
  /** Raw SQL escape hatch, used only by the migration bootstrap and analytics. */
  query(sql: string, params?: unknown[]): Promise<Row[]>;
  truncateAll(specs: TableSpec[]): Promise<void>;
  close(): Promise<void>;
  ping(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
}

export interface Table<T extends object> {
  readonly name: string;
  readonly driverKind: "postgres" | "file";
  insert(row: T): Promise<T>;
  upsert(row: T): Promise<T>;
  insertMany(rows: T[]): Promise<T[]>;
  update(id: string, patch: Partial<T>): Promise<T | null>;
  get(id: string): Promise<T | null>;
  findOne(where: Where): Promise<T | null>;
  list(options?: ListOptions): Promise<T[]>;
  count(where?: Where): Promise<number>;
  delete(id: string): Promise<boolean>;
}

export function createTable<T extends object>(
  driver: Driver,
  spec: TableSpec,
): Table<T> {
  const pk = primaryKeyOf(spec);

  return {
    name: spec.name,
    driverKind: driver.kind,
    async insert(row: T): Promise<T> {
      return (await driver.insert(spec, row as unknown as Row)) as unknown as T;
    },
    async upsert(row: T): Promise<T> {
      return (await driver.upsert(spec, row as unknown as Row)) as unknown as T;
    },
    async insertMany(rows: T[]): Promise<T[]> {
      const out: T[] = [];
      for (const row of rows) out.push((await driver.insert(spec, row as unknown as Row)) as T);
      return out;
    },
    async update(id: string, patch: Partial<T>): Promise<T | null> {
      return (await driver.update(spec, id, patch as unknown as Row)) as unknown as T | null;
    },
    async get(id: string): Promise<T | null> {
      const rows = await driver.select(spec, { where: { [pk.name]: id }, limit: 1 });
      return (rows[0] as T) ?? null;
    },
    async findOne(where: Where): Promise<T | null> {
      const rows = await driver.select(spec, { where, limit: 1 });
      return (rows[0] as T) ?? null;
    },
    async list(options: ListOptions = {}): Promise<T[]> {
      const rows = await driver.select(spec, options);
      return rows as T[];
    },
    async count(where?: Where): Promise<number> {
      return driver.count(spec, where);
    },
    async delete(id: string): Promise<boolean> {
      return driver.remove(spec, id);
    },
  };
}

/** Shared helpers used by both drivers. */
export function applyListInMemory<T extends Row>(rows: T[], options: ListOptions): T[] {
  const filtered = rows.filter((row) => matchesWhere(row, options.where));
  const sorted = sortRows(filtered, options.orderBy, options.order ?? "desc");
  const offset = options.offset ?? 0;
  const limit = options.limit ?? sorted.length;
  return sorted.slice(offset, offset + limit);
}
