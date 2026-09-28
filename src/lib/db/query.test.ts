import { describe, expect, it } from "vitest";
import { buildWhereSql, matchesWhere, type Where } from "@/lib/db/query";
import { TABLES } from "@/lib/db/schema";

describe("query matcher shared by Postgres and file storage", () => {
  const row = { id: "a", status: "resolved", category: "delivery_failure", tags: ["urgent", "customer"], createdAt: "2026-09-28T10:00:00.000Z", title: "Parcel delayed" };

  it("matches scalar, membership, date range, substring and array overlap", () => {
    expect(matchesWhere(row, { status: "resolved" })).toBe(true);
    expect(matchesWhere(row, { status: { $in: ["open", "resolved"] } })).toBe(true);
    expect(matchesWhere(row, { createdAt: { $gte: "2026-01-01T00:00:00Z" } })).toBe(true);
    expect(matchesWhere(row, { title: { $ilike: "%DELAY%" } })).toBe(true);
    expect(matchesWhere(row, { tags: { $any: ["urgent"] } })).toBe(true);
    expect(matchesWhere(row, { status: { $nin: ["resolved"] } })).toBe(false);
  });

  it("handles null / existence conditions", () => {
    expect(matchesWhere({ outcome: null }, { outcome: null })).toBe(true);
    expect(matchesWhere({ value: "present" }, { value: { $exists: true } })).toBe(true);
    expect(matchesWhere({ value: null }, { value: { $exists: false } })).toBe(true);
  });

  it("compiles user data to bind parameters, never SQL literals", () => {
    const injected = "x' OR 1=1 --";
    const compiled = buildWhereSql(TABLES.cases, { title: injected, status: { $in: ["open", "resolved"] } });
    expect(compiled.sql).toContain('"title" = $1');
    expect(compiled.sql).toContain('"status" IN ($2, $3)');
    expect(compiled.sql).not.toContain(injected);
    expect(compiled.params).toEqual([injected, "open", "resolved"]);
  });

  it("supports nested OR filters for real case search", () => {
    const where: Where = {
      status: "open",
      $or: [
        { title: { $ilike: "%parcel%" } },
        { customer: { $ilike: "%alex@example.com%" } },
      ],
    };
    expect(matchesWhere({ status: "open", title: "Parcel missing", customer: {} }, where)).toBe(true);
    expect(matchesWhere({ status: "resolved", title: "Parcel missing", customer: {} }, where)).toBe(false);
    const compiled = buildWhereSql(TABLES.cases, where);
    expect(compiled.sql).toContain('"status" = $1');
    expect(compiled.sql).toContain('(("title" ILIKE $2) OR ("customer"::text ILIKE $3))');
    expect(compiled.params).toEqual(["open", "%parcel%", "%alex@example.com%"]);
  });

  it("rejects unknown columns and produces safe empty-set SQL", () => {
    expect(() => buildWhereSql(TABLES.cases, { arbitrarySql: "DROP TABLE cases" })).toThrow(/Unknown column/);
    expect(buildWhereSql(TABLES.cases, { id: { $in: [] } }).sql).toContain("FALSE");
  });
});
