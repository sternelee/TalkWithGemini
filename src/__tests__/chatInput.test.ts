import { describe, expect, it } from "vitest";
import { API_INPUT_LIMITS } from "../config/limits";
import {
  appendContextToChatInput,
  CHAT_INPUT_TRUNCATION_NOTICE,
  clampChatInputText,
} from "../lib/utils/chatInput";

describe("chat input length guards", () => {
  it("clamps oversized base messages with a truncation notice", () => {
    const result = clampChatInputText(
      "x".repeat(API_INPUT_LIMITS.maxChatTextChars + 10),
    );

    expect(result).toHaveLength(API_INPUT_LIMITS.maxChatTextChars);
    expect(result.endsWith(CHAT_INPUT_TRUNCATION_NOTICE)).toBe(true);
  });

  it("appends context without exceeding the chat request limit", () => {
    const result = appendContextToChatInput(
      "u".repeat(API_INPUT_LIMITS.maxChatTextChars - 200),
      "c".repeat(10_000),
    );

    expect(result.length).toBeLessThanOrEqual(
      API_INPUT_LIMITS.maxChatTextChars,
    );
    expect(result.endsWith(CHAT_INPUT_TRUNCATION_NOTICE)).toBe(true);
  });

  it("omits context when the base message already consumes the limit", () => {
    const base = "u".repeat(API_INPUT_LIMITS.maxChatTextChars);

    expect(appendContextToChatInput(base, "context")).toBe(base);
  });
});
