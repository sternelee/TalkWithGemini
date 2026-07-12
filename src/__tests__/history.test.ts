import { describe, expect, it } from "vitest";
import type { Message } from "../types";
import {
  prepareAnthropicMessages,
  prepareGeminiHistory,
  prepareOpenAIHistory,
  prepareOpenAIResponsesInput,
} from "../lib/utils/history";

describe("history converters", () => {
  it("restores persisted memory context for user messages across providers", () => {
    const message: Message = {
      id: "msg_1",
      role: "user",
      content: "What did we decide?",
      timestamp: 1,
      memoryContext: {
        injectedMemoryIds: ["mem_1"],
        promptContext:
          "<local-memory-context>\n[decision] Use sqlite for local storage.\n</local-memory-context>",
        createdAt: 1,
      },
    };

    expect(prepareGeminiHistory([message])[0].parts[0].text).toContain(
      "Use sqlite for local storage.",
    );
    expect(prepareOpenAIHistory([message])[0].content[0].text).toContain(
      "Use sqlite for local storage.",
    );
    expect(prepareOpenAIResponsesInput([message])[0].content[0].text).toContain(
      "Use sqlite for local storage.",
    );
    expect(prepareAnthropicMessages([message])[0].content[0].text).toContain(
      "Use sqlite for local storage.",
    );
  });

  it("uses Responses input text for users and output text for assistants", () => {
    const input = prepareOpenAIResponsesInput([
      {
        id: "user_1",
        role: "user",
        content: "hello test",
        timestamp: 1,
      },
      {
        id: "assistant_1",
        role: "model",
        content: "Hello! Test received.",
        timestamp: 2,
      },
    ]);

    expect(input).toEqual([
      {
        role: "user",
        content: [{ type: "input_text", text: "hello test" }],
      },
      {
        role: "assistant",
        content: [{ type: "output_text", text: "Hello! Test received." }],
      },
    ]);
  });
});
