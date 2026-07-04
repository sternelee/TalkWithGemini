export type MarkdownDiagramType = "mermaid" | "mindmap";

export interface MarkdownDiagramBlock {
  type: MarkdownDiagramType;
  language: string;
  content: string;
  incomplete: boolean;
}

export type MarkdownDiagramSegment =
  | {
      kind: "markdown";
      content: string;
    }
  | {
      kind: "diagram";
      diagram: MarkdownDiagramBlock;
    };

const OPEN_FENCE_PATTERN = /^([ \t]{0,3})(`{3,}|~{3,})[ \t]*([^\n\r]*)$/;

function splitLinesWithEndings(content: string): string[] {
  if (!content) return [];
  return content.match(/[^\n]*(?:\n|$)/g)?.filter(Boolean) || [];
}

function lineText(line: string): string {
  return line.endsWith("\n") ? line.slice(0, -1) : line;
}

function stripTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content.slice(0, -1) : content;
}

function getDiagramType(info: string): {
  type: MarkdownDiagramType;
  language: string;
} | null {
  const language = info.trim().toLowerCase().split(/\s+/, 1)[0] || "";
  if (language === "mermaid" || language === "mmd") {
    return { type: "mermaid", language };
  }
  if (language === "mindmap") {
    return { type: "mindmap", language };
  }
  return null;
}

function isClosingFence(line: string, opener: string): boolean {
  const fenceChar = opener[0];
  const fenceLength = opener.length;
  const escapedFenceChar = fenceChar === "`" ? "`" : "\\~";
  const pattern = new RegExp(
    `^[ \\t]{0,3}${escapedFenceChar}{${fenceLength},}[ \\t]*$`,
  );
  return pattern.test(lineText(line));
}

export function parseMarkdownDiagramBlocks(
  content: string,
): MarkdownDiagramSegment[] {
  const segments: MarkdownDiagramSegment[] = [];
  const markdownBuffer: string[] = [];
  const lines = splitLinesWithEndings(content);

  const pushMarkdown = () => {
    if (markdownBuffer.length === 0) return;
    segments.push({ kind: "markdown", content: markdownBuffer.join("") });
    markdownBuffer.length = 0;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const openingMatch = lineText(line).match(OPEN_FENCE_PATTERN);
    const diagramType = openingMatch
      ? getDiagramType(openingMatch[3] || "")
      : null;

    if (!openingMatch || !diagramType) {
      markdownBuffer.push(line);
      continue;
    }

    pushMarkdown();

    const opener = openingMatch[2];
    const contentLines: string[] = [];
    let incomplete = true;

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      if (isClosingFence(candidate, opener)) {
        incomplete = false;
        index = cursor;
        if (candidate.endsWith("\n") && cursor < lines.length - 1) {
          markdownBuffer.push("\n");
        }
        break;
      }
      contentLines.push(candidate);
      index = cursor;
    }

    segments.push({
      kind: "diagram",
      diagram: {
        ...diagramType,
        content: stripTrailingNewline(contentLines.join("")),
        incomplete,
      },
    });

    if (incomplete) {
      break;
    }
  }

  pushMarkdown();
  return segments;
}
