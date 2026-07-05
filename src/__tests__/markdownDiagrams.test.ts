import { describe, expect, it } from "vitest";
import {
  parseMarkdownFileBlocks,
  type MarkdownFileSegment,
} from "../lib/utils/markdownFiles";
import {
  getRenderableDiagram,
  parseMarkdownDiagramBlocks,
  type MarkdownDiagramSegment,
} from "../lib/utils/markdownDiagrams";

describe("markdown diagram block parsing", () => {
  it("extracts closed mermaid and mindmap fenced blocks", () => {
    const segments = parseMarkdownDiagramBlocks(
      [
        "Before",
        "```mermaid",
        "graph TD",
        "  A --> B",
        "```",
        "Between",
        "```mindmap",
        "Root",
        "  - Branch",
        "```",
        "After",
      ].join("\n"),
    );

    expect(segments).toHaveLength(5);
    expect(segments[0]).toEqual({ kind: "markdown", content: "Before\n" });
    expect(segments[1]).toMatchObject({
      kind: "diagram",
      diagram: {
        type: "mermaid",
        language: "mermaid",
        content: "graph TD\n  A --> B",
        incomplete: false,
      },
    });
    expect(segments[2]).toEqual({ kind: "markdown", content: "\nBetween\n" });
    expect(segments[3]).toMatchObject({
      kind: "diagram",
      diagram: {
        type: "mindmap",
        language: "mindmap",
        content: "Root\n  - Branch",
        incomplete: false,
      },
    });
    expect(segments[4]).toEqual({ kind: "markdown", content: "\nAfter" });
  });

  it("treats mmd as mermaid and supports currently streaming fences", () => {
    const segments = parseMarkdownDiagramBlocks(
      ["```mmd", "sequenceDiagram", "  A->>B: hi"].join("\n"),
    );

    expect(segments).toEqual([
      {
        kind: "diagram",
        diagram: {
          type: "mermaid",
          language: "mmd",
          content: "sequenceDiagram\n  A->>B: hi",
          incomplete: true,
        },
      },
    ]);
  });

  it("leaves non-diagram fenced code as markdown", () => {
    const content = ["```ts", "const value = 1;", "```"].join("\n");

    expect(parseMarkdownDiagramBlocks(content)).toEqual([
      { kind: "markdown", content },
    ]);
  });

  it("can be applied after generated file block parsing without swallowing files", () => {
    const fileSegments = parseMarkdownFileBlocks(
      [
        '<file name="notes.md" type="text/markdown">',
        "```mermaid",
        "graph TD",
        "  File --> Content",
        "```",
        "</file>",
        "```mindmap",
        "Visible",
        "  - Diagram",
        "```",
      ].join("\n"),
    );

    const expanded: Array<MarkdownFileSegment | MarkdownDiagramSegment> = [];
    for (const segment of fileSegments) {
      if (segment.kind === "markdown") {
        expanded.push(...parseMarkdownDiagramBlocks(segment.content));
      } else {
        expanded.push(segment);
      }
    }

    expect(expanded[0]).toMatchObject({
      kind: "file",
      file: {
        name: "notes.md",
        content: expect.stringContaining("File --> Content"),
      },
    });
    expect(expanded[1]).toMatchObject({
      kind: "diagram",
      diagram: {
        type: "mindmap",
        content: "Visible\n  - Diagram",
      },
    });
  });

  it("holds the last rendered diagram while a streamed update is incomplete", () => {
    const stable = {
      type: "mermaid" as const,
      language: "mermaid",
      content: "graph TD\n  A --> B",
      incomplete: false,
    };
    const streaming = {
      ...stable,
      content: "graph TD\n  A --> B\n  B -->",
      incomplete: true,
    };

    expect(getRenderableDiagram(stable, null)).toEqual(stable);
    expect(getRenderableDiagram(streaming, stable)).toEqual(stable);
  });
});
