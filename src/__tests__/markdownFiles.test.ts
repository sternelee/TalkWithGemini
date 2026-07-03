import { describe, expect, it } from "vitest";
import { MARKDOWN_FILE_LIMITS } from "../config/limits";
import {
  normalizeMarkdownGeneratedFile,
  parseMarkdownFileBlocks,
} from "../lib/utils/markdownFiles";

describe("markdown file block normalization", () => {
  it("normalizes file metadata and decodes escaped attributes", () => {
    const file = normalizeMarkdownGeneratedFile({
      name: ` report&quot;\n${"x".repeat(MARKDOWN_FILE_LIMITS.maxFileNameChars)}`,
      type: `text/plain\t${"y".repeat(MARKDOWN_FILE_LIMITS.maxMimeTypeChars)}`,
      content: "hello",
    });

    expect(file.name).toContain('report"');
    expect(file.name.length).toBeLessThanOrEqual(
      MARKDOWN_FILE_LIMITS.maxFileNameChars,
    );
    expect(file.type.length).toBeLessThanOrEqual(
      MARKDOWN_FILE_LIMITS.maxMimeTypeChars,
    );
  });

  it("parses closed file blocks into bounded file segments", () => {
    const segments = parseMarkdownFileBlocks(
      [
        "Before",
        '<file name="note.md" type="text/markdown">',
        "# Note",
        "</file>",
        "After",
      ].join("\n"),
    );

    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({ kind: "markdown", content: "Before" });
    expect(segments[1]).toMatchObject({
      kind: "file",
      file: {
        name: "note.md",
        type: "text/markdown",
        content: "# Note",
        truncated: false,
        incomplete: false,
      },
    });
    expect(segments[2]).toMatchObject({ kind: "markdown", content: "After" });
  });

  it("recovers unclosed file blocks as incomplete bounded file cards", () => {
    const segments = parseMarkdownFileBlocks(
      ["Before", '<file name="draft.txt">', "line one", "line two"].join("\n"),
    );
    const fileSegment = segments.find((segment) => segment.kind === "file");

    expect(fileSegment).toMatchObject({
      kind: "file",
      file: {
        name: "draft.txt",
        incomplete: true,
      },
    });
    if (fileSegment?.kind === "file") {
      expect(fileSegment.file.content).toContain("line one\nline two");
      expect(fileSegment.file.content).toContain("File block was incomplete");
    }
  });

  it("truncates oversized file bodies with a visible notice", () => {
    const largeContent = "x".repeat(
      MARKDOWN_FILE_LIMITS.maxFileContentChars + 100,
    );
    const segments = parseMarkdownFileBlocks(
      `<file name="large.txt">\n${largeContent}\n</file>`,
    );
    const fileSegment = segments[0];

    expect(fileSegment).toMatchObject({ kind: "file" });
    if (fileSegment.kind === "file") {
      expect(fileSegment.file.truncated).toBe(true);
      expect(fileSegment.file.content.length).toBeLessThanOrEqual(
        MARKDOWN_FILE_LIMITS.maxFileContentChars,
      );
      expect(fileSegment.file.content).toContain("File content truncated");
    }
  });

  it("caps rendered file cards and adds one omission notice", () => {
    const blocks = Array.from(
      { length: MARKDOWN_FILE_LIMITS.maxFiles + 2 },
      (_, index) =>
        [`<file name="file-${index}.txt">`, `content ${index}`, "</file>"].join(
          "\n",
        ),
    ).join("\n");

    const segments = parseMarkdownFileBlocks(blocks);
    const fileSegments = segments.filter((segment) => segment.kind === "file");
    const noticeSegments = segments.filter(
      (segment) =>
        segment.kind === "markdown" &&
        segment.content.includes("Additional generated files omitted"),
    );

    expect(fileSegments).toHaveLength(MARKDOWN_FILE_LIMITS.maxFiles);
    expect(noticeSegments).toHaveLength(1);
  });
});
