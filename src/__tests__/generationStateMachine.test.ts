import { describe, expect, it } from "vitest";
import {
  createBackgroundTaskSnapshot,
  createInitialChatGenerationState,
  createInitialPipelineState,
  reduceChatGenerationState,
  shouldApplyBackgroundTaskSnapshot,
} from "../lib/chat/generationStateMachine";

describe("chat generation state machine", () => {
  it("tracks generation lifecycle and ignores stale run events", () => {
    const initial = createInitialChatGenerationState();
    expect(initial.status).toBe("idle");
    expect(createInitialPipelineState().model.state).toBe("idle");

    const pending = reduceChatGenerationState(initial, {
      type: "start",
      runId: 7,
      sessionId: "session-1",
      userMessageId: "user-1",
    });
    expect(pending).toMatchObject({
      status: "pending",
      activeRunId: 7,
      sessionId: "session-1",
      userMessageId: "user-1",
    });

    const withRagWarning = reduceChatGenerationState(pending, {
      type: "pipeline",
      runId: 7,
      phase: "rag",
      phaseState: "warning",
      message: "No knowledge sources returned",
    });
    expect(withRagWarning.pipeline.rag).toMatchObject({
      state: "warning",
      message: "No knowledge sources returned",
    });

    const streaming = reduceChatGenerationState(withRagWarning, {
      type: "stream-started",
      runId: 7,
      modelMessageId: "model-1",
    });
    expect(streaming).toMatchObject({
      status: "model",
      modelMessageId: "model-1",
    });

    const ignored = reduceChatGenerationState(streaming, {
      type: "completed",
      runId: 6,
    });
    expect(ignored).toBe(streaming);

    const stopping = reduceChatGenerationState(streaming, {
      type: "stop-requested",
      runId: 7,
    });
    expect(stopping.status).toBe("aborted");
    expect(stopping.stopRequested).toBe(true);

    const completed = reduceChatGenerationState(stopping, {
      type: "completed",
      runId: 7,
    });
    expect(completed.status).toBe("done");
    expect(completed.pipeline.model.state).toBe("success");
  });

  it("records optional capability failures without failing the model request", () => {
    const streaming = reduceChatGenerationState(
      reduceChatGenerationState(createInitialChatGenerationState(), {
        type: "start",
        runId: 3,
        sessionId: "session-1",
        userMessageId: "user-1",
      }),
      {
        type: "stream-started",
        runId: 3,
        modelMessageId: "model-1",
      },
    );

    const next = reduceChatGenerationState(streaming, {
      type: "optional-capability-failed",
      runId: 3,
      phase: "plugins",
      message: "Plugin auth is missing",
    });

    expect(next.status).toBe("model");
    expect(next.pipeline.plugins).toMatchObject({
      state: "error",
      message: "Plugin auth is missing",
    });
  });

  it("checks background task snapshots before applying async results", () => {
    const snapshot = createBackgroundTaskSnapshot({
      runId: 11,
      sessionId: "session-1",
      messageId: "model-1",
      messageContent: "hello",
      sessionUpdatedAt: 100,
    });

    expect(
      shouldApplyBackgroundTaskSnapshot(snapshot, {
        runId: 11,
        currentSessionId: "session-1",
        currentMessage: { id: "model-1", content: "hello" },
        currentSessionUpdatedAt: 100,
      }),
    ).toBe(true);
    expect(
      shouldApplyBackgroundTaskSnapshot(snapshot, {
        runId: 12,
        currentSessionId: "session-1",
        currentMessage: { id: "model-1", content: "hello" },
        currentSessionUpdatedAt: 100,
      }),
    ).toBe(false);
    expect(
      shouldApplyBackgroundTaskSnapshot(snapshot, {
        runId: 11,
        currentSessionId: "session-2",
        currentMessage: { id: "model-1", content: "hello" },
        currentSessionUpdatedAt: 100,
      }),
    ).toBe(false);
  });

  it("models aborted and failed generations without assistant error text", () => {
    const started = reduceChatGenerationState(
      createInitialChatGenerationState(),
      {
        type: "start",
        runId: 22,
        sessionId: "session-1",
        userMessageId: "user-1",
      },
    );

    const modelRunning = reduceChatGenerationState(started, {
      type: "pipeline",
      runId: 22,
      phase: "model",
      phaseState: "running",
    });
    expect(modelRunning.status).toBe("model");

    const failed = reduceChatGenerationState(modelRunning, {
      type: "failed",
      runId: 22,
      error: "Provider quota exceeded",
      recoverable: true,
    });
    expect(failed).toMatchObject({
      status: "error",
      error: {
        message: "Provider quota exceeded",
        recoverable: true,
      },
    });

    const aborted = reduceChatGenerationState(modelRunning, {
      type: "aborted",
      runId: 22,
      reason: "User stopped generation",
    });
    expect(aborted).toMatchObject({
      status: "aborted",
      stopRequested: false,
    });
    expect(aborted.error).toBeUndefined();
  });
});
