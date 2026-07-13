import { MARKDOWN_FILE_LIMITS } from "@/config/limits";

export interface MarkdownGeneratedFile {
  name: string;
  type: string;
  content: string;
  truncated: boolean;
  incomplete: boolean;
}

export type MarkdownFileSegment =
  | {
      kind: "markdown";
      content: string;
    }
  | {
      kind: "file";
      file: MarkdownGeneratedFile;
    };

const CONTROL_CHARS_PATTERN = /[\u0000-\u001f\u007f]+/g;
const ATTRIBUTE_PATTERN = /([a-zA-Z][\w:-]*)\s*=\s*"([^"]*)"/g;
const FILE_START_PATTERN = /^<file\b(.*)>$/i;
const FILE_END_PATTERN = /^<\/file>$/i;

const FILE_TRUNCATED_NOTICE =
  "[File content truncated for preview and download.]";
const FILE_INCOMPLETE_NOTICE =
  "[File block was incomplete; showing captured content.]";
const EXTRA_FILE_NOTICE = `[Additional generated files omitted because this message includes more than ${MARKDOWN_FILE_LIMITS.maxFiles} file blocks.]`;

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function trimField(value: unknown, maxChars: number, fallback = ""): string {
  const text = typeof value === "string" ? value : "";
  const normalized = decodeBasicHtmlEntities(text)
    .replace(CONTROL_CHARS_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();

  const safeText = normalized || fallback;
  if (safeText.length <= maxChars) return safeText;
  if (maxChars <= 3) return safeText.slice(0, maxChars);
  return `${safeText.slice(0, maxChars - 3)}...`;
}

function appendNoticeWithinLimit(content: string, notices: string[]): string {
  if (notices.length === 0) return content;

  const noticeText = `\n\n${notices.join("\n")}`;
  const maxChars = MARKDOWN_FILE_LIMITS.maxFileContentChars;
  if (noticeText.length >= maxChars) return noticeText.slice(0, maxChars);

  const contentBudget = maxChars - noticeText.length;
  return `${content.slice(0, Math.max(0, contentBudget))}${noticeText}`;
}

function parseFileStartLine(
  line: string,
): { name: string; type: string } | null {
  const trimmed = line.trim();
  if (trimmed.endsWith("/>")) return null;

  const match = trimmed.match(FILE_START_PATTERN);
  if (!match) return null;

  const attrs: Record<string, string> = {};
  const rawAttributes = match[1] || "";
  for (const attrMatch of rawAttributes.matchAll(ATTRIBUTE_PATTERN)) {
    attrs[attrMatch[1].toLowerCase()] = attrMatch[2];
  }

  if (!("name" in attrs)) return null;

  return {
    name: attrs.name,
    type: attrs.type || "",
  };
}

export function normalizeMarkdownGeneratedFile({
  name,
  type = "",
  content,
  incomplete = false,
  truncated: forcedTruncated = false,
}: {
  name: unknown;
  type?: unknown;
  content: unknown;
  incomplete?: boolean;
  truncated?: boolean;
}): MarkdownGeneratedFile {
  const rawContent = typeof content === "string" ? content : "";
  const truncated =
    forcedTruncated ||
    rawContent.length > MARKDOWN_FILE_LIMITS.maxFileContentChars;
  const notices = [
    truncated ? FILE_TRUNCATED_NOTICE : "",
    incomplete ? FILE_INCOMPLETE_NOTICE : "",
  ].filter(Boolean);

  const boundedContent = appendNoticeWithinLimit(
    rawContent.slice(0, MARKDOWN_FILE_LIMITS.maxFileContentChars),
    notices,
  );

  return {
    name: trimField(
      name,
      MARKDOWN_FILE_LIMITS.maxFileNameChars,
      "generated-file.txt",
    ),
    type: trimField(type, MARKDOWN_FILE_LIMITS.maxMimeTypeChars),
    content: boundedContent,
    truncated,
    incomplete,
  };
}

function* iterateLines(content: string): Generator<string> {
  let start = 0;
  while (start <= content.length) {
    const nextNewline = content.indexOf("\n", start);
    if (nextNewline === -1) {
      yield content.slice(start);
      return;
    }
    yield content.slice(start, nextNewline);
    start = nextNewline + 1;
  }
}

function appendActiveFileLine(
  activeFile: { content: string; truncated: boolean; lineCount: number },
  line: string,
) {
  const prefix = activeFile.lineCount > 0 ? "\n" : "";
  const addition = `${prefix}${line}`;
  const maxChars = MARKDOWN_FILE_LIMITS.maxFileContentChars;
  const remaining = maxChars - activeFile.content.length;
  activeFile.lineCount += 1;

  if (remaining <= 0) {
    activeFile.truncated = true;
    return;
  }

  if (addition.length > remaining) {
    activeFile.content += addition.slice(0, remaining);
    activeFile.truncated = true;
    return;
  }

  activeFile.content += addition;
}

export function parseMarkdownFileBlocks(
  content: string,
): MarkdownFileSegment[] {
  const segments: MarkdownFileSegment[] = [];
  const markdownBuffer: string[] = [];
  let activeFile: {
    name: string;
    type: string;
    content: string;
    truncated: boolean;
    lineCount: number;
  } | null = null;
  let fileCount = 0;
  let skippingExtraFile = false;
  let extraNoticeAdded = false;

  const pushMarkdown = () => {
    if (markdownBuffer.length === 0) return;
    segments.push({ kind: "markdown", content: markdownBuffer.join("\n") });
    markdownBuffer.length = 0;
  };

  const pushFile = (incomplete: boolean) => {
    if (!activeFile) return;
    segments.push({
      kind: "file",
      file: normalizeMarkdownGeneratedFile({
        name: activeFile.name,
        type: activeFile.type,
        content: activeFile.content,
        incomplete,
        truncated: activeFile.truncated,
      }),
    });
    fileCount += 1;
    activeFile = null;
  };

  for (const line of iterateLines(content)) {
    if (skippingExtraFile) {
      if (FILE_END_PATTERN.test(line.trim())) {
        skippingExtraFile = false;
      }
      continue;
    }

    if (activeFile) {
      if (FILE_END_PATTERN.test(line.trim())) {
        pushFile(false);
      } else {
        appendActiveFileLine(activeFile, line);
      }
      continue;
    }

    const fileStart = parseFileStartLine(line);
    if (!fileStart) {
      markdownBuffer.push(line);
      continue;
    }

    pushMarkdown();
    if (fileCount >= MARKDOWN_FILE_LIMITS.maxFiles) {
      if (!extraNoticeAdded) {
        segments.push({ kind: "markdown", content: EXTRA_FILE_NOTICE });
        extraNoticeAdded = true;
      }
      skippingExtraFile = true;
      continue;
    }

    activeFile = {
      name: fileStart.name,
      type: fileStart.type,
      content: "",
      truncated: false,
      lineCount: 0,
    };
  }

  if (activeFile) {
    pushFile(true);
  }
  pushMarkdown();

  return segments;
}
