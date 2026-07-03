import { describe, expect, it } from "vitest";
import {
  allocateContextBudget,
  estimateContextTokens,
  trimTextToEstimatedTokens,
} from "../lib/chat/contextBudget";

describe("context budget planning", () => {
  it("estimates tokens from text with a stable fallback", () => {
    expect(estimateContextTokens("")).toBe(0);
    expect(estimateContextTokens("abcd")).toBe(1);
    expect(estimateContextTokens("a".repeat(401))).toBe(101);
  });

  it("allocates bounded budgets for mixed context sources", () => {
    const budget = allocateContextBudget({
      modelInputTokenLimit: 8_000,
      reservedOutputTokens: 1_000,
      sources: {
        history: 20_000,
        attachments: 8_000,
        search: 12_000,
        rag: 12_000,
        tools: 6_000,
      },
    });

    expect(budget.totalAvailableTokens).toBe(7_000);
    expect(budget.allocations.history.maxTokens).toBeGreaterThan(
      budget.allocations.search.maxTokens,
    );
    expect(budget.allocations.attachments.maxTokens).toBeGreaterThan(0);
    expect(budget.allocations.tools.maxTokens).toBeLessThanOrEqual(700);
    expect(budget.totalAllocatedTokens).toBeLessThanOrEqual(7_000);
  });

  it("trims text to an estimated token budget without splitting below zero", () => {
    expect(trimTextToEstimatedTokens("abcdefghij", 2)).toBe("abcdefgh");
    expect(trimTextToEstimatedTokens("abcdefghij", 0)).toBe("");
    expect(trimTextToEstimatedTokens("short", 10)).toBe("short");
  });
});
