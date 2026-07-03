import { describe, expect, it } from "vitest";
import {
  buildSearchContextForPrompt,
  parseSearchDecisionResult,
} from "../lib/search/decision";

describe("search decision helpers", () => {
  it("parses model JSON decisions and falls back to no-search on invalid output", async () => {
    expect(
      parseSearchDecisionResult(
        '{"shouldSearch":true,"query":"OpenAI latest model"}',
        "fallback",
      ),
    ).toEqual({ shouldSearch: true, query: "OpenAI latest model" });
    expect(parseSearchDecisionResult("not json", "fallback")).toEqual({
      shouldSearch: false,
      query: "fallback",
    });
  });

  it("builds numbered search context that instructs the model to cite sources", async () => {
    const context = buildSearchContextForPrompt([
      {
        title: "Neo Chat",
        url: "https://example.com/neo-chat",
        content: "Neo Chat search context",
      },
    ]);

    expect(context).toContain("[1]");
    expect(context).toContain("https://example.com/neo-chat");
    expect(context).toContain("Use citations like [1]");
  });
});
