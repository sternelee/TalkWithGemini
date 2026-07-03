import { describe, expect, it } from "vitest";
import type { Message, Session } from "../types";
import {
  createSessionPostGenerationSnapshot,
  shouldAbortActiveGenerationForSessionDelete,
  shouldApplyCompressionUpdate,
  shouldApplyGeneratedTitle,
  shouldApplyRequestedTitle,
  shouldApplySuggestedQuestions,
} from "../lib/chat/postGenerationGuards";

const baseSession: Session = {
  id: "session-1",
  title: "New Chat",
  messageCount: 2,
  updatedAt: 1,
  model: "model",
};

const baseMessage: Message = {
  id: "message-1",
  role: "model",
  content: "answer",
  timestamp: 1,
};

describe("post-generation guards", () => {
  it("allows generated titles only for unchanged new sessions", () => {
    const snapshot = createSessionPostGenerationSnapshot(baseSession);

    expect(shouldApplyGeneratedTitle(baseSession, snapshot)).toBe(true);
    expect(
      shouldApplyGeneratedTitle(
        { ...baseSession, title: "Manual title" },
        snapshot,
      ),
    ).toBe(false);
    expect(
      shouldApplyGeneratedTitle({ ...baseSession, messageCount: 4 }, snapshot),
    ).toBe(false);
  });

  it("allows requested titles only when the clicked session snapshot is unchanged", () => {
    const session = { ...baseSession, title: "Existing title" };
    const snapshot = createSessionPostGenerationSnapshot(session);

    expect(shouldApplyRequestedTitle(session, snapshot)).toBe(true);
    expect(
      shouldApplyRequestedTitle(
        { ...session, title: "Manual title" },
        snapshot,
      ),
    ).toBe(false);
    expect(
      shouldApplyRequestedTitle(
        { ...session, messageCount: session.messageCount + 1 },
        snapshot,
      ),
    ).toBe(false);
    expect(shouldApplyRequestedTitle(undefined, snapshot)).toBe(false);
  });

  it("allows compression updates only when the session compression baseline is unchanged", () => {
    const session = {
      ...baseSession,
      compression: {
        compressedContent: "summary",
        lastCompressedMessageId: "message-1",
      },
    };
    const snapshot = createSessionPostGenerationSnapshot(session);

    expect(shouldApplyCompressionUpdate(session, snapshot)).toBe(true);
    expect(
      shouldApplyCompressionUpdate(
        {
          ...session,
          compression: {
            compressedContent: "newer",
            lastCompressedMessageId: "message-2",
          },
        },
        snapshot,
      ),
    ).toBe(false);
    expect(
      shouldApplyCompressionUpdate(
        { ...session, messageCount: session.messageCount + 1 },
        snapshot,
      ),
    ).toBe(false);
  });

  it("allows suggested questions only for the same unchanged message content", () => {
    const snapshot = { id: baseMessage.id, content: baseMessage.content };

    expect(shouldApplySuggestedQuestions(baseMessage, snapshot)).toBe(true);
    expect(
      shouldApplySuggestedQuestions(
        { ...baseMessage, content: "regenerated answer" },
        snapshot,
      ),
    ).toBe(false);
    expect(
      shouldApplySuggestedQuestions(
        { ...baseMessage, id: "other-message" },
        snapshot,
      ),
    ).toBe(false);
  });

  it("aborts generation only when deleting the current generating session", () => {
    expect(
      shouldAbortActiveGenerationForSessionDelete({
        currentSessionId: "session-1",
        deletingSessionId: "session-1",
        isGenerating: true,
      }),
    ).toBe(true);
    expect(
      shouldAbortActiveGenerationForSessionDelete({
        currentSessionId: "session-1",
        deletingSessionId: "session-2",
        isGenerating: true,
      }),
    ).toBe(false);
    expect(
      shouldAbortActiveGenerationForSessionDelete({
        currentSessionId: "session-1",
        deletingSessionId: "session-1",
        isGenerating: false,
      }),
    ).toBe(false);
  });
});
