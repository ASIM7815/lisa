import { describe, expect, it } from "vitest";
import { createCaseSchema, decisionSchema, resolveCaseSchema } from "@/lib/validation/schemas";

describe("case API validation", () => {
  it("applies safe category, priority and customer defaults", () => {
    const result = createCaseSchema.parse({ title: "A damaged delivery", description: "The parcel arrived with a broken casing." });
    expect(result.category).toBe("other");
    expect(result.priority).toBe("medium");
    expect(result.customer).toEqual({});
  });

  it("rejects short and oversized descriptions", () => {
    expect(createCaseSchema.safeParse({ title: "Issue", description: "tiny" }).success).toBe(false);
    expect(createCaseSchema.safeParse({ title: "Valid issue", description: "x".repeat(12_001) }).success).toBe(false);
  });

  it("requires a modified recommendation for a modify decision", () => {
    expect(decisionSchema.safeParse({ action: "modify" }).success).toBe(false);
    expect(decisionSchema.safeParse({ action: "approve", operator: "Morgan" }).success).toBe(true);
  });

  it("requires a human-reported outcome note", () => {
    expect(resolveCaseSchema.safeParse({ outcome: "success", outcomeNote: "ok" }).success).toBe(false);
    expect(resolveCaseSchema.safeParse({ outcome: "failure", outcomeNote: "The replacement never arrived." }).success).toBe(true);
  });
});
