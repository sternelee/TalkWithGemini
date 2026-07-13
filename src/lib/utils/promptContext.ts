import { PROMPT_CONTEXT_LIMITS } from "@/config/limits";

const TRUNCATION_NOTICE = "\n[Content truncated to fit prompt context limits.]";

export interface PromptContextBudget {
  remainingChars: number;
}

export function createPromptContextBudget(
  maxChars: number = PROMPT_CONTEXT_LIMITS.maxConvertedContentChars,
): PromptContextBudget {
  return { remainingChars: Math.max(0, Math.floor(maxChars)) };
}

export function escapePromptContextAttribute(
  value: unknown,
  maxChars: number = PROMPT_CONTEXT_LIMITS.maxFileNameChars,
): string {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .slice(0, maxChars)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\r\n\t]+/g, " ");
}

export function escapePromptContextText(
  value: unknown,
  maxChars = Number.POSITIVE_INFINITY,
): { text: string; truncated: boolean } {
  if (typeof value !== "string" || maxChars <= 0) {
    return {
      text: "",
      truncated: typeof value === "string" && value.length > 0,
    };
  }

  let output = "";
  let truncated = false;

  for (const char of value) {
    const escaped =
      char === "&"
        ? "&amp;"
        : char === "<"
          ? "&lt;"
          : char === ">"
            ? "&gt;"
            : char;

    if (output.length + escaped.length > maxChars) {
      truncated = true;
      break;
    }

    output += escaped;
  }

  return { text: output, truncated };
}

export function appendPlainPromptContext(
  parts: string[],
  budget: PromptContextBudget,
  value: string,
): boolean {
  if (budget.remainingChars <= 0 || !value) return false;

  const chunk = value.slice(0, budget.remainingChars);
  parts.push(chunk);
  budget.remainingChars -= chunk.length;
  return chunk.length === value.length;
}

export function appendPromptContextFile(
  parts: string[],
  budget: PromptContextBudget,
  {
    fileName,
    mimeType,
    content,
  }: {
    fileName: unknown;
    mimeType?: unknown;
    content: unknown;
  },
): boolean {
  const safeName =
    escapePromptContextAttribute(fileName) || "untitled-context.txt";
  const safeType = escapePromptContextAttribute(
    mimeType,
    PROMPT_CONTEXT_LIMITS.maxMimeTypeChars,
  );
  const typeAttribute = safeType ? ` type="${safeType}"` : "";
  const header = `\n<file name="${safeName}"${typeAttribute}>\n`;
  const footer = "\n</file>\n";

  const maxContentChars = Math.min(
    PROMPT_CONTEXT_LIMITS.maxSingleFileContentChars,
    budget.remainingChars - header.length - footer.length,
  );
  if (maxContentChars <= 0) return false;

  const noticeBudget = Math.max(0, maxContentChars - TRUNCATION_NOTICE.length);
  const escaped = escapePromptContextText(content, maxContentChars);
  let body = escaped.text;

  if (escaped.truncated && noticeBudget > 0) {
    body =
      escapePromptContextText(content, noticeBudget).text + TRUNCATION_NOTICE;
  }

  const block = `${header}${body}${footer}`;
  if (block.length > budget.remainingChars) return false;

  parts.push(block);
  budget.remainingChars -= block.length;
  return !escaped.truncated;
}
