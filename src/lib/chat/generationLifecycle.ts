import type { Message } from "../../types";

export interface ActiveGenerationSyncSnapshot {
  sessionId: string;
  messages: Message[];
}

export function getNextGenerationRunId(currentRunId: number): number {
  return currentRunId + 1;
}

export function getNextMessageIdAfter(
  messages: Message[],
  messageId: string,
): string | null {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1) return null;

  return messages[index + 1]?.id || null;
}

export function isCurrentGenerationRun({
  currentRunId,
  runId,
  currentController,
  controller,
}: {
  currentRunId: number;
  runId: number;
  currentController: unknown;
  controller: unknown;
}): boolean {
  return currentRunId === runId && currentController === controller;
}

export function createActiveGenerationSyncSnapshot({
  currentSessionId,
  activeMessages,
}: {
  currentSessionId: string | null;
  activeMessages: Message[];
}): ActiveGenerationSyncSnapshot | null {
  if (!currentSessionId) return null;

  return {
    sessionId: currentSessionId,
    messages: [...activeMessages],
  };
}
