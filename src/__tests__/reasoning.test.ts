import { describe, expect, it } from "vitest";
import {
  getAvailableReasoningModes,
  resolveReasoningModeForModel,
} from "../lib/chat/reasoning";
import { resolveEffectiveChatRequestConfig } from "../lib/chat/effectiveChatConfig";

describe("reasoning mode helpers", () => {
  it("uses model effort metadata to expose only supported app modes", () => {
    const metadata = {
      id: "model-a",
      name: "Model A",
      reasoning: true,
      reasoning_options: [
        { type: "effort" as const, values: ["low" as const, "high" as const] },
      ],
    };

    expect(getAvailableReasoningModes(metadata)).toEqual([
      "off",
      "auto",
      "low",
      "high",
    ]);
    expect(resolveReasoningModeForModel("medium", metadata)).toBe("auto");
    expect(resolveReasoningModeForModel("high", metadata)).toBe("high");
  });

  it("normalizes request config against selected model reasoning support", () => {
    const config = resolveEffectiveChatRequestConfig({
      chatConfig: {
        useSearch: true,
        useReasoning: true,
        reasoningMode: "medium",
        temperature: 0.7,
      },
      selectedModel: "provider:model-a",
      modelMetadata: {
        "model-a": {
          id: "model-a",
          name: "Model A",
          reasoning: true,
          reasoning_options: [{ type: "effort", values: ["low", "high"] }],
        },
      },
      customModelMetadata: {},
    });

    expect(config).toMatchObject({
      useSearch: true,
      reasoningMode: "auto",
      useReasoning: true,
      temperature: 0.7,
    });
  });
});
