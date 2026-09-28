/**
 * Declarative table specifications.
 *
 * This is the single source of truth for the schema: `db/schema.sql` (for
 * humans + production migration review) and the runtime `CREATE TABLE IF NOT
 * EXISTS` bootstrap are both generated from these specs, so the Postgres
 * driver and the local file driver can never drift apart.
 */

export interface ColumnSpec {
  /** Domain field name (camelCase). */
  name: string;
  /** Postgres column name (snake_case). */
  column: string;
  /** Postgres type. */
  sql: string;
  /** Serialise/deserialise as JSON (jsonb). */
  json?: boolean;
  /** Postgres array column (text[]). */
  array?: boolean;
  /** Value is a timestamp — normalise to ISO-8601 string on read. */
  date?: boolean;
  /** Part of the primary key. */
  pk?: boolean;
  /** Emit a UNIQUE constraint. */
  unique?: boolean;
  /** Foreign-key target, e.g. `"cases"("id")`. */
  references?: string;
  /** Foreign-key delete action. */
  onDelete?: "CASCADE" | "SET NULL" | "RESTRICT";
  /** Emit NOT NULL. */
  notNull?: boolean;
  /** DEFAULT clause, verbatim SQL. */
  default?: string;
}

export interface TableSpec {
  name: string;
  columns: ColumnSpec[];
  /** Extra index DDL (without the table name). */
  indexes?: string[];
}

const ts = (name: string, column = name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)): ColumnSpec => ({
  name,
  column,
  sql: "timestamptz",
  date: true,
});

const text = (name: string, opts: Partial<ColumnSpec> = {}): ColumnSpec => ({
  name,
  column: name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`),
  sql: "text",
  ...opts,
});

const json = (name: string, opts: Partial<ColumnSpec> = {}): ColumnSpec => ({
  name,
  column: name.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`),
  sql: "jsonb",
  json: true,
  ...opts,
});

export const TABLES = {
  cases: {
    name: "cases",
    columns: [
      text("id", { pk: true, notNull: true }),
      text("ref", { unique: true, notNull: true }),
      text("title", { notNull: true }),
      text("description", { notNull: true, sql: "text" }),
      text("category", { notNull: true }),
      text("priority", { notNull: true }),
      text("status", { notNull: true }),
      json("customer", { notNull: true, default: "'{}'::jsonb" }),
      json("metadata", { notNull: true, default: "'{}'::jsonb" }),
      text("source", { notNull: true, default: "'manual'" }),
      text("outcome"),
      text("outcomeNote", { column: "outcome_note" }),
      text("resolutionNote", { column: "resolution_note" }),
      ts("createdAt", "created_at"),
      ts("updatedAt", "updated_at"),
      ts("resolvedAt", "resolved_at"),
    ],
    indexes: [
      "CREATE INDEX IF NOT EXISTS cases_status_idx ON cases (status)",
      "CREATE INDEX IF NOT EXISTS cases_category_idx ON cases (category)",
      "CREATE INDEX IF NOT EXISTS cases_created_at_idx ON cases (created_at DESC)",
    ],
  } satisfies TableSpec,

  analyses: {
    name: "analyses",
    columns: [
      text("id", { pk: true, notNull: true }),
      text("caseId", { column: "case_id", notNull: true, references: `"cases"("id")`, onDelete: "CASCADE" }),
      text("provider", { notNull: true }),
      text("providerMode", { column: "provider_mode", notNull: true }),
      text("model", { notNull: true }),
      text("summary", { notNull: true }),
      text("rootCause", { column: "root_cause", notNull: true }),
      text("detectedCategory", { column: "detected_category", notNull: true }),
      text("detectedPriority", { column: "detected_priority", notNull: true }),
      json("recommendation", { notNull: true }),
      json("alternatives", { notNull: true, default: "'[]'::jsonb" }),
      json("riskFactors", { column: "risk_factors", notNull: true, default: "'[]'::jsonb" }),
      json("memory", { notNull: true }),
      { name: "latencyMs", column: "latency_ms", sql: "integer", notNull: true, default: "0" },
      json("tokens", { notNull: true, default: "'{}'::jsonb" }),
      ts("createdAt", "created_at"),
    ],
    indexes: [
      "CREATE INDEX IF NOT EXISTS analyses_case_id_idx ON analyses (case_id, created_at DESC)",
    ],
  } satisfies TableSpec,

  decisions: {
    name: "decisions",
    columns: [
      text("id", { pk: true, notNull: true }),
      text("caseId", { column: "case_id", notNull: true, references: `"cases"("id")`, onDelete: "CASCADE" }),
      text("analysisId", { column: "analysis_id", references: `"analyses"("id")`, onDelete: "SET NULL" }),
      text("action", { notNull: true }),
      text("operator", { notNull: true, default: "'operator'" }),
      text("note"),
      json("modifiedRecommendation", { column: "modified_recommendation" }),
      ts("createdAt", "created_at"),
    ],
    indexes: [
      "CREATE INDEX IF NOT EXISTS decisions_case_id_idx ON decisions (case_id, created_at DESC)",
      "CREATE INDEX IF NOT EXISTS decisions_action_idx ON decisions (action)",
    ],
  } satisfies TableSpec,

  timeline: {
    name: "timeline",
    columns: [
      text("id", { pk: true, notNull: true }),
      text("caseId", { column: "case_id", notNull: true, references: `"cases"("id")`, onDelete: "CASCADE" }),
      text("type", { notNull: true }),
      text("title", { notNull: true }),
      text("detail"),
      text("actor", { notNull: true, default: "'system'" }),
      json("payload", { notNull: true, default: "'{}'::jsonb" }),
      ts("createdAt", "created_at"),
    ],
    indexes: ["CREATE INDEX IF NOT EXISTS timeline_case_id_idx ON timeline (case_id, created_at DESC)"],
  } satisfies TableSpec,

  lessons: {
    name: "lessons",
    columns: [
      text("id", { pk: true, notNull: true }),
      text("caseId", { column: "case_id", notNull: true, references: `"cases"("id")`, onDelete: "CASCADE" }),
      text("caseRef", { column: "case_ref", notNull: true }),
      text("category", { notNull: true }),
      text("actionCategory", { column: "action_category", notNull: true }),
      text("pattern", { notNull: true }),
      text("lesson", { notNull: true }),
      text("outcome", { notNull: true }),
      { name: "weight", column: "weight", sql: "double precision", notNull: true, default: "1" },
      ts("createdAt", "created_at"),
    ],
    indexes: [
      "CREATE INDEX IF NOT EXISTS lessons_category_idx ON lessons (category, action_category)",
    ],
  } satisfies TableSpec,

  /** Used only by the local embedded memory provider (no Hindsight configured). */
  memoryUnits: {
    name: "memory_units",
    columns: [
      text("id", { pk: true, notNull: true }),
      text("bank", { notNull: true, default: "'lisa-operations'" }),
      text("content", { notNull: true }),
      text("context"),
      text("type", { notNull: true, default: "'experience'" }),
      { name: "tags", column: "tags", sql: "text[]", array: true, notNull: true, default: "'{}'" },
      json("metadata", { notNull: true, default: "'{}'::jsonb" }),
      text("sourceCaseId", { column: "source_case_id", references: `"cases"("id")`, onDelete: "SET NULL" }),
      text("outcome"),
      text("decision"),
      text("actionCategory", { column: "action_category" }),
      ts("occurredAt", "occurred_at"),
      ts("createdAt", "created_at"),
    ],
    indexes: ["CREATE INDEX IF NOT EXISTS memory_units_bank_idx ON memory_units (bank)"],
  } satisfies TableSpec,

  chatMessages: {
    name: "chat_messages",
    columns: [
      text("id", { pk: true, notNull: true }),
      text("sessionId", { column: "session_id", notNull: true }),
      text("role", { notNull: true }),
      text("content", { notNull: true }),
      json("memories", { notNull: true, default: "'[]'::jsonb" }),
      ts("createdAt", "created_at"),
    ],
    indexes: ["CREATE INDEX IF NOT EXISTS chat_messages_session_idx ON chat_messages (session_id, created_at)"],
  } satisfies TableSpec,

  settings: {
    name: "settings",
    columns: [
      text("key", { pk: true, notNull: true }),
      json("value", { notNull: true }),
      ts("updatedAt", "updated_at"),
    ],
  } satisfies TableSpec,
} as const;

export type TableName = keyof typeof TABLES;

export function columnOf(table: TableSpec, field: string): ColumnSpec | undefined {
  return table.columns.find((c) => c.name === field);
}

export function primaryKeyOf(table: TableSpec): ColumnSpec {
  const pk = table.columns.find((c) => c.pk);
  if (!pk) throw new Error(`Table ${table.name} has no primary key`);
  return pk;
}

/** Generate idempotent bootstrap DDL for every table. */
export function buildSchemaDDL(): string {
  const statements: string[] = [];
  for (const table of Object.values(TABLES) as TableSpec[]) {
    const cols = table.columns.map((c) => {
      const parts = [`"${c.column}"`, c.sql];
      if (c.pk) parts.push("PRIMARY KEY");
      if (c.unique) parts.push("UNIQUE");
      if (c.notNull && !c.pk) parts.push("NOT NULL");
      if (c.default) parts.push(`DEFAULT ${c.default}`);
      if (c.references) parts.push(`REFERENCES ${c.references}${c.onDelete ? ` ON DELETE ${c.onDelete}` : ""}`);
      return `  ${parts.join(" ")}`;
    });
    statements.push(`CREATE TABLE IF NOT EXISTS "${table.name}" (\n${cols.join(",\n")}\n);`);
    for (const idx of table.indexes ?? []) statements.push(`${idx};`);
  }
  return `${statements.join("\n\n")}\n`;
}
