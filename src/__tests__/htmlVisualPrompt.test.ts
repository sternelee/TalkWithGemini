import { describe, expect, it } from "vitest";
import {
  appendHtmlVisualRequestInstructions,
  buildHtmlVisualPromptInstruction,
  isHtmlVisualPromptInstructionEnabled,
} from "../lib/chat/htmlVisualPrompt";

describe("HTML visual prompt helpers", () => {
  it("builds an active raw HTML visual format instruction", () => {
    const instruction = buildHtmlVisualPromptInstruction();

    expect(instruction).toContain("<format");
    expect(instruction).toContain("<html-visual>");
    expect(instruction).toContain("actively use safe inline HTML");
    expect(instruction).toContain("raw HTML");
    expect(instruction).toContain(
      "Do not wrap HTML visual fragments in code fences",
    );
    expect(instruction).toContain("Do not use class attributes");
    expect(instruction).toContain("semantic neon diagram palette");
    expect(instruction).toContain("cyan, mint, violet, amber, and rose");
    expect(instruction).toContain("var(--html-visual-surface)");
    expect(instruction).toContain("var(--html-visual-info-surface)");
    expect(instruction).toContain("var(--html-visual-knowledge-surface)");
    expect(instruction).toContain("var(--html-visual-success-surface)");
    expect(instruction).toContain("var(--html-visual-warning-surface)");
    expect(instruction).toContain("var(--html-visual-danger-surface)");
    expect(instruction).toContain(
      "same cyan, mint, violet, amber, and rose hue families",
    );
    expect(instruction).toContain("Prefer pale surfaces in light mode");
    expect(instruction).toContain(
      "near-navy translucent surfaces in dark mode",
    );
    expect(instruction).toContain("transparent or very subtle borders");
    expect(instruction).toContain("subtle neon accents");
    expect(instruction).toContain("output the table directly");
    expect(instruction).toContain("Do not wrap tables in styled cards");
    expect(instruction).toContain("avoid hard-coding white-on-white");
    expect(instruction).toContain("script");
    expect(instruction).toContain("style tags");
  });

  it("detects enabled instructions and appends API-only request fallback text", () => {
    const systemInstruction = buildHtmlVisualPromptInstruction();
    const message = "Compare these options.";

    expect(isHtmlVisualPromptInstructionEnabled(systemInstruction)).toBe(true);
    expect(isHtmlVisualPromptInstructionEnabled("plain prompt")).toBe(false);

    const requestMessage = appendHtmlVisualRequestInstructions(
      message,
      systemInstruction,
    );

    expect(requestMessage).toContain(message);
    expect(requestMessage).toContain("<format_instructions");
    expect(requestMessage).toContain("raw HTML fragments directly");
    expect(requestMessage).toContain("semantic neon palette");
    expect(requestMessage).toContain("semantic variables");
    expect(requestMessage).toContain("cyan, mint, violet, amber, and rose");
    expect(requestMessage).toContain("pale light surfaces");
    expect(requestMessage).toContain("near-navy dark surfaces");
    expect(requestMessage).toContain("very subtle borders");
    expect(requestMessage).toContain("transparent overflow wrapper");
    expect(requestMessage).toContain("avoid styled table container cards");
    expect(requestMessage).toContain(
      "Never place HTML visual fragments inside code fences",
    );
  });

  it("leaves request text unchanged when HTML visual prompting is disabled", () => {
    expect(
      appendHtmlVisualRequestInstructions("Use Markdown.", "plain prompt"),
    ).toBe("Use Markdown.");
  });
});
