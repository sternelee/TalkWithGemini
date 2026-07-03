import { describe, expect, it } from "vitest";
import { SimpleRecursiveSplitter } from "../utils/textSplitter";

describe("SimpleRecursiveSplitter", () => {
  it("splits large text into multiple chunks using real segment counts", () => {
    const splitter = new SimpleRecursiveSplitter({
      chunkSize: 20,
      chunkOverlap: 2,
    });
    const chunks = splitter.splitText(
      Array.from({ length: 100 }, (_, i) => `word${i}`).join(" "),
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.trim().length > 0)).toBe(true);
  });
});
