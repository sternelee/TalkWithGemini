import { CONTEXT_COMPRESSION_LIMITS } from "../../config/limits";
import type { Message } from "../../types";
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

function truncateCompressedContent(text: string): string {
  const tailBudget = Math.max(
    0,
    CONTEXT_COMPRESSION_LIMITS.maxCompressedContentChars -
      TRUNCATED_COMPRESSED_NOTICE.length,
  );
  return `${TRUNCATED_COMPRESSED_NOTICE}${text.slice(-tailBudget)}`;
}

function uniqueMemoryIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}

export function normalizeCompressedContentWithMemoryIds({
  content,
  memoryIds,
}: {
  content: string;
  memoryIds: string[];
}): { content: string; representedMemoryIds: string[] } {
  if (!content) {
    return { content: "", representedMemoryIds: [] };
  }
  if (content.length <= CONTEXT_COMPRESSION_LIMITS.maxCompressedContentChars) {
    return {
      content,
      representedMemoryIds: uniqueMemoryIds(memoryIds),
    };
  }
  return {
    content: truncateCompressedContent(content),
    representedMemoryIds: [],
  };
}

export function normalizeCompressedContent(text: string): string {
  return normalizeCompressedContentWithMemoryIds({
    content: text,
    memoryIds: [],
  }).content;
}

export function mergeCompressedContentWithMemoryIds({
  previousContent,
  previousMemoryIds,
  nextContent,
  nextMemoryIds,
}: {
  previousContent: string;
  previousMemoryIds: string[];
  nextContent: string;
  nextMemoryIds: string[];
}): { content: string; representedMemoryIds: string[] } {
  const normalizedPrevious = normalizeCompressedContentWithMemoryIds({
    content: previousContent,
    memoryIds: previousMemoryIds,
  });
  const combined = normalizedPrevious.content
    ? `${normalizedPrevious.content}\n\n${nextContent}`
    : nextContent;

  if (combined.length <= CONTEXT_COMPRESSION_LIMITS.maxCompressedContentChars) {
    return {
      content: combined,
      representedMemoryIds: uniqueMemoryIds([
        ...normalizedPrevious.representedMemoryIds,
        ...(nextContent ? nextMemoryIds : []),
      ]),
    };
  }

  const tailBudget = Math.max(
    0,
    CONTEXT_COMPRESSION_LIMITS.maxCompressedContentChars -
      TRUNCATED_COMPRESSED_NOTICE.length,
  );
  const nextContentFullyRepresented =
    nextContent.length > 0 && nextContent.length <= tailBudget;

  return {
    content: truncateCompressedContent(combined),
    representedMemoryIds: nextContentFullyRepresented
      ? uniqueMemoryIds(nextMemoryIds)
      : [],
  };
}

export function mergeCompressedContent(
  previousContent: string,
  nextContent: string,
): string {
  return mergeCompressedContentWithMemoryIds({
    previousContent,
    previousMemoryIds: [],
    nextContent,
    nextMemoryIds: [],
  }).content;
}

export function buildCompressionSource(messages: Message[]): {
  text: string;
  includedMemoryIds: string[];
  lastIncludedMessageId: string | null;
} {
  const parts: string[] = [];
  const includedMemoryIds: string[] = [];
  const seenMemoryIds = new Set<string>();
  let remaining = CONTEXT_COMPRESSION_LIMITS.maxSummarySourceChars;
  let lastIncludedMessageId: string | null = null;

  for (const message of messages) {
    if (remaining <= 0 || !message.id) break;
    const memoryContext = message.memoryContext?.promptContext?.trim();
    const messageBlock = `[${message.role.toUpperCase()}]: ${message.content}${
      memoryContext ? `\n[MEMORY CONTEXT]: ${memoryContext}` : ""
    }`;
    const segment = parts.length > 0 ? `\n\n${messageBlock}` : messageBlock;
    const escapedSegment = escapePromptContextText(segment, remaining);
    if (escapedSegment.truncated) break;

    parts.push(segment);
    remaining -= escapedSegment.text.length;
    lastIncludedMessageId = message.id;

    if (!memoryContext) continue;

    for (const id of message.memoryContext?.injectedMemoryIds || []) {
      if (!id || seenMemoryIds.has(id)) continue;
      seenMemoryIds.add(id);
      includedMemoryIds.push(id);
    }
  }

  return { text: parts.join(""), includedMemoryIds, lastIncludedMessageId };
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
