import type { Message, Session } from "@/types";

export interface SessionPostGenerationSnapshot {
  id: string;
  title: string;
  messageCount: number;
  compressionLastMessageId?: string;
}

export function createSessionPostGenerationSnapshot(
  session?: Session | null,
): SessionPostGenerationSnapshot | null {
  if (!session) return null;

  return {
    id: session.id,
    title: session.title,
    messageCount: session.messageCount,
    compressionLastMessageId: session.compression?.lastCompressedMessageId,
  };
}

export function shouldApplyGeneratedTitle(
  current: Session | undefined,
  snapshot: SessionPostGenerationSnapshot | null,
): boolean {
  return (
    !!current &&
    !!snapshot &&
    current.id === snapshot.id &&
    snapshot.title === "New Chat" &&
    current.title === "New Chat" &&
    current.messageCount === snapshot.messageCount
  );
}

export function shouldApplyRequestedTitle(
  current: Session | undefined,
  snapshot: SessionPostGenerationSnapshot | null,
): boolean {
  return (
    !!current &&
    !!snapshot &&
    current.id === snapshot.id &&
    current.title === snapshot.title &&
    current.messageCount === snapshot.messageCount
  );
}

export function shouldApplyCompressionUpdate(
  current: Session | undefined,
  snapshot: SessionPostGenerationSnapshot | null,
): boolean {
  return (
    !!current &&
    !!snapshot &&
    current.id === snapshot.id &&
    current.messageCount === snapshot.messageCount &&
    current.compression?.lastCompressedMessageId ===
      snapshot.compressionLastMessageId
  );
}

export function shouldApplySuggestedQuestions(
  currentMessage: Message | undefined,
  snapshot: { id: string; content: string } | null,
): boolean {
  return (
    !!currentMessage &&
    !!snapshot &&
    currentMessage.id === snapshot.id &&
    currentMessage.content === snapshot.content
  );
}

export function shouldAbortActiveGenerationForSessionDelete({
  currentSessionId,
  deletingSessionId,
  isGenerating,
}: {
  currentSessionId: string | null;
  deletingSessionId: string;
  isGenerating: boolean;
}): boolean {
  return isGenerating && currentSessionId === deletingSessionId;
}
