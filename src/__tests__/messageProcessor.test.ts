import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_INPUT_LIMITS } from "../config/limits";
import { CHAT_INPUT_TRUNCATION_NOTICE } from "../lib/utils/chatInput";

const mocks = vi.hoisted(() => ({
  resolveOPFSUrl: vi.fn(),
}));

vi.mock("../utils/opfs", () => ({
  resolveOPFSUrl: mocks.resolveOPFSUrl,
}));

vi.mock("../services/api/chatService", () => ({
  generateRAGSearchQueries: vi.fn(),
}));

vi.mock("../services/api/ragService", () => ({
  queryRAG: vi.fn(() => Promise.resolve([])),
}));

import { processMessageForSending } from "../lib/chat/messageProcessor";
import {
  createKnowledgeCollectionAttachment,
  createKnowledgeFileAttachment,
} from "../lib/utils/knowledgeAttachments";

const encodeText = (value: string) => btoa(unescape(encodeURIComponent(value)));

describe("message preprocessing", () => {
  beforeEach(() => {
    mocks.resolveOPFSUrl.mockResolvedValue("blob:http://localhost/kb-file");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("knowledge file text", { status: 200 }),
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  it("keeps final model text within the chat request limit after context injection", async () => {
    const result = await processMessageForSending({
      text: "u".repeat(API_INPUT_LIMITS.maxChatTextChars - 200),
      attachments: [
        {
          id: "att_1",
          mimeType: "text/plain",
          fileName: "large.txt",
          data: encodeText("c".repeat(10_000)),
        },
      ],
      selectedModel: "provider:model",
      modelMetadata: {
        model: { attachment: false },
      },
      customModelMetadata: {},
      ragConfig: { enabled: false },
      knowledgeCollections: [],
    });

    expect(result.finalText.length).toBeLessThanOrEqual(
      API_INPUT_LIMITS.maxChatTextChars,
    );
    expect(result.finalText.endsWith(CHAT_INPUT_TRUNCATION_NOTICE)).toBe(true);
    expect(result.userMessage.content).toHaveLength(
      API_INPUT_LIMITS.maxChatTextChars - 200,
    );
  });

  it("converts text attachments into prompt context even when the model supports attachments", async () => {
    const result = await processMessageForSending({
      text: "Read this",
      attachments: [
        {
          id: "att_text",
          mimeType: "text/markdown",
          fileName: "brief.md",
          data: encodeText("Project notes"),
        },
      ],
      selectedModel: "provider:model",
      modelMetadata: {
        model: { attachment: true },
      },
      customModelMetadata: {},
      ragConfig: { enabled: false },
      knowledgeCollections: [],
    });

    expect(result.finalAttachments).toEqual([]);
    expect(result.finalText).toContain('name="brief.md"');
    expect(result.finalText).toContain("Project notes");
    expect(result.userMessage.attachments).toHaveLength(1);
  });

  it("keeps workspace knowledge out of the persisted user attachments while using it for context", async () => {
    const result = await processMessageForSending({
      text: "What changed?",
      attachments: [],
      selectedModel: "provider:model",
      modelMetadata: {
        model: { attachment: false },
      },
      customModelMetadata: {},
      ragConfig: { enabled: false },
      knowledgeCollections: [
        {
          id: "collection_1",
          name: "Workspace KB",
          files: [
            {
              id: "file_1",
              name: "notes.md",
              type: "text/plain",
              uploadedAt: 1,
              path: "opfs://kb/notes",
            },
          ],
        },
      ],
      workspaceKnowledgeCollectionIds: ["collection_1"],
    });

    expect(result.userMessage.attachments).toEqual([]);
    expect(result.finalText).toContain("Workspace KB");
  });

  it("deduplicates manual and workspace knowledge sources", async () => {
    const manual = createKnowledgeCollectionAttachment({
      collectionId: "collection_1",
      collectionName: "Manual KB",
    });

    const result = await processMessageForSending({
      text: "Use the docs",
      attachments: [manual],
      selectedModel: "provider:model",
      modelMetadata: {
        model: { attachment: false },
      },
      customModelMetadata: {},
      ragConfig: { enabled: false },
      knowledgeCollections: [
        {
          id: "collection_1",
          name: "Manual KB",
          files: [],
        },
      ],
      workspaceKnowledgeCollectionIds: ["collection_1"],
    });

    expect(
      result.userMessage.attachments?.filter(
        (attachment) =>
          attachment.mimeType === "application/vnd.neo-chat.collection",
      ),
    ).toHaveLength(1);
  });

  it("handles selected knowledge files without treating them as normal attachments", async () => {
    const fileAttachment = createKnowledgeFileAttachment({
      collectionId: "collection_1",
      fileId: "file_1",
      fileName: "notes.md",
    });

    const result = await processMessageForSending({
      text: "Summarize notes",
      attachments: [fileAttachment],
      selectedModel: "provider:model",
      modelMetadata: {
        model: { attachment: false },
      },
      customModelMetadata: {},
      ragConfig: { enabled: false },
      knowledgeCollections: [
        {
          id: "collection_1",
          name: "Manual KB",
          files: [
            {
              id: "file_1",
              name: "notes.md",
              type: "text/plain",
              uploadedAt: 1,
              path: "opfs://kb/notes",
            },
          ],
        },
      ],
    });

    expect(result.userMessage.attachments).toEqual([fileAttachment]);
    expect(result.finalAttachments).toEqual([]);
    expect(result.finalText).toContain("notes.md");
  });
});
