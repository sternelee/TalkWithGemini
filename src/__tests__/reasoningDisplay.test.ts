import { describe, expect, it } from "vitest";
import { REASONING_UI_LIMITS } from "../config/limits";
import {
  createReasoningTranslationPrompt,
  extractReasoningTitle,
} from "../lib/utils/reasoningDisplay";

describe("reasoning display helpers", () => {
  it("extracts the latest title from a bounded tail", () => {
    const reasoning = [
      "**Old title**",
      "x".repeat(REASONING_UI_LIMITS.maxTitleScanChars + 10),
      "**New title**",
    ].join("\n");

    expect(extractReasoningTitle(reasoning)).toBe("New title");
  });

  it("returns null when no title-like line is present", () => {
    expect(extractReasoningTitle("plain reasoning")).toBeNull();
  });

  it("caps translation prompts and records truncation", () => {
    const { prompt, truncated } = createReasoningTranslationPrompt(
      "x".repeat(REASONING_UI_LIMITS.maxTranslationInputChars + 100),
      "Simplified Chinese",
    );

    expect(truncated).toBe(true);
    expect(prompt).toContain("Reasoning truncated before translation");
    expect(prompt.length).toBeLessThan(
      REASONING_UI_LIMITS.maxTranslationInputChars + 300,
    );
  });
});
