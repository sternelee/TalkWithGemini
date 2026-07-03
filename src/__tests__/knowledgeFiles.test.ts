import { describe, expect, it } from "vitest";
import { KNOWLEDGE_LIMITS } from "../config/limits";
import {
  getKnowledgeFileSelectionMessage,
  selectKnowledgeFilesForUpload,
} from "../lib/utils/knowledgeFiles";

describe("knowledge file upload selection", () => {
  it("accepts files within collection count and size limits", () => {
    const result = selectKnowledgeFilesForUpload(0, [
      { name: "notes.md", size: 1024 },
      { name: "brief.pdf", size: 2048 },
    ]);

    expect(result.accepted.map((file) => file.name)).toEqual([
      "notes.md",
      "brief.pdf",
    ]);
    expect(result.rejectedByCount).toHaveLength(0);
    expect(result.rejectedByEmpty).toHaveLength(0);
    expect(result.rejectedBySize).toHaveLength(0);
  });

  it("rejects empty and oversized files before upload", () => {
    const result = selectKnowledgeFilesForUpload(0, [
      { name: "empty.pdf", size: 0 },
      {
        name: "huge.pdf",
        size: KNOWLEDGE_LIMITS.maxFileBytes + 1,
      },
      { name: "ok.txt", size: 1024 },
    ]);

    expect(result.accepted.map((file) => file.name)).toEqual(["ok.txt"]);
    expect(result.rejectedByEmpty.map((file) => file.name)).toEqual([
      "empty.pdf",
    ]);
    expect(result.rejectedBySize.map((file) => file.name)).toEqual([
      "huge.pdf",
    ]);
  });

  it("rejects files after the collection document limit", () => {
    const result = selectKnowledgeFilesForUpload(
      KNOWLEDGE_LIMITS.maxFilesPerCollection - 1,
      [
        { name: "one.txt", size: 1024 },
        { name: "two.txt", size: 1024 },
      ],
    );

    expect(result.accepted.map((file) => file.name)).toEqual(["one.txt"]);
    expect(result.rejectedByCount.map((file) => file.name)).toEqual([
      "two.txt",
    ]);
  });

  it("summarizes skipped files for upload feedback", () => {
    const message = getKnowledgeFileSelectionMessage({
      rejectedByCount: [{ name: "extra.txt", size: 10 }],
      rejectedByEmpty: [{ name: "empty.pdf", size: 0 }],
      rejectedBySize: [
        {
          name: "huge.pdf",
          size: KNOWLEDGE_LIMITS.maxFileBytes + 1,
        },
      ],
    });

    expect(message).toMatch(/limited to 100 documents/);
    expect(message).toMatch(/empty file/);
    expect(message).toMatch(/50 MB or smaller/);
  });
});
