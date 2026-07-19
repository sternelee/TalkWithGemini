import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Collection } from "../types";

const {
  deleteFromOPFSMock,
  deleteFromRAGMock,
  getSettingsStateMock,
  getSafeOPFSPathMock,
  listOPFSDirectoryMock,
  parseDocumentFileMock,
  resolveOPFSBlobMock,
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
  parseDocumentFileMock: vi.fn(
    (
      file: File,
      options: {
        provider: string;
        apiKey?: string;
        useDefault?: boolean;
        signal?: AbortSignal;
      },
    ) => {
      void file;
      void options;
      return Promise.resolve("parsed text");
    },
  ),
  resolveOPFSBlobMock: vi.fn(() => Promise.resolve(new Blob(["source"]))),
  saveToOPFSMock: vi.fn(() => Promise.resolve("opfs://saved/file.txt")),
  upsertToRAGMock: vi.fn(() => Promise.resolve(true)),
  withResolvedObjectUrlMock: vi.fn(() => Promise.resolve("reindexed text")),
  writeToOPFSMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/utils/opfs", () => ({
  deleteFromOPFS: deleteFromOPFSMock,
  getSafeOPFSPath: getSafeOPFSPathMock,
  listOPFSDirectory: listOPFSDirectoryMock,
  resolveOPFSBlob: resolveOPFSBlobMock,
  resolveOPFSUrl: vi.fn(() => Promise.resolve("blob:opfs-file")),
  saveToOPFS: saveToOPFSMock,
  writeToOPFS: writeToOPFSMock,
}));

vi.mock("@/services/api/ragService", () => ({
  deleteFromRAG: deleteFromRAGMock,
  upsertToRAG: upsertToRAGMock,
}));

vi.mock("@/services/api/docParseService", () => ({
  parseDocumentFile: parseDocumentFileMock,
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
            name: "notes.pdf",
            size: 12,
            type: "application/pdf",
            uploadedAt: 1,
            status: "indexed",
            sourcePath: "opfs://knowledge-base/collection-1/source/notes.pdf",
            contentPath: "opfs://knowledge-base/collection-1/content/notes.txt",
            path: "opfs://knowledge-base/collection-1/content/notes.txt",
            contentKind: "extracted_text",
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
      "opfs://knowledge-base/collection-1/source/notes.pdf",
    );
    expect(deleteFromOPFSMock).toHaveBeenCalledWith(
      "opfs://knowledge-base/collection-1/content/notes.txt",
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

    expect(writeToOPFSMock).toHaveBeenCalledWith(path, "updated text");
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
    expect(writeToOPFSMock).not.toHaveBeenCalled();
    expect(useKnowledgeStore.getState().collections[0]?.files[0]).toMatchObject(
      {
        status: "indexed",
        ragId: "file-1",
        ragChunkCount: 1,
        error: undefined,
      },
    );
  });

  it("serializes an edit behind an in-flight re-index for the same file", async () => {
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
            status: "indexed",
            path,
            ragId: "file-1",
            ragChunkCount: 1,
          },
        ]),
      ],
    });

    let resolveFirstUpsert!: (success: boolean) => void;
    const firstUpsert = new Promise<boolean>((resolve) => {
      resolveFirstUpsert = resolve;
    });
    withResolvedObjectUrlMock
      .mockResolvedValueOnce("old indexed text")
      .mockResolvedValueOnce("new edited text");
    upsertToRAGMock
      .mockImplementationOnce(() => firstUpsert)
      .mockResolvedValueOnce(true);

    const oldReindex = useKnowledgeStore
      .getState()
      .reindexFile("collection-1", "file-1");
    await vi.waitFor(() => expect(upsertToRAGMock).toHaveBeenCalledTimes(1));

    const edit = useKnowledgeStore
      .getState()
      .updateFileContent("collection-1", "file-1", "new edited text");
    await Promise.resolve();

    expect(writeToOPFSMock).not.toHaveBeenCalled();
    expect(upsertToRAGMock).toHaveBeenCalledTimes(1);

    resolveFirstUpsert(true);
    await Promise.all([oldReindex, edit]);

    expect(writeToOPFSMock).toHaveBeenCalledWith(path, "new edited text");
    expect(upsertToRAGMock).toHaveBeenNthCalledWith(
      1,
      [{ id: "file-1_0", data: "old indexed text", metadata: {} }],
      "collection-1",
    );
    expect(upsertToRAGMock).toHaveBeenNthCalledWith(
      2,
      [{ id: "file-1_0", data: "new edited text", metadata: {} }],
      "collection-1",
    );
    expect(useKnowledgeStore.getState().collections[0]?.files[0]).toMatchObject(
      {
        indexStatus: "indexed",
        ragId: "file-1",
        ragChunkCount: 1,
      },
    );
  });

  it("allows re-indexing different files in parallel", async () => {
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
      collections: [
        makeCollection([
          {
            id: "file-1",
            name: "one.txt",
            size: 3,
            type: "text/plain",
            uploadedAt: 1,
            status: "saved",
            path: "opfs://knowledge-base/collection-1/one.txt",
          },
          {
            id: "file-2",
            name: "two.txt",
            size: 3,
            type: "text/plain",
            uploadedAt: 1,
            status: "saved",
            path: "opfs://knowledge-base/collection-1/two.txt",
          },
        ]),
      ],
    });

    const upsertResolvers: Array<(success: boolean) => void> = [];
    const deferredUpsert = () =>
      new Promise<boolean>((resolve) => {
        upsertResolvers.push(resolve);
      });
    upsertToRAGMock
      .mockImplementationOnce(deferredUpsert)
      .mockImplementationOnce(deferredUpsert);

    const first = useKnowledgeStore
      .getState()
      .reindexFile("collection-1", "file-1");
    const second = useKnowledgeStore
      .getState()
      .reindexFile("collection-1", "file-2");

    await vi.waitFor(() => expect(upsertToRAGMock).toHaveBeenCalledTimes(2));
    for (const resolve of upsertResolvers) resolve(true);
    await Promise.all([first, second]);

    expect(
      useKnowledgeStore
        .getState()
        .collections[0]?.files.every((file) => file.indexStatus === "indexed"),
    ).toBe(true);
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
      "knowledge-base/collection-1/source",
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
        sourcePath: "opfs://saved/file.txt",
        contentPath: "opfs://saved/file.txt",
        ragChunkCount: 1,
      },
    );
  });

  it("preserves a binary source separately from its extracted text", async () => {
    const sourcePath = "opfs://knowledge-base/collection-1/source/file.pdf";
    const contentPath =
      "opfs://knowledge-base/collection-1/content/file.extracted.txt";
    saveToOPFSMock
      .mockResolvedValueOnce(sourcePath)
      .mockResolvedValueOnce(contentPath);
    useKnowledgeStore.setState({ collections: [makeCollection()] });

    const source = new File(["pdf bytes"], "report.pdf", {
      type: "application/pdf",
    });
    await useKnowledgeStore.getState().uploadFiles("collection-1", [source]);

    expect(saveToOPFSMock).toHaveBeenNthCalledWith(
      1,
      source,
      "knowledge-base/collection-1/source",
    );
    expect(saveToOPFSMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: "report.extracted.txt",
        type: "text/plain",
      }),
      "knowledge-base/collection-1/content",
    );
    expect(parseDocumentFileMock).toHaveBeenCalledWith(
      source,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(useKnowledgeStore.getState().collections[0]?.files[0]).toMatchObject(
      {
        sourcePath,
        contentPath,
        path: contentPath,
        contentKind: "extracted_text",
        storageStatus: "saved",
        indexStatus: "not_indexed",
        status: "saved",
      },
    );
  });

  it("keeps local source and content when RAG indexing fails", async () => {
    getSettingsStateMock.mockReturnValue({
      rag: {
        enabled: true,
        token: "token",
        url: "https://rag.example",
        llamaParseApiKey: "",
        chunkSize: 512,
      },
    });
    const sourcePath = "opfs://knowledge-base/collection-1/source/report.pdf";
    const contentPath = "opfs://knowledge-base/collection-1/content/report.txt";
    saveToOPFSMock
      .mockResolvedValueOnce(sourcePath)
      .mockResolvedValueOnce(contentPath);
    upsertToRAGMock.mockResolvedValueOnce(false);
    useKnowledgeStore.setState({ collections: [makeCollection()] });

    await useKnowledgeStore
      .getState()
      .uploadFiles("collection-1", [
        new File(["pdf"], "report.pdf", { type: "application/pdf" }),
      ]);

    expect(useKnowledgeStore.getState().collections[0]?.files[0]).toMatchObject(
      {
        sourcePath,
        contentPath,
        storageStatus: "saved",
        indexStatus: "error",
        status: "error",
        indexError: "Failed to upload to Vector DB.",
      },
    );
    expect(deleteFromOPFSMock).not.toHaveBeenCalledWith(sourcePath);
    expect(deleteFromOPFSMock).not.toHaveBeenCalledWith(contentPath);
  });

  it("aborts document parsing before removing an in-flight upload", async () => {
    parseDocumentFileMock.mockImplementationOnce(
      (
        _file: File,
        options: {
          provider: string;
          apiKey?: string;
          useDefault?: boolean;
          signal?: AbortSignal;
        },
      ) =>
        new Promise<string>((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => {
              const error = new Error("cancelled");
              error.name = "AbortError";
              reject(error);
            },
            { once: true },
          );
        }),
    );
    useKnowledgeStore.setState({ collections: [makeCollection()] });

    const uploadPromise = useKnowledgeStore
      .getState()
      .uploadFiles("collection-1", [
        new File(["pdf"], "report.pdf", { type: "application/pdf" }),
      ]);
    await vi.waitFor(() => expect(parseDocumentFileMock).toHaveBeenCalled());
    const fileId = useKnowledgeStore.getState().collections[0]?.files[0]?.id;
    expect(fileId).toBeTruthy();

    await useKnowledgeStore
      .getState()
      .cancelUpload("collection-1", fileId as string);
    await uploadPromise;

    const parseOptions = parseDocumentFileMock.mock.calls[0]?.[1];
    expect(parseOptions.signal?.aborted).toBe(true);
    expect(useKnowledgeStore.getState().collections[0]?.files).toEqual([]);
  });

  it("reparses from the preserved source without replacing it", async () => {
    const sourcePath = "opfs://knowledge-base/collection-1/source/report.pdf";
    const oldContentPath =
      "opfs://knowledge-base/collection-1/content/report-old.txt";
    const newContentPath =
      "opfs://knowledge-base/collection-1/content/report-new.txt";
    saveToOPFSMock.mockResolvedValueOnce(newContentPath);
    parseDocumentFileMock.mockResolvedValueOnce("updated extracted text");
    useKnowledgeStore.setState({
      collections: [
        makeCollection([
          {
            id: "file-1",
            name: "report.pdf",
            size: 10,
            type: "application/pdf",
            uploadedAt: 1,
            status: "saved",
            sourcePath,
            contentPath: oldContentPath,
            path: oldContentPath,
            contentKind: "extracted_text",
            storageStatus: "saved",
            indexStatus: "not_indexed",
            contentEditedAt: 2,
          },
        ]),
      ],
    });

    await useKnowledgeStore.getState().reparseFile("collection-1", "file-1");

    expect(resolveOPFSBlobMock).toHaveBeenCalledWith(sourcePath);
    expect(parseDocumentFileMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "report.pdf", type: "application/pdf" }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(deleteFromOPFSMock).toHaveBeenCalledWith(oldContentPath);
    expect(deleteFromOPFSMock).not.toHaveBeenCalledWith(sourcePath);
    expect(useKnowledgeStore.getState().collections[0]?.files[0]).toMatchObject(
      {
        sourcePath,
        contentPath: newContentPath,
        path: newContentPath,
        contentKind: "extracted_text",
        storageStatus: "saved",
        indexStatus: "not_indexed",
        contentEditedAt: undefined,
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
