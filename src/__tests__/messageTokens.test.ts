import { describe, expect, it } from "vitest";
import { getMessageDisplayTokenCount } from "../lib/utils/messageTokens";
import type { Message } from "../types";

describe("message display token counts", () => {
  it("counts user messages from the original user content only", () => {
    const message: Message = {
      id: "user_1",
      role: "user",
      content: "Short user text",
      timestamp: 1,
      usageMetadata: {
        promptTokenCount: 12_000,
        candidatesTokenCount: 0,
        totalTokenCount: 12_000,
      },
      usage: {
        prompt_tokens: 10_000,
        completion_tokens: 0,
        total_tokens: 10_000,
      },
    };

    expect(getMessageDisplayTokenCount(message)).toBeLessThan(10);
  });

  it("keeps model completion usage as the display count", () => {
    const message: Message = {
      id: "model_1",
      role: "model",
      content: "Answer",
      timestamp: 1,
      usage: {
        prompt_tokens: 100,
        completion_tokens: 42,
        total_tokens: 142,
      },
    };

    expect(getMessageDisplayTokenCount(message)).toBe(42);
  });
});
