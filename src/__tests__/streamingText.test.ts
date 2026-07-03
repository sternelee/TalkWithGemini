import { describe, expect, it } from "vitest";
import { createStreamingReplacement } from "../lib/utils/streamingText";

describe("streaming text helpers", () => {
  it("builds replacement text without appending to the original", () => {
    const stream = createStreamingReplacement("old prompt");

    expect(stream.append("new")).toBe("new");
    expect(stream.append(" prompt")).toBe("new prompt");
    expect(stream.value()).toBe("new prompt");
  });

  it("keeps the original available for rollback", () => {
    const stream = createStreamingReplacement("stable prompt");
    stream.append("partial");

    expect(stream.restore()).toBe("stable prompt");
  });
});
