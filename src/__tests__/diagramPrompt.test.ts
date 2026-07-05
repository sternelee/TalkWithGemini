import { describe, expect, it } from "vitest";
import {
  appendDiagramRequestInstructions,
  buildDiagramPromptInstruction,
  isDiagramPromptInstructionEnabled,
  isEnhancedDiagramPromptInstructionEnabled,
} from "../lib/chat/diagramPrompt";

describe("diagram prompt helpers", () => {
  it("builds base diagram guidance with separated Mermaid and mindmap formats", () => {
    const instruction = buildDiagramPromptInstruction();

    expect(instruction).toContain("<diagram-rendering>");
    expect(instruction).toContain("```mermaid");
    expect(instruction).toContain("```mindmap");
    expect(instruction).toContain("Never use Mermaid to render mind maps");
    expect(instruction).toContain("Markdown list");
    expect(instruction).toContain("one root topic");
    expect(instruction).toContain("two-space indented child items");
    expect(instruction).toContain("blank line");
    expect(instruction).toContain("frontmatter");
    expect(instruction).toContain("direction");
    expect(instruction).toContain("theme");
    expect(instruction).toContain("- [x]");
    expect(instruction).toContain("> remark");
    expect(instruction).toContain("collapsed");
    expect(instruction).toContain("tags");
    expect(instruction).toContain("cross-links");
    expect(instruction).not.toContain("<diagram-visual-polish>");
    expect(isDiagramPromptInstructionEnabled(instruction)).toBe(true);
    expect(isEnhancedDiagramPromptInstructionEnabled(instruction)).toBe(false);
  });

  it("adds enhanced diagram style guidance only when requested", () => {
    const instruction = buildDiagramPromptInstruction({ enhanced: true });

    expect(instruction).toContain("<diagram-rendering>");
    expect(instruction).toContain("<diagram-visual-polish>");
    expect(instruction).toContain("theme-aware");
    expect(instruction).toContain("short node labels");
    expect(isDiagramPromptInstructionEnabled(instruction)).toBe(true);
    expect(isEnhancedDiagramPromptInstructionEnabled(instruction)).toBe(true);
  });

  it("appends request-level diagram guidance and avoids duplicates", () => {
    const systemInstruction = buildDiagramPromptInstruction({ enhanced: true });
    const message = appendDiagramRequestInstructions(
      "Explain this architecture.",
      systemInstruction,
    );

    expect(message).toContain("Explain this architecture.");
    expect(message).toContain('data-diagram-rendering="true"');
    expect(message).toContain("Mermaid");
    expect(message).toContain("mindmap");
    expect(message).toContain("Never use Mermaid for mindmap");
    expect(message).toContain("Markdown list syntax");
    expect(message).toContain("root topic");
    expect(message).toContain("indented");
    expect(message).toContain("Do not output Mermaid mindmap syntax");
    expect(message).toContain("enhanced visual style");

    expect(appendDiagramRequestInstructions(message, systemInstruction)).toBe(
      message,
    );
  });

  it("leaves request text unchanged when diagram guidance is absent", () => {
    expect(
      appendDiagramRequestInstructions("Use normal Markdown.", "plain prompt"),
    ).toBe("Use normal Markdown.");
  });
});
