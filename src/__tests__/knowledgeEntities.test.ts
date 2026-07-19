import { describe, expect, it } from "vitest";
import { KNOWLEDGE_LIMITS } from "../config/limits";
import {
  normalizeKnowledgeCollection,
  normalizeKnowledgeCollections,
  normalizeKnowledgeFile,
} from "../lib/knowledge/entities";

describe("knowledge entity normalization", () => {
  it("normalizes collection metadata and caps persisted files", () => {
    const collection = normalizeKnowledgeCollection({
      id: ` ${"c".repeat(KNOWLEDGE_LIMITS.maxCollectionIdChars + 10)}`,
      name: ` ${"n".repeat(KNOWLEDGE_LIMITS.maxCollectionNameChars + 10)}`,
      description: "d".repeat(
        KNOWLEDGE_LIMITS.maxCollectionDescriptionChars + 10,
      ),
      icon: "UnknownIcon",
      color: "javascript:bg-red-500",
      updatedAt: Number.NaN,
      files: Array.from(
        { length: KNOWLEDGE_LIMITS.maxFilesPerCollection + 5 },
        (_, index) => ({
          id: `file-${index}`,
          name: `file-${index}.txt`,
          size: 10,
          type: "text/plain",
          uploadedAt: Date.now(),
          status: "saved",
        }),
      ),
    });

    expect(collection).not.toBeNull();
    expect(collection?.id).toHaveLength(KNOWLEDGE_LIMITS.maxCollectionIdChars);
    expect(collection?.name).toHaveLength(
      KNOWLEDGE_LIMITS.maxCollectionNameChars,
    );
    expect(collection?.description).toHaveLength(
      KNOWLEDGE_LIMITS.maxCollectionDescriptionChars,
    );
    expect(collection?.icon).toBe("Folder");
    expect(collection?.color).toBe("blue");
    expect(collection?.updatedAt).toEqual(expect.any(Number));
    expect(collection?.files).toHaveLength(
      KNOWLEDGE_LIMITS.maxFilesPerCollection,
    );
  });

  it("normalizes file metadata and invalid status values", () => {
    const file = normalizeKnowledgeFile({
      id: "",
      name: ` ${"f".repeat(KNOWLEDGE_LIMITS.maxFileNameChars + 10)}`,
      size: KNOWLEDGE_LIMITS.maxFileBytes + 1,
      type: "text/plain".repeat(50),
      uploadedAt: -1,
      status: "done",
      ragId: "r".repeat(KNOWLEDGE_LIMITS.maxRagIdChars + 5),
      ragChunkCount: KNOWLEDGE_LIMITS.maxRagChunkCount + 5,
      path: "p".repeat(KNOWLEDGE_LIMITS.maxPathChars + 5),
      error: "e".repeat(KNOWLEDGE_LIMITS.maxErrorChars + 5),
    });

    expect(file).not.toBeNull();
    expect(file?.id).toEqual(expect.any(String));
    expect(file?.name).toHaveLength(KNOWLEDGE_LIMITS.maxFileNameChars);
    expect(file?.size).toBe(KNOWLEDGE_LIMITS.maxFileBytes);
    expect(file?.type).toHaveLength(KNOWLEDGE_LIMITS.maxMimeTypeChars);
    expect(file?.status).toBe("saved");
    expect(file?.ragId).toHaveLength(KNOWLEDGE_LIMITS.maxRagIdChars);
    expect(file?.ragChunkCount).toBe(KNOWLEDGE_LIMITS.maxRagChunkCount);
    expect(file?.path).toHaveLength(KNOWLEDGE_LIMITS.maxPathChars);
    expect(file?.error).toHaveLength(KNOWLEDGE_LIMITS.maxErrorChars);
  });

  it("deduplicates and caps persisted collections", () => {
    const collections = normalizeKnowledgeCollections([
      {
        id: "same",
        name: "A",
        description: "",
        icon: "Folder",
        color: "blue",
        files: [],
        updatedAt: Date.now(),
      },
      {
        id: "same",
        name: "B",
        description: "",
        icon: "Folder",
        color: "blue",
        files: [],
        updatedAt: Date.now(),
      },
      ...Array.from(
        { length: KNOWLEDGE_LIMITS.maxCollections + 5 },
        (_, i) => ({
          id: `collection-${i}`,
          name: `Collection ${i}`,
          description: "",
          icon: "Folder",
          color: "blue",
          files: [],
          updatedAt: Date.now(),
        }),
      ),
    ]);

    expect(collections).toHaveLength(KNOWLEDGE_LIMITS.maxCollections);
    expect(
      collections.filter((collection) => collection.id === "same"),
    ).toHaveLength(1);
  });

  it("migrates legacy knowledge paths without inventing binary originals", () => {
    const textFile = normalizeKnowledgeFile({
      id: "text",
      name: "notes.txt",
      size: 5,
      type: "text/plain",
      uploadedAt: 1,
      status: "saved",
      path: "opfs://knowledge/notes.txt",
    });
    const binaryFile = normalizeKnowledgeFile({
      id: "pdf",
      name: "report.pdf",
      size: 5,
      type: "application/pdf",
      uploadedAt: 1,
      status: "saved",
      path: "opfs://knowledge/report.pdf",
    });

    expect(textFile).toMatchObject({
      sourcePath: "opfs://knowledge/notes.txt",
      contentPath: "opfs://knowledge/notes.txt",
      contentKind: "source_text",
      storageStatus: "saved",
      indexStatus: "not_indexed",
    });
    expect(binaryFile).toMatchObject({
      contentPath: "opfs://knowledge/report.pdf",
      contentKind: "extracted_text",
      sourceMissing: true,
      storageStatus: "saved",
      indexStatus: "not_indexed",
    });
    expect(binaryFile?.sourcePath).toBeUndefined();
    expect(normalizeKnowledgeFile(binaryFile)).toEqual(binaryFile);
  });
});
