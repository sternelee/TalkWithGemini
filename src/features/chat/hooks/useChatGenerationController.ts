"use client";

import { useCallback, useRef, useState } from "react";

import {
  createActiveGenerationSyncSnapshot,
  getNextGenerationRunId,
  isCurrentGenerationRun,
  type ActiveGenerationSyncSnapshot,
} from "@/lib/chat/generationLifecycle";
import { useChatStore } from "@/store/core/chatStore";

export interface ActiveGenerationRun {
  runId: number;
  controller: AbortController;
}

interface UseChatGenerationControllerOptions {
  persistStoppedGeneration?: (
    snapshot: ActiveGenerationSyncSnapshot,
  ) => Promise<void>;
}

export function useChatGenerationController({
  persistStoppedGeneration,
}: UseChatGenerationControllerOptions = {}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const generationRunRef = useRef(0);

  const beginActiveGeneration = useCallback((): ActiveGenerationRun => {
    const runId = getNextGenerationRunId(generationRunRef.current);
    const controller = new AbortController();
    generationRunRef.current = runId;
    abortControllerRef.current = controller;
    setIsGenerating(true);

    return { runId, controller };
  }, []);

  const isGenerationRunActive = useCallback(
    ({ runId, controller }: ActiveGenerationRun) =>
      isCurrentGenerationRun({
        currentRunId: generationRunRef.current,
        runId,
        currentController: abortControllerRef.current,
        controller,
      }),
    [],
  );

  const finishActiveGeneration = useCallback(
    ({ runId, controller }: ActiveGenerationRun) => {
      if (!isGenerationRunActive({ runId, controller })) return;

      abortControllerRef.current = null;
      setIsGenerating(false);
    },
    [isGenerationRunActive],
  );

  const stopActiveGeneration = useCallback(async () => {
    const state = useChatStore.getState();
    const syncSnapshot = createActiveGenerationSyncSnapshot({
      currentSessionId: state.currentSessionId,
      activeMessages: state.activeMessages,
    });

    generationRunRef.current = getNextGenerationRunId(generationRunRef.current);
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsGenerating(false);

    if (!syncSnapshot) return;

    if (persistStoppedGeneration) {
      await persistStoppedGeneration(syncSnapshot);
      return;
    }

    await state.syncActiveSession(
      syncSnapshot.sessionId,
      syncSnapshot.messages,
    );
  }, [persistStoppedGeneration]);

  return {
    isGenerating,
    beginActiveGeneration,
    isGenerationRunActive,
    finishActiveGeneration,
    stopActiveGeneration,
  };
}
