import type { Message, Session } from "../../types";
import { normalizeCompressedContentWithMemoryIds } from "../utils/contextCompression";

export function getSuppressedMemoryIds(
  session: Session | null | undefined,
  messages: Message[],
): string[] {
  const compression = session?.compression;
  if (!compression) {
    return Array.from(new Set(session?.memoryContext?.injectedMemoryIds || []));
  }

  const lastCompressedIndex = messages.findIndex(
    (message) => message.id === compression.lastCompressedMessageId,
  );
  if (lastCompressedIndex < 0) {
    return Array.from(new Set(session?.memoryContext?.injectedMemoryIds || []));
  }

  const normalizedCompression = normalizeCompressedContentWithMemoryIds({
    content: compression.compressedContent,
    memoryIds: compression.includedMemoryIds || [],
  });
  const ids = new Set(normalizedCompression.representedMemoryIds);
  const firstUserMessage = messages.find((message) => message.role === "user");
  const representedMessages = [
    ...(firstUserMessage ? [firstUserMessage] : []),
    ...messages.slice(lastCompressedIndex + 1),
  ];
  for (const message of representedMessages) {
    for (const id of message.memoryContext?.injectedMemoryIds || []) {
      if (id) ids.add(id);
    }
  }
  return Array.from(ids);
}
