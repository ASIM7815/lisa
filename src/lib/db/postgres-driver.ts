/**
 * PostgreSQL driver.
 *
 * Active whenever `DATABASE_URL` is set. All queries are parameterised; row
 * mapping between snake_case columns and camelCase domain fields is driven by
 * the table specs in `schema.ts`, so there is exactly one place that knows the
 * physical column names.
 */
import pg from "pg";
import { config } from "@/lib/config/env";
import { logger } from "@/lib/utils/logger";
import { buildSchemaDDL, primaryKeyOf, type ColumnSpec, type TableSpec } from "./schema";
import { buildWhereSql, type ListOptions, type Where } from "./query";
import type { Driver, Row } from "./driver";

const { Pool, types } = pg;

// Return timestamptz / jsonb as JS values we control rather than pg's defaults.
types.setTypeParser(types.builtins.TIMESTAMPTZ ?? 1184, (value) => value);
types.setTypeParser(types.builtins.TIMESTAMP ?? 1114, (value) => value);
types.setTypeParser(types.builtins.INT8 ?? 20, (value) => Number.parseInt(value, 10));

function sslConfig() {
  const mode = config.database.ssl.toLowerCase();
  if (mode === "" || mode === "disable" || mode === "false" || mode === "off") return undefined;
  if (mode === "require" || mode === "true") return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

function toColumnValue(spec: ColumnSpec, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (spec.json) return JSON.stringify(value);
  if (spec.array) return Array.isArray(value) ? value : [value];
  return value;
}

function fromColumnValue(spec: ColumnSpec, value: unknown): unknown {
  if (value === null || value === undefined) {
    if (!spec.notNull) return null;
    if (spec.json) return spec.default?.startsWith("'[]'") ? [] : {};
    return null;
  }
  if (spec.json) {
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    }
    return value;
  }
  if (spec.date) {
    if (value instanceof Date) return value.toISOString();
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
  }
  return value;
}

function rowToDomain(spec: TableSpec, row: Record<string, unknown>): Row {
  const out: Row = {};
  for (const col of spec.columns) {
    out[col.name] = fromColumnValue(col, row[col.column]);
  }
  return out;
}

export class PostgresDriver implements Driver {
  readonly kind = "postgres" as const;

  private pool: pg.Pool;
  private schemaReady: Promise<void> | null = null;

  constructor(connectionString = config.database.url) {
    if (!connectionString) throw new Error("PostgresDriver requires a connection string");
    this.pool = new Pool({
      connectionString,
      max: config.database.poolMax,
      idleTimeoutMillis: config.database.idleTimeoutMs,
      connectionTimeoutMillis: config.database.connectionTimeoutMs,
      ssl: sslConfig(),
      // Route handlers are short-lived; never let a stale connection be handed out.
      allowExitOnIdle: true,
    });
    this.pool.on("error", (error) => {
      logger.error("postgres pool error", { error: error.message });
    });
  }

  private async ensureSchema(): Promise<void> {
    if (!config.database.autoMigrate) return;
    this.schemaReady ??= (async () => {
      const ddl = buildSchemaDDL();
      for (const statement of ddl.split(";\n").map((s) => s.trim()).filter(Boolean)) {
        await this.pool.query(statement);
      }
      logger.info("postgres schema ready");
    })().catch((error) => {
      // Reset so a later request can retry instead of caching the failure.
      this.schemaReady = null;
      throw error;
    });
    await this.schemaReady;
  }

  async query(sql: string, params: unknown[] = []): Promise<Row[]> {
    await this.ensureSchema();
    const result = await this.pool.query(sql, params as never[]);
    return (result.rows ?? []) as Row[];
  }

  async select(spec: TableSpec, options: ListOptions): Promise<Row[]> {
    const { sql: whereSql, params } = buildWhereSql(spec, options.where);
    const clauses: string[] = [];
    if (options.orderBy) {
      const col = spec.columns.find((c) => c.name === options.orderBy);
      if (!col) throw new Error(`Unknown orderBy column "${options.orderBy}" on "${spec.name}"`);
      const direction = options.order === "asc" ? "ASC" : "DESC";
      clauses.push(`ORDER BY "${col.column}" ${direction} NULLS LAST`);
    }
    if (options.limit !== undefined) {
      params.push(options.limit);
      clauses.push(`LIMIT $${params.length}`);
    }
    if (options.offset !== undefined && options.offset > 0) {
      params.push(options.offset);
      clauses.push(`OFFSET $${params.length}`);
    }
    const sql = `SELECT * FROM "${spec.name}"${whereSql}${clauses.length ? ` ${clauses.join(" ")}` : ""}`;
    const rows = await this.query(sql, params);
    return rows.map((row) => rowToDomain(spec, row));
  }

  async count(spec: TableSpec, where?: Where): Promise<number> {
    const { sql: whereSql, params } = buildWhereSql(spec, where);
    const rows = await this.query(`SELECT COUNT(*)::int AS count FROM "${spec.name}"${whereSql}`, params);
    return Number(rows[0]?.count ?? 0);
  }

  private buildInsert(spec: TableSpec, row: Row) {
    const columns: string[] = [];
    const values: unknown[] = [];
    for (const col of spec.columns) {
      const value = row[col.name];
      if (value === undefined) continue;
      columns.push(`"${col.column}"`);
      values.push(toColumnValue(col, value));
    }
    const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
    return { columns, values, placeholders };
  }

  async insert(spec: TableSpec, row: Row): Promise<Row> {
    const { columns, values, placeholders } = this.buildInsert(spec, row);
    const sql = `INSERT INTO "${spec.name}" (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`;
    const rows = await this.query(sql, values);
    return rowToDomain(spec, rows[0]);
  }

  async upsert(spec: TableSpec, row: Row): Promise<Row> {
    const pk = primaryKeyOf(spec);
    const { columns, values, placeholders } = this.buildInsert(spec, row);
    const updates = spec.columns
      .filter((c) => !c.pk)
      .map((c) => `"${c.column}" = EXCLUDED."${c.column}"`)
      .join(", ");
    const sql = `INSERT INTO "${spec.name}" (${columns.join(", ")}) VALUES (${placeholders})
      ON CONFLICT ("${pk.column}") DO UPDATE SET ${updates || `"${pk.column}" = EXCLUDED."${pk.column}"`}
      RETURNING *`;
    const rows = await this.query(sql, values);
    return rowToDomain(spec, rows[0]);
  }

  async update(spec: TableSpec, id: string, patch: Row): Promise<Row | null> {
    const pk = primaryKeyOf(spec);
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const col of spec.columns) {
      if (col.pk) continue;
      if (!(col.name in patch)) continue;
      values.push(toColumnValue(col, patch[col.name]));
      sets.push(`"${col.column}" = $${values.length}`);
    }
    if (sets.length === 0) {
      const rows = await this.query(`SELECT * FROM "${spec.name}" WHERE "${pk.column}" = $1`, [id]);
      return rows[0] ? rowToDomain(spec, rows[0]) : null;
    }
    values.push(id);
    const sql = `UPDATE "${spec.name}" SET ${sets.join(", ")} WHERE "${pk.column}" = $${values.length} RETURNING *`;
    const rows = await this.query(sql, values);
    return rows[0] ? rowToDomain(spec, rows[0]) : null;
  }

  async remove(spec: TableSpec, id: string): Promise<boolean> {
    const pk = primaryKeyOf(spec);
    const rows = await this.query(`DELETE FROM "${spec.name}" WHERE "${pk.column}" = $1 RETURNING "${pk.column}"`, [
      id,
    ]);
    return rows.length > 0;
  }

  async truncateAll(specs: TableSpec[]): Promise<void> {
    for (const spec of specs) await this.query(`DELETE FROM "${spec.name}"`);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const started = performance.now();
    try {
      await this.pool.query("SELECT 1");
      return { ok: true, latencyMs: Math.round(performance.now() - started) };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Math.round(performance.now() - started),
        error: error instanceof Error ? error.message : "unknown error",
      };
    }
  }
}
