import { describe, expect, it } from "vitest";
import { buildMobileMessageMetaTooltip } from "../lib/utils/messageMetaTooltip";

describe("mobile message metadata tooltip", () => {
  it("builds tooltip rows only for duration and token metadata", () => {
    expect(
      buildMobileMessageMetaTooltip({
        durationString: "1.2s",
        tokenText: "42 tokens",
        labels: {
          duration: "Duration",
          tokens: "Tokens",
        },
      }),
    ).toEqual(["Duration: 1.2s", "Tokens: 42 tokens"]);
  });

  it("omits missing mobile metadata rows", () => {
    expect(
      buildMobileMessageMetaTooltip({
        durationString: null,
        tokenText: "",
        labels: {
          duration: "Duration",
          tokens: "Tokens",
        },
      }),
    ).toEqual([]);
  });
});
