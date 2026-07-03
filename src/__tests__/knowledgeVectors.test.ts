import { describe, expect, it } from "vitest";
import {
  buildKnowledgeVectorIds,
  buildKnowledgeVectorItems,
} from "../lib/utils/knowledgeVectors";

describe("knowledge vector helpers", () => {
  it("builds vector items with stable ids and metadata", () => {
    const items = buildKnowledgeVectorItems({
      collectionId: "collection_1",
      fileName: "notes.md",
      ragFileId: "file_1",
      textContent: Array.from(
        { length: 40 },
        (_, index) => `word${index}`,
      ).join(" "),
      chunkSize: 12,
    });

    expect(items.length).toBeGreaterThan(1);
    expect(items[0]).toMatchObject({
      id: "file_1_0",
      metadata: {
        collectionId: "collection_1",
        fileId: "file_1",
        fileName: "notes.md",
        chunkIndex: 0,
      },
    });
    expect(items.every((item) => item.data.trim().length > 0)).toBe(true);
  });

  it("builds vector ids from the persisted chunk count", () => {
    expect(buildKnowledgeVectorIds("file_1", 3)).toEqual([
      "file_1_0",
      "file_1_1",
      "file_1_2",
    ]);
    expect(buildKnowledgeVectorIds("file_1", 0)).toEqual([]);
  });
});
