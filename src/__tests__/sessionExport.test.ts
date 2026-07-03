import { describe, expect, it, vi } from "vitest";
import type { Message, Session } from "../types";
import { createSessionExportPayload } from "../lib/chat/sessionExport";
import {
  createModelResponseBranch,
  normalizeSessionMessageTree,
} from "../lib/chat/messageTree";

const makeSession = (id: string): Session => ({
  id,
  title: "Chat",
  messageCount: 1,
  updatedAt: 1,
  model: "model",
});

const makeMessage = (id: string, content: string): Message => ({
  id,
  role: "user",
  content,
  timestamp: 1,
});

describe("session export payloads", () => {
  it("uses the active in-memory snapshot for the current session", async () => {
    const activeMessage = makeMessage("m1", "unsynced active text");
    const loadMessages = vi.fn(() =>
      Promise.resolve([makeMessage("db", "stale db text")]),
    );

    const payload = await createSessionExportPayload({
      session: makeSession("active"),
      currentSessionId: "active",
      activeMessages: [activeMessage],
      loadMessages,
    });

    expect(payload.messages).toEqual([activeMessage]);
    expect(loadMessages).not.toHaveBeenCalled();
  });

  it("loads inactive session messages through the supplied storage reader", async () => {
    const storedMessage = makeMessage("m2", "stored inactive text");
    const loadMessages = vi.fn(() => Promise.resolve([storedMessage]));

    const payload = await createSessionExportPayload({
      session: makeSession("inactive"),
      currentSessionId: "active",
      activeMessages: [makeMessage("m1", "active text")],
      loadMessages,
    });

    expect(loadMessages).toHaveBeenCalledWith("inactive");
    expect(payload.messages).toEqual([storedMessage]);
  });

  it("exports the current path and complete message tree for tree-backed sessions", async () => {
    let tree = normalizeSessionMessageTree([
      makeMessage("u1", "prompt"),
      { ...makeMessage("m1", "answer"), role: "model" as const },
      makeMessage("u2", "follow up"),
    ]);
    tree = createModelResponseBranch(tree, "m1", {
      ...makeMessage("m1b", "alternate answer"),
      role: "model",
    });
    const loadMessages = vi.fn(() => Promise.resolve(tree as any));

    const payload = await createSessionExportPayload({
      session: makeSession("inactive"),
      currentSessionId: "active",
      activeMessages: [],
      loadMessages,
    });

    expect(payload.messages.map((message) => message.id)).toEqual([
      "u1",
      "m1b",
    ]);
    expect((payload as any).messageTree).toEqual(tree);
  });

  it("propagates inactive storage read failures instead of returning an empty export", async () => {
    await expect(
      createSessionExportPayload({
        session: makeSession("inactive"),
        currentSessionId: "active",
        activeMessages: [],
        loadMessages: () => Promise.reject(new Error("storage failed")),
      }),
    ).rejects.toThrow("storage failed");
  });
});
