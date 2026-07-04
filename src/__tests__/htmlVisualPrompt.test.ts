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
    expect(instruction).toContain("Do not wrap HTML visual fragments in code fences");
    expect(instruction).toContain("Do not use class attributes");
    expect(instruction).toContain("fixed Tailwind color scale");
    expect(instruction).toContain("slate, zinc, red, and rose");
    expect(instruction).toContain("var(--html-visual-surface)");
    expect(instruction).toContain("var(--html-visual-info-surface)");
    expect(instruction).toContain("var(--html-visual-knowledge-surface)");
    expect(instruction).toContain("var(--html-visual-success-surface)");
    expect(instruction).toContain("var(--html-visual-warning-surface)");
    expect(instruction).toContain("var(--html-visual-danger-surface)");
    expect(instruction).toContain("blue, purple, green, amber, red, and rose light palettes");
    expect(instruction).toContain("Prefer pale surfaces");
    expect(instruction).toContain("transparent or very subtle borders");
    expect(instruction).toContain("restrained accents");
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
    expect(requestMessage).toContain("fixed Tailwind scale");
    expect(requestMessage).toContain("semantic variables");
    expect(requestMessage).toContain("project light palettes");
    expect(requestMessage).toContain("pale surfaces");
    expect(requestMessage).toContain("very subtle borders");
    expect(requestMessage).toContain("transparent overflow wrapper");
    expect(requestMessage).toContain("avoid styled table container cards");
    expect(requestMessage).toContain("Never place HTML visual fragments inside code fences");
  });

  it("leaves request text unchanged when HTML visual prompting is disabled", () => {
    expect(
      appendHtmlVisualRequestInstructions("Use Markdown.", "plain prompt"),
    ).toBe("Use Markdown.");
  });
});
