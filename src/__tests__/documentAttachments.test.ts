import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RAGConfig } from "../types";

const mocks = vi.hoisted(() => ({
  parseDocumentFile: vi.fn(),
  resolveDocumentParseToken: vi.fn(),
}));

vi.mock("../services/api/docParseService", () => ({
  parseDocumentFile: mocks.parseDocumentFile,
}));

vi.mock("../lib/security/localSecretResolvers", () => ({
  resolveDocumentParseToken: mocks.resolveDocumentParseToken,
}));

const baseRag: RAGConfig = {
  enabled: false,
  url: "",
  token: "",
  topK: 10,
  chunkSize: 512,
  documentParseProvider: "mineru",
  mineruApiToken: "",
  llamaParseApiKey: "",
};

describe("chat document attachments", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.parseDocumentFile.mockReset();
    mocks.resolveDocumentParseToken.mockReset();
  });

  it("stores text files as readable text attachments without document parsing", async () => {
    const { createChatDocumentAttachment, decodeAttachmentText } =
      await import("../lib/utils/documentAttachments");
    const file = new File(["hello\nworld"], "notes.md", {
      type: "text/markdown",
    });

    const result = await createChatDocumentAttachment(file, {
      id: "att_text",
      rag: baseRag,
    });

    expect(result.parsed).toBe(false);
    expect(result.attachment).toMatchObject({
      id: "att_text",
      fileName: "notes.md",
      mimeType: "text/markdown",
    });
    expect(decodeAttachmentText(result.attachment)).toBe("hello\nworld");
    expect(mocks.parseDocumentFile).not.toHaveBeenCalled();
    expect(mocks.resolveDocumentParseToken).not.toHaveBeenCalled();
  });

  it("parses non-text documents and stores parsed markdown as a text attachment", async () => {
    mocks.resolveDocumentParseToken.mockResolvedValue("llama-token");
    mocks.parseDocumentFile.mockResolvedValue("# Parsed PDF\n\nBody");
    const { createChatDocumentAttachment, decodeAttachmentText } =
      await import("../lib/utils/documentAttachments");
    const file = new File(["pdf"], "brief.pdf", {
      type: "application/pdf",
    });

    const result = await createChatDocumentAttachment(file, {
      id: "att_pdf",
      rag: { ...baseRag, documentParseProvider: "llamaParse" },
    });

    expect(result.parsed).toBe(true);
    expect(result.attachment).toMatchObject({
      id: "att_pdf",
      fileName: "brief.pdf",
      mimeType: "text/markdown",
    });
    expect(decodeAttachmentText(result.attachment)).toBe(
      "# Parsed PDF\n\nBody",
    );
    expect(mocks.resolveDocumentParseToken).toHaveBeenCalledWith(
      "llamaParse",
      expect.objectContaining({ documentParseProvider: "llamaParse" }),
    );
    expect(mocks.parseDocumentFile).toHaveBeenCalledWith(file, {
      provider: "llamaParse",
      apiKey: "llama-token",
      useDefault: false,
    });
  });

  it("can keep the original document in OPFS while using parsed text", async () => {
    mocks.parseDocumentFile.mockResolvedValue("# Parsed PDF");
    const saveOriginalFile = vi.fn(async () => "opfs://chat/documents/doc.pdf");
    const { createChatDocumentAttachment, decodeAttachmentText } =
      await import("../lib/utils/documentAttachments");
    const file = new File(["pdf"], "doc.pdf", {
      type: "application/pdf",
    });

    const result = await createChatDocumentAttachment(file, {
      id: "att_pdf",
      rag: {
        ...baseRag,
        useDefaultDocumentProcessing: true,
        serverDocumentProcessingAvailable: true,
      },
      saveOriginalFile,
    });

    expect(saveOriginalFile).toHaveBeenCalledWith(file, "chat/documents");
    expect(result.attachment).toMatchObject({
      data: expect.any(String),
      url: "opfs://chat/documents/doc.pdf",
    });
    expect(decodeAttachmentText(result.attachment)).toBe("# Parsed PDF");
  });

  it("uses default document processing without resolving local parser secrets", async () => {
    mocks.parseDocumentFile.mockResolvedValue("default parsed");
    const { createChatDocumentAttachment } =
      await import("../lib/utils/documentAttachments");
    const file = new File(["pdf"], "default.pdf", {
      type: "application/pdf",
    });

    await createChatDocumentAttachment(file, {
      id: "att_default",
      rag: {
        ...baseRag,
        useDefaultDocumentProcessing: true,
        serverDocumentProcessingAvailable: true,
      },
    });

    expect(mocks.resolveDocumentParseToken).not.toHaveBeenCalled();
    expect(mocks.parseDocumentFile).toHaveBeenCalledWith(file, {
      provider: "mineru",
      apiKey: undefined,
      useDefault: true,
    });
  });
});
