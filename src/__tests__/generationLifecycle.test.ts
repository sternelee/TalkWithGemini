import { describe, expect, it } from "vitest";
import {
  createActiveGenerationSyncSnapshot,
  getNextMessageIdAfter,
  getNextGenerationRunId,
  isCurrentGenerationRun,
} from "../lib/chat/generationLifecycle";
import type { Message } from "../types";

describe("generation lifecycle guards", () => {
  it("increments generation run ids monotonically", () => {
    expect(getNextGenerationRunId(0)).toBe(1);
    expect(getNextGenerationRunId(41)).toBe(42);
  });

  it("allows only the owning run and controller to finish active generation state", () => {
    const firstController = new AbortController();
    const secondController = new AbortController();

    expect(
      isCurrentGenerationRun({
        currentRunId: 2,
        runId: 2,
        currentController: secondController,
        controller: secondController,
      }),
    ).toBe(true);

    expect(
      isCurrentGenerationRun({
        currentRunId: 2,
        runId: 1,
        currentController: secondController,
        controller: secondController,
      }),
    ).toBe(false);

    expect(
      isCurrentGenerationRun({
        currentRunId: 2,
        runId: 2,
        currentController: secondController,
        controller: firstController,
      }),
    ).toBe(false);
  });

  it("captures a stable stopped-generation sync snapshot", () => {
    const messages: Message[] = [
      {
        id: "m1",
        role: "model",
        content: "partial",
        timestamp: 1,
      },
    ];

    const snapshot = createActiveGenerationSyncSnapshot({
      currentSessionId: "session-1",
      activeMessages: messages,
    });

    expect(snapshot).toEqual({
      sessionId: "session-1",
      messages,
    });
    expect(snapshot?.messages).not.toBe(messages);

    messages.push({
      id: "m2",
      role: "user",
      content: "later",
      timestamp: 2,
    });

    expect(snapshot?.messages).toHaveLength(1);
  });

  it("does not create a stopped-generation sync snapshot without an active session", () => {
    expect(
      createActiveGenerationSyncSnapshot({
        currentSessionId: null,
        activeMessages: [],
      }),
    ).toBeNull();
  });

  it("finds the next message id after a regeneration target", () => {
    const messages: Message[] = [
      { id: "user-1", role: "user", content: "one", timestamp: 1 },
      { id: "model-1", role: "model", content: "two", timestamp: 2 },
      { id: "user-2", role: "user", content: "three", timestamp: 3 },
    ];

    expect(getNextMessageIdAfter(messages, "model-1")).toBe("user-2");
    expect(getNextMessageIdAfter(messages, "user-2")).toBeNull();
    expect(getNextMessageIdAfter(messages, "missing")).toBeNull();
  });
});
