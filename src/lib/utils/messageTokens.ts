import type { Message } from "../../types";

export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("en-US", { granularity: "word" });
    let count = 0;
    for (const segment of segmenter.segment(text)) {
      if (segment.isWordLike) count += 1;
    }
    if (count > 0) return count;
  }
  return Math.ceil(text.length / 4);
}

export function getMessageDisplayTokenCount(message: Message): number {
  if (message.role === "user") {
    return estimateTextTokens(message.content);
  }

  if (message.usageMetadata) {
    return (
      message.usageMetadata.candidatesTokenCount ??
      message.usageMetadata.totalTokenCount -
        message.usageMetadata.promptTokenCount
    );
  }
  if (message.usage) {
    return message.usage.completion_tokens;
  }
  return estimateTextTokens(message.content);
}
