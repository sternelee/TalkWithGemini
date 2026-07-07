import { describe, expect, it } from "vitest";
import {
  getAvailableReasoningModes,
  resolveReasoningModeForModel,
} from "../lib/chat/reasoning";

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
});
