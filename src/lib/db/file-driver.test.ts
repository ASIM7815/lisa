import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileDriver } from "@/lib/db/file-driver";
import { createTable } from "@/lib/db/driver";
import { TABLES } from "@/lib/db/schema";

interface TestRow { id: string; title: string; status: string; createdAt: string; metadata: Record<string, unknown> }

describe("FileDriver", () => {
  let dir: string;
  let driver: FileDriver;
  let cases: ReturnType<typeof createTable<TestRow>>;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "lisa-test-"));
    driver = new FileDriver(dir);
    cases = createTable<TestRow>(driver, TABLES.cases);
  });
  afterEach(async () => { await driver.close(); await rm(dir, { recursive: true, force: true }); });

  it("supports CRUD, filters, ordering, count and upsert", async () => {
    const first = { id: "1", title: "One", status: "open", createdAt: "2026-01-01", metadata: { source: "test" } };
    const second = { id: "2", title: "Two", status: "resolved", createdAt: "2026-01-02", metadata: {} };
    await cases.insert(first);
    await cases.insert(second);
    expect(await cases.count({ status: "open" })).toBe(1);
    expect((await cases.list({ orderBy: "createdAt", order: "desc" })).map((item) => item.id)).toEqual(["2", "1"]);
    expect(await cases.update("1", { status: "resolved" })).toMatchObject({ id: "1", status: "resolved" });
    await cases.upsert({ ...first, title: "Updated" });
    expect(await cases.get("1")).toMatchObject({ title: "Updated" });
    expect(await cases.delete("2")).toBe(true);
    expect(await cases.delete("missing")).toBe(false);
  });

  it("persists atomic writes and reloads them in a new driver", async () => {
    await cases.insert({ id: "persist", title: "Persisted", status: "open", createdAt: "2026-01-01", metadata: {} });
    const reopened = new FileDriver(dir);
    const reopenedCases = createTable<TestRow>(reopened, TABLES.cases);
    expect(await reopenedCases.get("persist")).toMatchObject({ title: "Persisted" });
    await reopened.close();
  });
});
