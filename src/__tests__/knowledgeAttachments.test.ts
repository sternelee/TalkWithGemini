import { describe, expect, it } from "vitest";
import {
  createKnowledgeCollectionAttachment,
  createKnowledgeFileAttachment,
  getKnowledgeAttachmentSelectionKey,
  isKnowledgeAttachment,
  parseKnowledgeFileAttachmentData,
} from "../lib/utils/knowledgeAttachments";

describe("knowledge attachment helpers", () => {
  it("recognizes collection and file knowledge attachments", () => {
    const collection = createKnowledgeCollectionAttachment({
      collectionId: "collection-1",
      collectionName: "Project Docs",
    });
    const file = createKnowledgeFileAttachment({
      collectionId: "collection-1",
      fileId: "file-1",
      fileName: "brief.md",
    });

    expect(isKnowledgeAttachment(collection)).toBe(true);
    expect(isKnowledgeAttachment(file)).toBe(true);
    expect(isKnowledgeAttachment({ ...file, mimeType: "text/plain" })).toBe(
      false,
    );
  });

  it("parses file attachment data and builds stable selection keys", () => {
    const file = createKnowledgeFileAttachment({
      collectionId: "collection-1",
      fileId: "file-1",
      fileName: "brief.md",
    });

    expect(parseKnowledgeFileAttachmentData(file)).toEqual({
      collectionId: "collection-1",
      fileId: "file-1",
    });
    expect(getKnowledgeAttachmentSelectionKey(file)).toBe(
      "file:collection-1:file-1",
    );
    expect(
      parseKnowledgeFileAttachmentData({
        ...file,
        data: "{bad json",
      }),
    ).toBeNull();
  });
});
