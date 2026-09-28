/**
 * A deliberately tiny query abstraction.
 *
 * Both drivers accept the same `Where` matcher: the file driver evaluates it
 * in memory, the Postgres driver compiles it to parameterised SQL. Keeping the
 * matcher this small (equality, ranges, set membership, substring, array
 * overlap) is what makes the two drivers provably equivalent — and it means no
 * caller can smuggle raw SQL through the repository layer.
 */
import { columnOf, type TableSpec } from "./schema";

export type Scalar = string | number | boolean | null;

export type WhereCondition =
  | Scalar
  | { $in: Scalar[] }
  | { $nin: Scalar[] }
  | { $gte?: Scalar; $lte?: Scalar; $gt?: Scalar; $lt?: Scalar }
  | { $ilike: string }
  | { $exists: boolean }
  | { $any: Scalar[] };

export type Where = Record<string, WhereCondition | Where[]>;

export type OrderDirection = "asc" | "desc";

export interface ListOptions {
  where?: Where;
  orderBy?: string;
  order?: OrderDirection;
  limit?: number;
  offset?: number;
}

export type Row = Record<string, unknown>;

function asRecord(condition: WhereCondition): Record<string, unknown> | null {
  return condition !== null && typeof condition === "object" && !Array.isArray(condition)
    ? (condition as Record<string, unknown>)
    : null;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/** In-memory evaluation of a `Where` matcher. */
export function matchesWhere(row: Row, where?: Where): boolean {
  if (!where) return true;
  return Object.entries(where).every(([field, condition]) => {
    if (field === "$or") return Array.isArray(condition) && condition.some((branch) => matchesWhere(row, branch));
    if (field === "$and") return Array.isArray(condition) && condition.every((branch) => matchesWhere(row, branch));
    const value = row[field];
    const obj = asRecord(condition as WhereCondition);

    if (!obj) {
      if (condition === null) return value === null || value === undefined;
      return value === condition;
    }

    if ("$in" in obj) return Array.isArray(obj.$in) && obj.$in.some((v) => v === value);
    if ("$nin" in obj) return Array.isArray(obj.$nin) && !obj.$nin.some((v) => v === value);
    if ("$exists" in obj) {
      const present = value !== null && value !== undefined && value !== "";
      return present === Boolean(obj.$exists);
    }
    if ("$any" in obj) {
      if (!Array.isArray(value)) return false;
      return (obj.$any as Scalar[]).some((v) => value.includes(v));
    }
    if ("$ilike" in obj) {
      if (value === null || value === undefined) return false;
      const searchable = typeof value === "string" ? value : JSON.stringify(value);
      const pattern = String(obj.$ilike).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
      return new RegExp(`^${pattern}$`, "i").test(searchable);
    }

    const { $gte, $lte, $gt, $lt } = obj as Record<string, Scalar | undefined>;
    if ($gte !== undefined && compareValues(value, $gte) < 0) return false;
    if ($gt !== undefined && compareValues(value, $gt) <= 0) return false;
    if ($lte !== undefined && compareValues(value, $lte) > 0) return false;
    if ($lt !== undefined && compareValues(value, $lt) >= 0) return false;
    return $gte !== undefined || $lte !== undefined || $gt !== undefined || $lt !== undefined;
  });
}

export function sortRows<T extends Row>(rows: T[], orderBy?: string, order: OrderDirection = "desc"): T[] {
  if (!orderBy) return rows;
  const factor = order === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => compareValues(a[orderBy], b[orderBy]) * factor);
}

export interface CompiledWhere {
  sql: string;
  params: unknown[];
}

/**
 * Compile a `Where` matcher into parameterised SQL. Every value goes through
 * the parameter array — nothing is ever interpolated.
 */
export function buildWhereSql(table: TableSpec, where?: Where, startIndex = 1): CompiledWhere {
  if (!where || Object.keys(where).length === 0) return { sql: "", params: [] };

  const clauses: string[] = [];
  const params: unknown[] = [];
  let index = startIndex;

  const column = (field: string): string => {
    const spec = columnOf(table, field);
    if (!spec) throw new Error(`Unknown column "${field}" on table "${table.name}"`);
    return `"${spec.column}"`;
  };

  for (const [field, condition] of Object.entries(where)) {
    if (field === "$or" || field === "$and") {
      const branches = condition as Where[];
      if (branches.length === 0) {
        clauses.push(field === "$or" ? "FALSE" : "TRUE");
        continue;
      }
      const parts = branches.map((branch) => {
        const nested = buildWhereSql(table, branch, index);
        index += nested.params.length;
        params.push(...nested.params);
        return nested.sql ? `(${nested.sql.replace(/^ WHERE /, "")})` : "TRUE";
      });
      clauses.push(`(${parts.join(field === "$or" ? " OR " : " AND ")})`);
      continue;
    }
    const col = column(field);
    const spec = columnOf(table, field)!;
    const obj = asRecord(condition as WhereCondition);

    if (!obj) {
      if (condition === null) {
        clauses.push(`${col} IS NULL`);
        continue;
      }
      clauses.push(`${col} = $${index++}`);
      params.push(condition);
      continue;
    }

    if ("$in" in obj) {
      const values = obj.$in as Scalar[];
      if (values.length === 0) {
        clauses.push("FALSE");
        continue;
      }
      const placeholders = values.map(() => `$${index++}`).join(", ");
      clauses.push(`${col} IN (${placeholders})`);
      params.push(...values);
      continue;
    }

    if ("$nin" in obj) {
      const values = obj.$nin as Scalar[];
      if (values.length === 0) continue;
      const placeholders = values.map(() => `$${index++}`).join(", ");
      clauses.push(`${col} NOT IN (${placeholders})`);
      params.push(...values);
      continue;
    }

    if ("$exists" in obj) {
      clauses.push(Boolean(obj.$exists) ? `${col} IS NOT NULL` : `${col} IS NULL`);
      continue;
    }

    if ("$any" in obj) {
      const values = (obj.$any as Scalar[]).filter((v): v is string => typeof v === "string");
      if (values.length === 0) {
        clauses.push("FALSE");
        continue;
      }
      clauses.push(`${col} && $${index++}`);
      params.push(values);
      continue;
    }

    if ("$ilike" in obj) {
      clauses.push(`${col}${spec.json ? "::text" : ""} ILIKE $${index++}`);
      params.push(String(obj.$ilike));
      continue;
    }

    const { $gte, $lte, $gt, $lt } = obj as Record<string, Scalar | undefined>;
    const ops: Array<[string, Scalar | undefined]> = [
      [">=", $gte],
      [">", $gt],
      ["<=", $lte],
      ["<", $lt],
    ];
    for (const [op, val] of ops) {
      if (val === undefined) continue;
      clauses.push(`${col} ${op} $${index++}`);
      params.push(spec.date && typeof val === "string" ? val : val);
    }
  }

  if (clauses.length === 0) return { sql: "", params };
  return { sql: ` WHERE ${clauses.join(" AND ")}`, params };
}
