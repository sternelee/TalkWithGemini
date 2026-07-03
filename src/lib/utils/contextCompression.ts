import { CONTEXT_COMPRESSION_LIMITS } from "../../config/limits";
import { escapePromptContextText } from "./promptContext";

const TRUNCATED_SOURCE_NOTICE =
  "\n[Conversation log truncated to fit compression prompt limits.]";
const TRUNCATED_COMPRESSED_NOTICE =
  "[Earlier compressed context truncated to fit storage limits.]\n";

export function createContextCompressionSummaryPrompt(text: string): string {
  const noticeBudget = Math.max(
    0,
    CONTEXT_COMPRESSION_LIMITS.maxSummarySourceChars -
      TRUNCATED_SOURCE_NOTICE.length,
  );
  const escaped = escapePromptContextText(
    text,
    CONTEXT_COMPRESSION_LIMITS.maxSummarySourceChars,
  );
  const body = escaped.truncated
    ? `${escapePromptContextText(text, noticeBudget).text}${TRUNCATED_SOURCE_NOTICE}`
    : escaped.text;

  return `Please summarize the following conversation log concisely.
Focus on key facts, user preferences, and decisions made.

<conversation_log>
${body}
</conversation_log>`;
}

export function normalizeCompressedContent(text: string): string {
  if (text.length <= CONTEXT_COMPRESSION_LIMITS.maxCompressedContentChars) {
    return text;
  }

  const tailBudget = Math.max(
    0,
    CONTEXT_COMPRESSION_LIMITS.maxCompressedContentChars -
      TRUNCATED_COMPRESSED_NOTICE.length,
  );
  return `${TRUNCATED_COMPRESSED_NOTICE}${text.slice(-tailBudget)}`;
}

export function mergeCompressedContent(
  previousContent: string,
  nextContent: string,
): string {
  return normalizeCompressedContent(
    previousContent ? `${previousContent}\n\n${nextContent}` : nextContent,
  );
}

export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const chunkBytes = CONTEXT_COMPRESSION_LIMITS.base64ChunkBytes;
  let output = "";

  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    const chunk = bytes.slice(offset, offset + chunkBytes);
    let binary = "";
    for (const byte of chunk) {
      binary += String.fromCharCode(byte);
    }
    output += btoa(binary);
  }

  return output;
}
