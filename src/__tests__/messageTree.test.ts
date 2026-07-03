import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import * as messageTree from "../lib/chat/messageTree";
import {
  appendMessageToActivePath,
  createModelResponseBranch,
  getActiveMessagePath,
  getAllMessagesFromTree,
  getMessageBranchInfo,
  normalizeSessionMessageTree,
  removeActivePathAfter,
  removeMessageFromTree,
  switchMessageBranch,
} from "../lib/chat/messageTree";

const makeMessage = (
  id: string,
  role: Message["role"],
  content: string,
): Message => ({
  id,
  role,
  content,
  timestamp: Number(id.replace(/\D/g, "")) || 1,
});

describe("message tree utilities", () => {
  it("normalizes a legacy linear message list into a single active path", () => {
    const messages = [
      makeMessage("u1", "user", "hello"),
      makeMessage("m1", "model", "hi"),
      makeMessage("u2", "user", "again"),
    ];

    const tree = normalizeSessionMessageTree(messages);

    expect(getActiveMessagePath(tree).map((message) => message.id)).toEqual([
      "u1",
      "m1",
      "u2",
    ]);
    expect(tree.rootMessageIds).toEqual(["u1"]);
    expect(tree.nodesById.u1.activeChildMessageId).toBe("m1");
    expect(tree.nodesById.m1.activeChildMessageId).toBe("u2");
  });

  it("converts legacy model versions into response sibling branches", () => {
    const ids = ["m1-v2"];
    const messages: Message[] = [
      makeMessage("u1", "user", "hello"),
      {
        ...makeMessage("m1", "model", "active answer"),
        versions: [
          {
            id: "version-1",
            content: "old answer",
            reasoning: "old reasoning",
            timestamp: 10,
            model: "model-a",
          },
          {
            id: "version-2",
            content: "active answer",
            reasoning: "active reasoning",
            timestamp: 20,
            model: "model-b",
          },
        ],
        activeVersionId: "version-2",
      },
      makeMessage("u2", "user", "follow up"),
    ];

    const tree = normalizeSessionMessageTree(messages, {
      createId: () => ids.shift() || "unexpected",
    });

    expect(tree.nodesById.u1.childMessageIds).toEqual(["m1-v2", "m1"]);
    expect(tree.nodesById.u1.activeChildMessageId).toBe("m1");
    expect(tree.nodesById["m1-v2"].message.content).toBe("old answer");
    expect(tree.nodesById["m1-v2"].activeChildMessageId).toBeUndefined();
    expect(getActiveMessagePath(tree).map((message) => message.id)).toEqual([
      "u1",
      "m1",
      "u2",
    ]);
  });

  it("creates a model response branch without deleting the old continuation", () => {
    let tree = normalizeSessionMessageTree([
      makeMessage("u1", "user", "hello"),
      makeMessage("m1", "model", "old answer"),
      makeMessage("u2", "user", "follow up"),
      makeMessage("m2", "model", "old continuation"),
    ]);

    tree = createModelResponseBranch(
      tree,
      "m1",
      makeMessage("m1b", "model", "new answer"),
    );

    expect(getActiveMessagePath(tree).map((message) => message.id)).toEqual([
      "u1",
      "m1b",
    ]);
    expect(getMessageBranchInfo(tree, "m1b")).toEqual({
      index: 1,
      count: 2,
    });

    tree = switchMessageBranch(tree, "m1b", "prev");

    expect(getActiveMessagePath(tree).map((message) => message.id)).toEqual([
      "u1",
      "m1",
      "u2",
      "m2",
    ]);
  });

  it("keeps nested branch choices scoped to their own upstream branch", () => {
    let tree = normalizeSessionMessageTree([
      makeMessage("u1", "user", "root"),
      makeMessage("m1", "model", "root answer"),
      makeMessage("u2", "user", "follow"),
      makeMessage("m2", "model", "follow answer"),
    ]);

    tree = createModelResponseBranch(
      tree,
      "m2",
      makeMessage("m2b", "model", "alternate follow answer"),
    );
    tree = createModelResponseBranch(
      tree,
      "m1",
      makeMessage("m1b", "model", "alternate root answer"),
    );

    expect(getActiveMessagePath(tree).map((message) => message.id)).toEqual([
      "u1",
      "m1b",
    ]);

    tree = switchMessageBranch(tree, "m1b", "prev");

    expect(getActiveMessagePath(tree).map((message) => message.id)).toEqual([
      "u1",
      "m1",
      "u2",
      "m2b",
    ]);
  });

  it("removes only the active continuation after a message", () => {
    let tree = normalizeSessionMessageTree([
      makeMessage("u1", "user", "root"),
      makeMessage("m1", "model", "root answer"),
      makeMessage("u2", "user", "follow"),
      makeMessage("m2", "model", "follow answer"),
    ]);
    tree = createModelResponseBranch(
      tree,
      "m2",
      makeMessage("m2b", "model", "alternate follow answer"),
    );

    const result = removeActivePathAfter(tree, "m1");

    expect(
      getActiveMessagePath(result.tree).map((message) => message.id),
    ).toEqual(["u1", "m1"]);
    expect(result.removedMessages.map((message) => message.id)).toEqual([
      "u2",
      "m2",
      "m2b",
    ]);
    expect(
      getAllMessagesFromTree(result.tree).map((message) => message.id),
    ).toEqual(["u1", "m1"]);
  });

  it("appends messages to the active path leaf", () => {
    let tree = normalizeSessionMessageTree([
      makeMessage("u1", "user", "root"),
      makeMessage("m1", "model", "root answer"),
    ]);
    tree = createModelResponseBranch(
      tree,
      "m1",
      makeMessage("m1b", "model", "alternate root answer"),
    );

    tree = appendMessageToActivePath(tree, makeMessage("u2", "user", "new"));

    expect(getActiveMessagePath(tree).map((message) => message.id)).toEqual([
      "u1",
      "m1b",
      "u2",
    ]);
    expect(tree.nodesById.m1.activeChildMessageId).toBeUndefined();
  });

  it("uses the active root message when normalizing existing trees", () => {
    const tree = normalizeSessionMessageTree({
      nodesById: {
        u1: {
          id: "u1",
          message: makeMessage("u1", "user", "first"),
          childMessageIds: ["m1"],
          activeChildMessageId: "m1",
        },
        m1: {
          id: "m1",
          message: makeMessage("m1", "model", "first answer"),
          parentMessageId: "u1",
          childMessageIds: [],
        },
        u1b: {
          id: "u1b",
          message: makeMessage("u1b", "user", "edited first"),
          childMessageIds: ["m1b"],
          activeChildMessageId: "m1b",
        },
        m1b: {
          id: "m1b",
          message: makeMessage("m1b", "model", "edited answer"),
          parentMessageId: "u1b",
          childMessageIds: [],
        },
      },
      rootMessageIds: ["u1", "u1b"],
      activeRootMessageId: "u1b",
    } as any);

    expect(getActiveMessagePath(tree).map((message) => message.id)).toEqual([
      "u1b",
      "m1b",
    ]);
  });

  it("creates user message branches and allows switching back to the old continuation", () => {
    const createUserMessageBranch = (messageTree as any)
      .createUserMessageBranch as typeof createModelResponseBranch;

    expect(typeof createUserMessageBranch).toBe("function");

    let tree = normalizeSessionMessageTree([
      makeMessage("u1", "user", "root"),
      makeMessage("m1", "model", "root answer"),
      makeMessage("u2", "user", "follow up"),
      makeMessage("m2", "model", "old continuation"),
    ]);

    tree = createUserMessageBranch(
      tree,
      "u2",
      makeMessage("u2b", "user", "edited follow up"),
    );

    expect(getActiveMessagePath(tree).map((message) => message.id)).toEqual([
      "u1",
      "m1",
      "u2b",
    ]);
    expect(getMessageBranchInfo(tree, "u2b")).toEqual({ index: 1, count: 2 });

    tree = switchMessageBranch(tree, "u2b", "prev");

    expect(getActiveMessagePath(tree).map((message) => message.id)).toEqual([
      "u1",
      "m1",
      "u2",
      "m2",
    ]);
  });

  it("creates root user branches for first-message edits", () => {
    const createUserMessageBranch = (messageTree as any)
      .createUserMessageBranch as typeof createModelResponseBranch;

    expect(typeof createUserMessageBranch).toBe("function");

    let tree = normalizeSessionMessageTree([
      makeMessage("u1", "user", "first"),
      makeMessage("m1", "model", "first answer"),
    ]);

    tree = createUserMessageBranch(
      tree,
      "u1",
      makeMessage("u1b", "user", "edited first"),
    );

    expect(getActiveMessagePath(tree).map((message) => message.id)).toEqual([
      "u1b",
    ]);

    tree = switchMessageBranch(tree, "u1b", "prev");

    expect(getActiveMessagePath(tree).map((message) => message.id)).toEqual([
      "u1",
      "m1",
    ]);
  });

  it("removes a single message while keeping its continuation", () => {
    const tree = normalizeSessionMessageTree([
      makeMessage("m1", "user", "delete me"),
      makeMessage("m2", "user", "keep me"),
    ]);

    const result = removeMessageFromTree(tree, "m1");

    expect(result.removedMessages.map((message) => message.id)).toEqual(["m1"]);
    expect(
      getActiveMessagePath(result.tree).map((message) => message.id),
    ).toEqual(["m2"]);
    expect(result.tree.nodesById.m2.parentMessageId).toBeUndefined();
  });
});
