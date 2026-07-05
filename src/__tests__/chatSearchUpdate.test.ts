import { describe, expect, it } from "vitest";
import { createMessageOutputBlockBuilder } from "../lib/chat/messageOutputBlocks";
import { buildSearchUpdate } from "../lib/chat/searchUpdate";
import type { Message } from "../types";

describe("chat search updates", () => {
  it("merges search sources and images without duplicating existing entries", () => {
    const message = {
      searchSources: [{ title: "A", url: "https://a.test", content: "same" }],
      searchImages: [{ url: "https://image.test/a.png", description: "same" }],
    } as Message;

    expect(
      buildSearchUpdate(message, false, {
        sources: [
          { title: "A", url: "https://a.test", content: "same" },
          { title: "B", url: "https://b.test", content: "new" },
        ],
        images: [
          { url: "https://image.test/a.png", description: "same" },
          { url: "https://image.test/b.png", description: "new" },
        ],
      }),
    ).toEqual({
      isSearching: false,
      searchSources: [
        { title: "A", url: "https://a.test", content: "same" },
        { title: "B", url: "https://b.test", content: "new" },
      ],
      searchImages: [
        { url: "https://image.test/a.png", description: "same" },
        { url: "https://image.test/b.png", description: "new" },
      ],
    });
  });

  it("keeps a failed search block visible with a sanitized error", () => {
    const builder = createMessageOutputBlockBuilder({
      createId: () => "search-1",
    });

    builder.upsertSearch({
      isSearching: false,
      results: { sources: [], images: [] },
      error: "Search provider failed",
    });

    expect(builder.getBlocks()).toEqual([
      {
        id: "search-1",
        type: "search",
        isSearching: false,
        sources: [],
        images: [],
        error: "Search provider failed",
      },
    ]);
  });
});
