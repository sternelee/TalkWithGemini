import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Collection } from "../types";

const {
  deleteFromOPFSMock,
  deleteFromRAGMock,
  getSettingsStateMock,
  getSafeOPFSPathMock,
  listOPFSDirectoryMock,
  saveToOPFSMock,
  upsertToRAGMock,
  withResolvedObjectUrlMock,
  writeToOPFSMock,
} = vi.hoisted(() => ({
  deleteFromOPFSMock: vi.fn(() => Promise.resolve()),
  deleteFromRAGMock: vi.fn(() => Promise.resolve(true)),
  getSettingsStateMock: vi.fn(),
  getSafeOPFSPathMock: vi.fn((url: string) =>
    url.startsWith("opfs://") ? url.slice("opfs://".length) : null,
  ),
  listOPFSDirectoryMock: vi.fn((): Promise<string[]> => Promise.resolve([])),
  saveToOPFSMock: vi.fn(() => Promise.resolve("opfs://saved/file.txt")),
  upsertToRAGMock: vi.fn(() => Promise.resolve(true)),
  withResolvedObjectUrlMock: vi.fn(() => Promise.resolve("reindexed text")),
  writeToOPFSMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/utils/opfs", () => ({
  deleteFromOPFS: deleteFromOPFSMock,
  getSafeOPFSPath: getSafeOPFSPathMock,
  listOPFSDirectory: listOPFSDirectoryMock,
  resolveOPFSUrl: vi.fn(() => Promise.resolve("blob:opfs-file")),
  saveToOPFS: saveToOPFSMock,
  writeToOPFS: writeToOPFSMock,
}));

vi.mock("@/services/api/ragService", () => ({
  deleteFromRAG: deleteFromRAGMock,
  upsertToRAG: upsertToRAGMock,
}));

vi.mock("@/services/api/docParseService", () => ({
  parseDocumentFile: vi.fn(() => Promise.resolve("parsed text")),
  parseDocumentWithLlama: vi.fn(() => Promise.resolve("parsed text")),
}));

vi.mock("@/lib/utils/knowledgeFiles", () => ({
  selectKnowledgeFilesForUpload: vi.fn((_: number, files: File[]) => ({
    accepted: files,
    rejectedByCount: [],
    rejectedByEmpty: [],
    rejectedBySize: [],
  })),
}));

vi.mock("@/lib/utils/knowledgeVectors", () => ({
  buildKnowledgeVectorIds: vi.fn((ragId: string, chunkCount: number) =>
    Array.from({ length: chunkCount }, (_, index) => `${ragId}_${index}`),
  ),
  buildKnowledgeVectorItems: vi.fn(
    ({
      ragFileId,
      textContent,
    }: {
      ragFileId: string;
      textContent: string;
    }) => [{ id: `${ragFileId}_0`, data: textContent, metadata: {} }],
  ),
}));

vi.mock("@/lib/utils/objectUrlLifecycle", () => ({
  withResolvedObjectUrl: withResolvedObjectUrlMock,
}));

vi.mock("@/lib/knowledge/entities", () => ({
  normalizeKnowledgeCollection: vi.fn((collection) => collection),
  normalizeKnowledgeCollections: vi.fn((collections) => collections),
  normalizeKnowledgeFile: vi.fn((file) => file),
}));

vi.mock("@/config/limits", () => ({
  KNOWLEDGE_LIMITS: {
    maxCollections: 100,
  },
}));

vi.mock("../store/core/settingsStore", () => ({
  useSettingsStore: {
    getState: getSettingsStateMock,
  },
}));

vi.mock("../store/storage/storageConfig", () => ({
  getAppDbStorage: () => ({
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  }),
  STORAGE_KEYS: {
    KNOWLEDGE: "knowledge-storage",
  },
  STORAGE_VERSION: 2,
}));

const { useKnowledgeStore } = await import("../store/core/knowledgeStore");

const makeCollection = (files: Collection["files"] = []): Collection => ({
  id: "collection-1",
  name: "Knowledge",
  description: "",
  icon: "Folder",
  color: "blue",
  files,
  updatedAt: 1,
});

describe("knowledge store resource cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSettingsStateMock.mockReturnValue({
      rag: {
        enabled: false,
        token: "",
        url: "",
        llamaParseApiKey: "",
        chunkSize: 512,
      },
    });
    useKnowledgeStore.setState({
      _hasHydrated: true,
      collections: [],
    });
  });

  it("cleans OPFS files and RAG vectors when deleting a collection", async () => {
    useKnowledgeStore.setState({
      collections: [
        makeCollection([
          {
            id: "file-1",
            name: "notes.txt",
            size: 12,
            type: "text/plain",
            uploadedAt: 1,
            status: "indexed",
            path: "opfs://knowledge-base/collection-1/notes.txt",
            ragId: "file-1",
            ragChunkCount: 3,
          },
          {
            id: "file-2",
            name: "local.txt",
            size: 12,
            type: "text/plain",
            uploadedAt: 1,
            status: "saved",
            path: "opfs://knowledge-base/collection-1/local.txt",
          },
        ]),
      ],
    });

    await useKnowledgeStore.getState().deleteCollection("collection-1");

    expect(useKnowledgeStore.getState().collections).toEqual([]);
    expect(deleteFromOPFSMock).toHaveBeenCalledWith(
      "opfs://knowledge-base/collection-1/notes.txt",
    );
    expect(deleteFromOPFSMock).toHaveBeenCalledWith(
      "opfs://knowledge-base/collection-1/local.txt",
    );
    expect(deleteFromRAGMock).toHaveBeenCalledWith(
      ["file-1_0", "file-1_1", "file-1_2"],
      "collection-1",
    );
  });

  it("keeps collection metadata when strict collection cleanup fails", async () => {
    const collection = makeCollection([
      {
        id: "file-1",
        name: "notes.txt",
        size: 12,
        type: "text/plain",
        uploadedAt: 1,
        status: "saved",
        path: "opfs://knowledge-base/collection-1/notes.txt",
      },
    ]);
    useKnowledgeStore.setState({ collections: [collection] });
    deleteFromOPFSMock.mockRejectedValueOnce(new Error("opfs failed"));

    await expect(
      useKnowledgeStore.getState().deleteCollection("collection-1"),
    ).rejects.toThrow("Failed to clean up knowledge collection resources.");

    expect(useKnowledgeStore.getState().collections).toEqual([collection]);
  });

  it("keeps file metadata when strict file cleanup fails", async () => {
    const file = {
      id: "file-1",
      name: "notes.txt",
      size: 12,
      type: "text/plain",
      uploadedAt: 1,
      status: "saved" as const,
      path: "opfs://knowledge-base/collection-1/notes.txt",
    };
    const collection = makeCollection([file]);
    useKnowledgeStore.setState({ collections: [collection] });
    deleteFromOPFSMock.mockRejectedValueOnce(new Error("opfs failed"));

    await expect(
      useKnowledgeStore.getState().deleteFile("collection-1", "file-1"),
    ).rejects.toThrow("Failed to clean up knowledge file resources.");

    expect(useKnowledgeStore.getState().collections[0]?.files).toEqual([file]);
  });

  it("cleans a newly saved OPFS file when upload completion is stale", async () => {
    const stalePath = "opfs://knowledge-base/collection-1/stale.txt";
    useKnowledgeStore.setState({
      collections: [makeCollection()],
    });
    saveToOPFSMock.mockImplementationOnce(async () => {
      await useKnowledgeStore.getState().deleteCollection("collection-1");
      return stalePath;
    });

    await useKnowledgeStore
      .getState()
      .uploadFiles("collection-1", [
        new File(["hello"], "stale.txt", { type: "text/plain" }),
      ]);

    expect(useKnowledgeStore.getState().collections).toEqual([]);
    expect(deleteFromOPFSMock).toHaveBeenCalledWith(stalePath);
  });

  it("cleans edit resources when a RAG file disappears after re-indexing", async () => {
    getSettingsStateMock.mockReturnValue({
      rag: {
        enabled: true,
        token: "token",
        url: "https://rag.example",
        llamaParseApiKey: "",
        chunkSize: 512,
      },
    });
    const path = "opfs://knowledge-base/collection-1/notes.txt";
    useKnowledgeStore.setState({
      collections: [
        makeCollection([
          {
            id: "file-1",
            name: "notes.txt",
            size: 12,
            type: "text/plain",
            uploadedAt: 1,
            status: "indexed",
            path,
            ragId: "file-1",
            ragChunkCount: 3,
          },
        ]),
      ],
    });
    upsertToRAGMock.mockImplementationOnce(async () => {
      useKnowledgeStore.setState({ collections: [] });
      return true;
    });

    await useKnowledgeStore
      .getState()
      .updateFileContent("collection-1", "file-1", "updated text");

    expect(writeToOPFSMock).not.toHaveBeenCalled();
    expect(deleteFromOPFSMock).toHaveBeenCalledWith(path);
    expect(deleteFromRAGMock).toHaveBeenCalledWith(
      ["file-1_0"],
      "collection-1",
    );
  });

  it("rebuilds a RAG index from the local OPFS copy", async () => {
    getSettingsStateMock.mockReturnValue({
      rag: {
        enabled: true,
        token: "token",
        url: "https://rag.example",
        llamaParseApiKey: "",
        chunkSize: 512,
      },
    });
    const path = "opfs://knowledge-base/collection-1/local.txt";
    useKnowledgeStore.setState({
      collections: [
        makeCollection([
          {
            id: "file-1",
            name: "local.txt",
            size: 12,
            type: "text/plain",
            uploadedAt: 1,
            status: "saved",
            path,
          },
        ]),
      ],
    });
    withResolvedObjectUrlMock.mockResolvedValueOnce("fresh local text");

    await useKnowledgeStore.getState().reindexFile("collection-1", "file-1");

    expect(upsertToRAGMock).toHaveBeenCalledWith(
      [{ id: "file-1_0", data: "fresh local text", metadata: {} }],
      "collection-1",
    );
    expect(writeToOPFSMock).toHaveBeenCalledWith(path, "fresh local text");
    expect(useKnowledgeStore.getState().collections[0]?.files[0]).toMatchObject(
      {
        status: "indexed",
        ragId: "file-1",
        ragChunkCount: 1,
        error: undefined,
      },
    );
  });

  it("does not rebuild a RAG index while RAG is not configured", async () => {
    useKnowledgeStore.setState({
      collections: [
        makeCollection([
          {
            id: "file-1",
            name: "local.txt",
            size: 12,
            type: "text/plain",
            uploadedAt: 1,
            status: "saved",
            path: "opfs://knowledge-base/collection-1/local.txt",
          },
        ]),
      ],
    });

    await expect(
      useKnowledgeStore.getState().reindexFile("collection-1", "file-1"),
    ).rejects.toThrow("Enable and configure RAG");

    expect(upsertToRAGMock).not.toHaveBeenCalled();
  });

  it("adds generated text as a knowledge file and indexes it when RAG is enabled", async () => {
    getSettingsStateMock.mockReturnValue({
      rag: {
        enabled: true,
        token: "token",
        url: "https://rag.example",
        llamaParseApiKey: "",
        chunkSize: 512,
      },
    });
    useKnowledgeStore.setState({
      collections: [makeCollection()],
    });

    await useKnowledgeStore
      .getState()
      .addTextFileToCollection("collection-1", "Answer.md", "# Answer");

    expect(saveToOPFSMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Answer.md",
        type: "text/markdown",
      }),
      "knowledge-base/collection-1",
    );
    expect(upsertToRAGMock).toHaveBeenCalledWith(
      [expect.objectContaining({ data: "# Answer" })],
      "collection-1",
    );
    expect(useKnowledgeStore.getState().collections[0]?.files[0]).toMatchObject(
      {
        name: "Answer.md",
        status: "indexed",
        path: "opfs://saved/file.txt",
        ragChunkCount: 1,
      },
    );
  });

  it("cancels an in-flight upload and cleans local/vector resources", async () => {
    useKnowledgeStore.setState({
      collections: [
        makeCollection([
          {
            id: "file-1",
            name: "notes.txt",
            size: 12,
            type: "text/plain",
            uploadedAt: 1,
            status: "indexing",
            path: "opfs://knowledge-base/collection-1/notes.txt",
            ragId: "file-1",
            ragChunkCount: 2,
          },
        ]),
      ],
    });

    await useKnowledgeStore.getState().cancelUpload("collection-1", "file-1");

    expect(useKnowledgeStore.getState().collections[0]?.files).toEqual([]);
    expect(deleteFromOPFSMock).toHaveBeenCalledWith(
      "opfs://knowledge-base/collection-1/notes.txt",
    );
    expect(deleteFromRAGMock).toHaveBeenCalledWith(
      ["file-1_0", "file-1_1"],
      "collection-1",
    );
  });

  it("reconciles missing files and OPFS orphans for a collection", async () => {
    listOPFSDirectoryMock.mockResolvedValueOnce([
      "knowledge-base/collection-1/kept.txt",
      "knowledge-base/collection-1/orphan.txt",
    ]);
    useKnowledgeStore.setState({
      collections: [
        makeCollection([
          {
            id: "file-1",
            name: "kept.txt",
            size: 12,
            type: "text/plain",
            uploadedAt: 1,
            status: "saved",
            path: "opfs://knowledge-base/collection-1/kept.txt",
          },
          {
            id: "file-2",
            name: "missing.txt",
            size: 12,
            type: "text/plain",
            uploadedAt: 1,
            status: "indexed",
            path: "opfs://knowledge-base/collection-1/missing.txt",
          },
        ]),
      ],
    });

    const plan = await useKnowledgeStore
      .getState()
      .reconcileCollection("collection-1");

    expect(plan).toEqual({
      missingUrls: ["opfs://knowledge-base/collection-1/missing.txt"],
      orphanUrls: ["opfs://knowledge-base/collection-1/orphan.txt"],
    });
    expect(listOPFSDirectoryMock).toHaveBeenCalledWith(
      "knowledge-base/collection-1",
    );
    expect(deleteFromOPFSMock).toHaveBeenCalledWith(
      "opfs://knowledge-base/collection-1/orphan.txt",
    );
    expect(useKnowledgeStore.getState().collections[0]?.files).toMatchObject([
      expect.objectContaining({
        id: "file-1",
        status: "saved",
      }),
      expect.objectContaining({
        id: "file-2",
        status: "error",
        error:
          "Local file content is missing. Retry upload or remove this file.",
      }),
    ]);
  });
});
