import { describe, expect, it } from "vitest";
import {
  createMessageOutputBlockBuilder,
  getMessageOutputBlocks,
} from "../lib/chat/messageOutputBlocks";
import type { Message } from "../types";

describe("message output blocks", () => {
  it("keeps separate tool groups when text appears between tool calls", () => {
    const builder = createMessageOutputBlockBuilder({
      createId: (() => {
        let index = 0;
        return () => `block-${++index}`;
      })(),
    });

    builder.appendText("Before ");
    builder.appendToolCall({
      id: "call_1",
      name: "lookup",
      args: { q: "one" },
      status: "pending",
    });
    builder.appendText("After ");
    builder.appendToolCall({
      id: "call_2",
      name: "lookup",
      args: { q: "two" },
      status: "pending",
    });

    expect(builder.getBlocks().map((block) => block.type)).toEqual([
      "text",
      "tool_group",
      "text",
      "tool_group",
    ]);
  });

  it("merges consecutive tool calls and updates tool results in place", () => {
    const builder = createMessageOutputBlockBuilder({
      createId: (() => {
        let index = 0;
        return () => `block-${++index}`;
      })(),
    });

    builder.appendToolCall({
      id: "call_1",
      name: "lookup",
      args: { q: "one" },
      status: "pending",
    });
    builder.appendToolCall({
      id: "call_2",
      name: "fetch",
      args: { id: "two" },
      status: "pending",
    });
    builder.updateToolCall({
      id: "call_1",
      name: "lookup",
      args: { q: "one" },
      status: "success",
      result: { ok: true },
    });

    const blocks = builder.getBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      type: "tool_group",
      toolCalls: [
        { id: "call_1", status: "success", result: { ok: true } },
        { id: "call_2", status: "pending" },
      ],
    });
  });

  it("uses legacy fields when old messages do not have output blocks", () => {
    const message: Message = {
      id: "msg_1",
      role: "model",
      content: "Final answer",
      reasoning: "I should check context.",
      timestamp: 1,
      searchSources: [
        {
          title: "Source",
          url: "https://example.com",
          content: "Context",
        },
      ],
      toolCalls: [
        {
          id: "call_1",
          name: "lookup",
          args: {},
          status: "success",
          result: "ok",
        },
      ],
    };

    expect(getMessageOutputBlocks(message).map((block) => block.type)).toEqual([
      "search",
      "tool_group",
      "reasoning",
      "text",
    ]);
  });
});
