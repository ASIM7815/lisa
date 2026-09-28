import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("LISA experience loop", () => {
  const originalDataDir = process.env.LISA_DATA_DIR;
  let tempDir = "";
  let tablesModule: typeof import("@/lib/db") | null = null;

  afterEach(async () => {
    if (tablesModule) await tablesModule.driver.close();
    Reflect.deleteProperty(globalThis, "__lisa_driver__");
    tablesModule = null;
    process.env.LISA_DATA_DIR = originalDataDir;
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("records outcomes and retrieves the new experience for the next similar case", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "lisa-loop-"));
    process.env.LISA_DATA_DIR = tempDir;
    vi.resetModules();

    const [{ seedDemoData }, caseService, analysisService, decisionService, db] = await Promise.all([
      import("@/lib/services/seed-service"),
      import("@/lib/services/case-service"),
      import("@/lib/services/analysis-service"),
      import("@/lib/services/decision-service"),
      import("@/lib/db"),
    ]).then(([seed, cases, analysis, decisions, database]) => [seed, cases, analysis, decisions, database] as const);
    tablesModule = db;

    const seeded = await seedDemoData();
    expect(seeded.seeded).toBe(true);
    expect(seeded.resolved).toBeGreaterThan(0);

    const first = await caseService.createCase({
      title: "Urgent order is late and tracking has stopped",
      description: "Customer needs the shipment this week. Tracking has shown no scan for 48 hours and the order is already overdue.",
      category: "delivery_failure",
      priority: "high",
      customer: { name: "Demo Customer", email: "demo@example.com" },
      metadata: {},
      source: "test",
    });
    const initial = await analysisService.analyzeCase(first.id, true);
    expect(initial.memory.similarCases.length).toBeGreaterThan(0);
    expect(initial.memory.adjustments.some((item) => item.actionCategory === "reship" && item.direction === "boost")).toBe(true);

    await decisionService.recordDecision(first.id, { action: "approve", operator: "Test operator" });
    const resolution = await decisionService.resolveCase(first.id, {
      outcome: "success",
      outcomeNote: "Priority replacement arrived next morning; customer confirmed delivery.",
      operator: "Test operator",
    });
    expect(resolution.case.status).toBe("resolved");
    expect(resolution.memoryRetained).toBe(true);

    const second = await caseService.createCase({
      title: "Another overdue order with no carrier scan",
      description: "A similar shipment is late, tracking has not updated for two days, and the customer needs the item urgently.",
      category: "delivery_failure",
      priority: "high",
      customer: { name: "Another Customer" },
      metadata: {},
      source: "test",
    });
    const learned = await analysisService.analyzeCase(second.id, true);
    expect(learned.recommendation.actionCategory).toBe("reship");
    expect(learned.memory.similarCases.some((item) => item.caseId === first.id && item.outcome === "success")).toBe(true);
    expect(learned.memory.adjustments.find((item) => item.actionCategory === "reship")?.evidenceCount).toBeGreaterThanOrEqual(2);
  });
});
