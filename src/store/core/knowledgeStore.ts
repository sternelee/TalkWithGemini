import { create, type StoreApi } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { v7 as uuidv7 } from "uuid";
import {
  Collection,
  KnowledgeFile,
  KnowledgeFileIndexStatus,
  KnowledgeFileStorageStatus,
  KnowledgeFileStatus,
  RAGConfig,
} from "@/types";
import { useSettingsStore } from "./settingsStore";
import { parseDocumentFile } from "@/services/api/docParseService";
import { deleteFromRAG, upsertToRAG } from "@/services/api/ragService";
import { selectKnowledgeFilesForUpload } from "@/lib/utils/knowledgeFiles";
import {
  buildKnowledgeVectorIds,
  buildKnowledgeVectorItems,
} from "@/lib/utils/knowledgeVectors";
import {
  normalizeKnowledgeCollection,
  normalizeKnowledgeCollections,
  normalizeKnowledgeFile,
} from "@/lib/knowledge/entities";
import { KNOWLEDGE_LIMITS } from "@/config/limits";
import {
  deleteFromOPFS,
  listOPFSDirectory,
  resolveOPFSBlob,
  resolveOPFSUrl,
  saveToOPFS,
  writeToOPFS,
} from "@/utils/opfs";
import {
  getOPFSReconciliationPlan,
  type OPFSReconciliationPlan,
} from "@/utils/opfsReconcile";
import {
  getAppDbStorage,
  STORAGE_KEYS,
  STORAGE_VERSION,
} from "../storage/storageConfig";
import { withResolvedObjectUrl } from "@/lib/utils/objectUrlLifecycle";
import { logDevError, logDevWarn } from "@/lib/utils/devLogger";
import { reportAppRestoreHydration } from "@/lib/data/appRestoreJournal";
import {
  hasRagVectorStore,
  resolveDocumentParseToken,
} from "@/lib/security/localSecretResolvers";

interface KnowledgeState {
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  collections: Collection[];

  // Actions
  createCollection: (
    name: string,
    description: string,
    icon: string,
    color: string,
  ) => void;
  updateCollection: (id: string, updates: Partial<Collection>) => void; // New Action
  deleteCollection: (id: string) => Promise<void>;
  uploadFiles: (collectionId: string, files: File[]) => Promise<void>;
  updateFileContent: (
    collectionId: string,
    fileId: string,
    content: string,
  ) => Promise<void>;
  addTextFileToCollection: (
    collectionId: string,
    title: string,
    content: string,
  ) => Promise<void>;
  cancelUpload: (collectionId: string, fileId: string) => Promise<void>;
  retryFile: (collectionId: string, fileId: string) => Promise<void>;
  reparseFile: (
    collectionId: string,
    fileId: string,
    replacementSource?: File,
  ) => Promise<void>;
  reconcileCollection: (
    collectionId: string,
  ) => Promise<OPFSReconciliationPlan>;
  reindexFile: (collectionId: string, fileId: string) => Promise<void>;
  deleteFile: (collectionId: string, fileId: string) => Promise<void>;
}

const MISSING_OPFS_FILE_ERROR =
  "Local file content is missing. Retry upload or remove this file.";
const MISSING_SOURCE_FILE_ERROR =
  "The original file is missing. Select it again to enable reparsing.";
const knowledgeOperationControllers = new Map<string, AbortController>();
const knowledgeFileOperationQueues = new Map<string, Promise<unknown>>();

function getOperationKey(collectionId: string, fileId: string): string {
  return `${collectionId}:${fileId}`;
}

async function runKnowledgeFileOperation<T>(
  collectionId: string,
  fileId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const operationKey = getOperationKey(collectionId, fileId);
  const previousOperation = knowledgeFileOperationQueues.get(operationKey);
  const currentOperation = (previousOperation || Promise.resolve())
    .catch(() => undefined)
    .then(operation);

  knowledgeFileOperationQueues.set(operationKey, currentOperation);
  try {
    return await currentOperation;
  } finally {
    if (knowledgeFileOperationQueues.get(operationKey) === currentOperation) {
      knowledgeFileOperationQueues.delete(operationKey);
    }
  }
}

function getContentPath(file: KnowledgeFile): string | undefined {
  return file.contentPath || file.path;
}

function getSourcePath(file: KnowledgeFile): string | undefined {
  return (
    file.sourcePath ||
    (file.contentKind === "source_text" ? getContentPath(file) : undefined)
  );
}

function getLegacyStatus(
  storageStatus: KnowledgeFileStorageStatus,
  indexStatus: KnowledgeFileIndexStatus,
): KnowledgeFileStatus {
  if (storageStatus === "uploading" || storageStatus === "parsing") {
    return storageStatus;
  }
  if (storageStatus === "error") return "error";
  if (indexStatus === "indexing") return "indexing";
  if (indexStatus === "indexed") return "indexed";
  if (indexStatus === "error") return "error";
  return "saved";
}

function buildStatusUpdate(
  file: KnowledgeFile,
  updates: Partial<KnowledgeFile> & {
    storageStatus?: KnowledgeFileStorageStatus;
    indexStatus?: KnowledgeFileIndexStatus;
  },
): Partial<KnowledgeFile> {
  const storageStatus =
    updates.storageStatus ||
    file.storageStatus ||
    (file.status === "uploading" || file.status === "parsing"
      ? file.status
      : file.status === "error" && !getContentPath(file)
        ? "error"
        : "saved");
  const indexStatus =
    updates.indexStatus ||
    file.indexStatus ||
    (file.status === "indexing"
      ? "indexing"
      : file.status === "indexed" || file.ragId
        ? "indexed"
        : file.status === "error" && Boolean(getContentPath(file))
          ? "error"
          : "not_indexed");
  const storageError =
    "storageError" in updates ? updates.storageError : file.storageError;
  const indexError =
    "indexError" in updates ? updates.indexError : file.indexError;

  return {
    ...updates,
    storageStatus,
    indexStatus,
    status: getLegacyStatus(storageStatus, indexStatus),
    storageError,
    indexError,
    error: storageError || indexError,
  };
}

function createExtractedTextFile(name: string, content: string): File {
  const baseName = name.replace(/\.[^./\\]+$/, "") || "document";
  return new File([content], `${baseName}.extracted.txt`, {
    type: "text/plain",
  });
}

function isTextMimeType(mimeType: string) {
  if (!mimeType) return false;

  // 1. Anything starting with text/ is text.
  if (mimeType.startsWith("text/")) return true;

  // 2. Specific application/ types are also text.
  const textMimeTypes = [
    "application/json",
    "application/javascript",
    "application/xml",
    "application/xhtml+xml",
    "application/x-yaml",
    "application/sql",
    "application/graphql",
    "application/ld+json",
    "application/x-sh",
    "application/x-httpd-php",
    "application/typescript",
  ];

  // 3. Files ending with +xml or +json are also considered text files.
  if (mimeType.endsWith("+xml") || mimeType.endsWith("+json")) return true;

  return textMimeTypes.includes(mimeType);
}

function isTextKnowledgeSource(file: Pick<File, "name" | "type">): boolean {
  return (
    isTextMimeType(file.type) ||
    /\.(?:txt|md|markdown|csv|tsv|json|jsonl|xml|ya?ml|js|jsx|ts|tsx|css|html?|sql|graphql|sh|php)$/i.test(
      file.name,
    )
  );
}

async function parseKnowledgeDocument(
  file: File,
  rag: RAGConfig,
  signal?: AbortSignal,
) {
  const provider = rag.documentParseProvider || "mineru";
  const useDefaultDocumentProcessing = Boolean(
    rag.useDefaultDocumentProcessing && rag.serverDocumentProcessingAvailable,
  );
  const apiKey = useDefaultDocumentProcessing
    ? undefined
    : await resolveDocumentParseToken(provider, rag);

  if (provider === "llamaParse" && !useDefaultDocumentProcessing && !apiKey) {
    throw new Error(
      "Configure a document parser API key to process non-text files.",
    );
  }

  return parseDocumentFile(file, {
    provider,
    apiKey,
    useDefault: useDefaultDocumentProcessing,
    signal,
  });
}

async function cleanupKnowledgeFileResources(
  file:
    | Pick<
        KnowledgeFile,
        | "path"
        | "sourcePath"
        | "contentPath"
        | "contentKind"
        | "ragId"
        | "ragChunkCount"
      >
    | undefined,
  collectionId: string,
  options: { strict?: boolean } = {},
) {
  if (!file) return;
  const errors: unknown[] = [];

  const opfsUrls = new Set(
    [file.sourcePath, file.contentPath, file.path].filter(
      (url): url is string => Boolean(url),
    ),
  );
  for (const url of opfsUrls) {
    try {
      await deleteFromOPFS(url);
    } catch (error) {
      logDevWarn("Failed to delete OPFS knowledge file:", error);
      errors.push(error);
    }
  }

  if (file.ragId) {
    try {
      const chunkCount = file.ragChunkCount || 1_000;
      const ids = buildKnowledgeVectorIds(file.ragId, chunkCount);
      await deleteFromRAG(ids, collectionId);
    } catch (error) {
      logDevWarn("Failed to delete RAG vectors:", error);
      errors.push(error);
    }
  }

  if (options.strict && errors.length > 0) {
    throw new Error("Failed to clean up knowledge file resources.");
  }
}

async function cleanupKnowledgeFiles(
  files: KnowledgeFile[],
  collectionId: string,
  options: { strict?: boolean } = {},
) {
  const results = await Promise.allSettled(
    files.map((file) =>
      cleanupKnowledgeFileResources(file, collectionId, options),
    ),
  );

  if (
    options.strict &&
    results.some((result) => result.status === "rejected")
  ) {
    throw new Error("Failed to clean up knowledge collection resources.");
  }
}

async function reindexKnowledgeFile(
  set: StoreApi<KnowledgeState>["setState"],
  get: StoreApi<KnowledgeState>["getState"],
  collectionId: string,
  fileId: string,
) {
  const file = get()
    .collections.find((collection) => collection.id === collectionId)
    ?.files.find((item) => item.id === fileId);

  const contentPath = file ? getContentPath(file) : undefined;
  if (!file || !contentPath) {
    throw new Error("No local file content is available to re-index.");
  }

  const { rag } = useSettingsStore.getState();
  if (!rag.enabled || !hasRagVectorStore(rag)) {
    throw new Error("Enable and configure RAG before rebuilding the index.");
  }

  set((state) => ({
    collections: state.collections.map((collection) => {
      if (collection.id !== collectionId) return collection;
      return {
        ...collection,
        files: collection.files.map((item) =>
          item.id === fileId
            ? {
                ...item,
                ...buildStatusUpdate(item, {
                  indexStatus: "indexing",
                  indexError: undefined,
                }),
              }
            : item,
        ),
      };
    }),
  }));

  try {
    const content = await withResolvedObjectUrl({
      source: contentPath,
      resolveObjectUrl: resolveOPFSUrl,
      read: async (objectUrl) => {
        const response = await fetch(objectUrl);
        return response.text();
      },
    });

    if (!content?.trim()) {
      throw new Error("No text content available to index.");
    }

    const ragFileId = file.ragId || file.id;
    const vectorItems = buildKnowledgeVectorItems({
      collectionId,
      fileName: file.name,
      ragFileId,
      textContent: content,
      chunkSize: rag.chunkSize || 512,
    });
    if (vectorItems.length === 0) {
      throw new Error("No text content available to index.");
    }
    const success = await upsertToRAG(vectorItems, collectionId);
    if (!success) throw new Error("Failed to rebuild RAG index.");

    const fileStillExists = get().collections.some(
      (collection) =>
        collection.id === collectionId &&
        collection.files.some((item) => item.id === fileId),
    );
    if (!fileStillExists) {
      await cleanupKnowledgeFileResources(
        {
          sourcePath: getSourcePath(file),
          contentPath,
          path: contentPath,
          ragId: file.ragId || file.id,
          ragChunkCount: vectorItems.length,
        },
        collectionId,
      );
      return;
    }

    const previousChunkCount = file.ragChunkCount || vectorItems.length;
    if (file.ragId && previousChunkCount > vectorItems.length) {
      const staleIds = buildKnowledgeVectorIds(
        file.ragId,
        previousChunkCount,
      ).slice(vectorItems.length);
      const deleted = await deleteFromRAG(staleIds, collectionId);
      if (!deleted) {
        throw new Error("Failed to remove stale RAG vectors.");
      }
    }

    set((state) => ({
      collections: state.collections.map((collection) => {
        if (collection.id !== collectionId) return collection;
        return {
          ...collection,
          files: collection.files.map((item) =>
            item.id === fileId
              ? normalizeKnowledgeFile({
                  ...item,
                  ...buildStatusUpdate(item, {
                    storageStatus: "saved",
                    storageError: undefined,
                    indexStatus: "indexed",
                    indexError: undefined,
                    ragId: ragFileId,
                    ragChunkCount: vectorItems.length,
                  }),
                }) || item
              : item,
          ),
          updatedAt: Date.now(),
        };
      }),
    }));
  } catch (error) {
    set((state) => ({
      collections: state.collections.map((collection) => {
        if (collection.id !== collectionId) return collection;
        return {
          ...collection,
          files: collection.files.map((item) =>
            item.id === fileId
              ? {
                  ...item,
                  ...buildStatusUpdate(item, {
                    indexStatus: "error",
                    indexError:
                      error instanceof Error
                        ? error.message
                        : "Failed to rebuild RAG index.",
                  }),
                }
              : item,
          ),
        };
      }),
    }));
    throw error;
  }
}

export const useKnowledgeStore = create<KnowledgeState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      setHasHydrated: (state) => {
        set({ _hasHydrated: state });
      },
      collections: [],

      createCollection: (name, description, icon, color) => {
        const newCollection = normalizeKnowledgeCollection({
          id: uuidv7(),
          name,
          description,
          icon,
          color,
          files: [],
          updatedAt: Date.now(),
        });
        if (!newCollection) return;

        set((state) => ({
          collections: [newCollection, ...state.collections].slice(
            0,
            KNOWLEDGE_LIMITS.maxCollections,
          ),
        }));
      },

      updateCollection: (id, updates) => {
        set((state) => ({
          collections: state.collections.map((c) => {
            if (c.id !== id) return c;
            return (
              normalizeKnowledgeCollection({
                ...c,
                ...updates,
                id: c.id,
                files: c.files,
                updatedAt: Date.now(),
              }) || c
            );
          }),
        }));
      },

      deleteCollection: async (id) => {
        const collection = get().collections.find((c) => c.id === id);

        if (collection) {
          for (const file of collection.files) {
            knowledgeOperationControllers
              .get(getOperationKey(id, file.id))
              ?.abort();
          }
          await cleanupKnowledgeFiles(collection.files, id, { strict: true });
        }

        set((state) => ({
          collections: state.collections.filter((c) => c.id !== id),
        }));
      },

      uploadFiles: async (collectionId, files) => {
        const { rag } = useSettingsStore.getState();
        const collection = get().collections.find((c) => c.id === collectionId);
        if (!collection) return;

        const selection = selectKnowledgeFilesForUpload(
          collection.files.length,
          files,
        );
        const filesToUpload = selection.accepted;
        if (filesToUpload.length === 0) return;

        const newKnowledgeFiles: KnowledgeFile[] = filesToUpload
          .map((f) =>
            normalizeKnowledgeFile({
              id: uuidv7(),
              name: f.name,
              size: f.size,
              type: f.type || "application/octet-stream",
              uploadedAt: Date.now(),
              status: "uploading",
              storageStatus: "uploading",
              indexStatus: "not_indexed",
            }),
          )
          .filter((file): file is KnowledgeFile => Boolean(file));

        set((state) => ({
          collections: state.collections.map((c) => {
            if (c.id === collectionId) {
              return {
                ...c,
                files: [...newKnowledgeFiles, ...c.files],
                updatedAt: Date.now(),
              };
            }
            return c;
          }),
        }));

        const isFileStillPresent = (fileId: string) =>
          get().collections.some(
            (c) =>
              c.id === collectionId &&
              c.files.some((file) => file.id === fileId),
          );

        const cleanupStaleUploadResources = async (
          file: Partial<KnowledgeFile>,
        ) => {
          await cleanupKnowledgeFileResources(file, collectionId);
        };

        const updateFileState = (
          fileId: string,
          updates: Partial<KnowledgeFile>,
        ) => {
          set((state) => ({
            collections: state.collections.map((c) => {
              if (c.id === collectionId) {
                return {
                  ...c,
                  files: c.files.map((f) => {
                    if (f.id !== fileId) return f;
                    return (
                      normalizeKnowledgeFile({
                        ...f,
                        ...buildStatusUpdate(f, updates),
                      }) || f
                    );
                  }),
                  updatedAt: Date.now(),
                };
              }
              return c;
            }),
          }));
        };

        for (let i = 0; i < filesToUpload.length; i++) {
          const file = filesToUpload[i];
          const kFile = newKnowledgeFiles[i];
          if (!kFile || !isFileStillPresent(kFile.id)) continue;

          const operationKey = getOperationKey(collectionId, kFile.id);
          const controller = new AbortController();
          knowledgeOperationControllers.set(operationKey, controller);
          await runKnowledgeFileOperation(collectionId, kFile.id, async () => {
            let sourcePath: string | undefined;
            let contentPath: string | undefined;
            let textContent = "";

            try {
              sourcePath = await saveToOPFS(
                file,
                `knowledge-base/${collectionId}/source`,
              );
              if (!isFileStillPresent(kFile.id)) {
                await cleanupStaleUploadResources({ sourcePath });
                knowledgeOperationControllers.delete(operationKey);
                return;
              }

              if (isTextKnowledgeSource(file)) {
                textContent = await file.text();
                contentPath = sourcePath;
              } else {
                updateFileState(kFile.id, {
                  sourcePath,
                  sourceMissing: false,
                  storageStatus: "parsing",
                  storageError: undefined,
                });
                textContent = await parseKnowledgeDocument(
                  file,
                  rag,
                  controller.signal,
                );
                if (!textContent.trim()) {
                  throw new Error("No text content extracted.");
                }
                contentPath = await saveToOPFS(
                  createExtractedTextFile(file.name, textContent),
                  `knowledge-base/${collectionId}/content`,
                );
              }

              if (!textContent.trim()) {
                throw new Error("No text content extracted.");
              }
              if (!isFileStillPresent(kFile.id)) {
                await cleanupStaleUploadResources({ sourcePath, contentPath });
                knowledgeOperationControllers.delete(operationKey);
                return;
              }

              updateFileState(kFile.id, {
                sourcePath,
                contentPath,
                path: contentPath,
                contentKind: isTextKnowledgeSource(file)
                  ? "source_text"
                  : "extracted_text",
                contentSize: new Blob([textContent]).size,
                sourceMissing: false,
                storageStatus: "saved",
                storageError: undefined,
                indexStatus: "not_indexed",
                indexError: undefined,
              });
            } catch (error) {
              if (isFileStillPresent(kFile.id)) {
                const message =
                  error instanceof Error ? error.message : "Unknown error";
                updateFileState(kFile.id, {
                  sourcePath,
                  storageStatus: "error",
                  storageError: message,
                });
                if (!(error instanceof Error && error.name === "AbortError")) {
                  logDevError(`File processing failed: ${file.name}`, error);
                }
              } else {
                await cleanupStaleUploadResources({ sourcePath, contentPath });
              }
              knowledgeOperationControllers.delete(operationKey);
              return;
            }

            if (rag.enabled && isFileStillPresent(kFile.id)) {
              try {
                if (!hasRagVectorStore(rag)) {
                  throw new Error("RAG Configuration missing.");
                }
                updateFileState(kFile.id, {
                  indexStatus: "indexing",
                  indexError: undefined,
                });
                const vectorItems = buildKnowledgeVectorItems({
                  collectionId,
                  fileName: file.name,
                  ragFileId: kFile.id,
                  textContent,
                  chunkSize: rag.chunkSize || 512,
                });
                if (vectorItems.length === 0) {
                  throw new Error("No text content available to index.");
                }
                const success = await upsertToRAG(vectorItems, collectionId);
                if (!success) {
                  throw new Error("Failed to upload to Vector DB.");
                }
                if (!isFileStillPresent(kFile.id)) {
                  await cleanupStaleUploadResources({
                    sourcePath,
                    contentPath,
                    ragId: kFile.id,
                    ragChunkCount: vectorItems.length,
                  });
                  knowledgeOperationControllers.delete(operationKey);
                  return;
                }
                updateFileState(kFile.id, {
                  indexStatus: "indexed",
                  indexError: undefined,
                  ragId: kFile.id,
                  ragChunkCount: vectorItems.length,
                });
              } catch (error) {
                if (isFileStillPresent(kFile.id)) {
                  const message =
                    error instanceof Error ? error.message : "Unknown error";
                  updateFileState(kFile.id, {
                    indexStatus: "error",
                    indexError: message,
                  });
                  logDevError(`File indexing failed: ${file.name}`, error);
                }
              }
            }
            knowledgeOperationControllers.delete(operationKey);
          });
        }
      },

      updateFileContent: async (collectionId, fileId, content) => {
        return runKnowledgeFileOperation(collectionId, fileId, async () => {
          const { collections } = get();
          const collection = collections.find((c) => c.id === collectionId);
          if (!collection) return;

          const file = collection.files.find((f) => f.id === fileId);
          const contentPath = file ? getContentPath(file) : undefined;
          if (!file || !contentPath) return;

          const isFileStillPresent = () =>
            get().collections.some(
              (c) =>
                c.id === collectionId && c.files.some((f) => f.id === fileId),
            );

          try {
            const blob = new Blob([content]);
            if (!isFileStillPresent()) return;
            await writeToOPFS(contentPath, content);

            if (!isFileStillPresent()) {
              await deleteFromOPFS(contentPath);
              return;
            }

            set((state) => ({
              collections: state.collections.map((c) => {
                if (c.id === collectionId) {
                  return {
                    ...c,
                    files: c.files.map((f) => {
                      if (f.id !== fileId) return f;
                      return (
                        normalizeKnowledgeFile({
                          ...f,
                          ...buildStatusUpdate(f, {
                            contentPath,
                            path: contentPath,
                            contentSize: blob.size,
                            ...(f.contentKind === "source_text"
                              ? { size: blob.size }
                              : { contentEditedAt: Date.now() }),
                            storageStatus: "saved",
                            storageError: undefined,
                          }),
                        }) || f
                      );
                    }),
                    updatedAt: Date.now(),
                  };
                }
                return c;
              }),
            }));

            const { rag } = useSettingsStore.getState();
            if (file.ragId || rag.enabled) {
              await reindexKnowledgeFile(set, get, collectionId, fileId);
            }
          } catch (e) {
            logDevError("Failed to update file content", e);
            throw e;
          }
        });
      },

      addTextFileToCollection: async (collectionId, title, content) => {
        const collection = get().collections.find((c) => c.id === collectionId);
        if (!collection) return;

        const trimmedTitle = title.trim() || "Untitled.md";
        const fileName = /\.[^./\\]+$/.test(trimmedTitle)
          ? trimmedTitle
          : `${trimmedTitle}.md`;
        const fileId = uuidv7();
        const textFile = new File([content], fileName, {
          type: "text/markdown",
        });
        const newKnowledgeFile = normalizeKnowledgeFile({
          id: fileId,
          name: fileName,
          size: textFile.size,
          type: textFile.type,
          uploadedAt: Date.now(),
          status: "uploading",
          storageStatus: "uploading",
          indexStatus: "not_indexed",
        });

        if (!newKnowledgeFile) return;

        set((state) => ({
          collections: state.collections.map((item) =>
            item.id === collectionId
              ? {
                  ...item,
                  files: [newKnowledgeFile, ...item.files],
                  updatedAt: Date.now(),
                }
              : item,
          ),
        }));

        const isFileStillPresent = () =>
          get().collections.some(
            (item) =>
              item.id === collectionId &&
              item.files.some((file) => file.id === fileId),
          );

        const updateCreatedFile = (updates: Partial<KnowledgeFile>) => {
          set((state) => ({
            collections: state.collections.map((item) => {
              if (item.id !== collectionId) return item;
              return {
                ...item,
                files: item.files.map((file) =>
                  file.id === fileId
                    ? normalizeKnowledgeFile({ ...file, ...updates }) || file
                    : file,
                ),
                updatedAt: Date.now(),
              };
            }),
          }));
        };

        return runKnowledgeFileOperation(collectionId, fileId, async () => {
          let opfsPath: string | undefined;
          let ragId: string | undefined;
          let ragChunkCount: number | undefined;

          try {
            opfsPath = await saveToOPFS(
              textFile,
              `knowledge-base/${collectionId}/source`,
            );
            if (!isFileStillPresent()) {
              await cleanupKnowledgeFileResources(
                { path: opfsPath },
                collectionId,
              );
              return;
            }

            updateCreatedFile({
              sourcePath: opfsPath,
              contentPath: opfsPath,
              path: opfsPath,
              contentKind: "source_text",
              contentSize: textFile.size,
              storageStatus: "saved",
              indexStatus: "not_indexed",
              status: "saved",
              storageError: undefined,
              indexError: undefined,
              error: undefined,
            });

            const { rag } = useSettingsStore.getState();
            if (rag.enabled) {
              updateCreatedFile({
                indexStatus: "indexing",
                status: "indexing",
                indexError: undefined,
                error: undefined,
              });
              if (!hasRagVectorStore(rag)) {
                throw new Error("RAG Configuration missing.");
              }

              const vectorItems = buildKnowledgeVectorItems({
                collectionId,
                fileName,
                ragFileId: fileId,
                textContent: content,
                chunkSize: rag.chunkSize || 512,
              });
              if (vectorItems.length === 0) {
                throw new Error("No text content available to index.");
              }
              const success = await upsertToRAG(vectorItems, collectionId);
              if (!success) {
                throw new Error("Failed to upload to Vector DB.");
              }

              ragId = fileId;
              ragChunkCount = vectorItems.length;
            }

            if (!isFileStillPresent()) {
              await cleanupKnowledgeFileResources(
                { path: opfsPath, ragId, ragChunkCount },
                collectionId,
              );
              return;
            }

            updateCreatedFile({
              sourcePath: opfsPath,
              contentPath: opfsPath,
              path: opfsPath,
              contentKind: "source_text",
              contentSize: textFile.size,
              storageStatus: "saved",
              indexStatus: ragId ? "indexed" : "not_indexed",
              status: ragId ? "indexed" : "saved",
              ragId,
              ragChunkCount,
              error: undefined,
            });
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : "Unknown error";
            if (isFileStillPresent()) {
              updateCreatedFile({
                sourcePath: opfsPath,
                contentPath: opfsPath,
                path: opfsPath,
                contentKind: opfsPath ? "source_text" : undefined,
                contentSize: opfsPath ? textFile.size : undefined,
                storageStatus: opfsPath ? "saved" : "error",
                indexStatus: opfsPath ? "error" : "not_indexed",
                status: "error",
                storageError: opfsPath ? undefined : errorMsg,
                indexError: opfsPath ? errorMsg : undefined,
                error: errorMsg,
                ragId,
                ragChunkCount,
              });
            }
            throw e;
          }
        });
      },

      cancelUpload: async (collectionId, fileId) => {
        knowledgeOperationControllers
          .get(getOperationKey(collectionId, fileId))
          ?.abort();
        return runKnowledgeFileOperation(collectionId, fileId, async () => {
          const currentFile = get()
            .collections.find((c) => c.id === collectionId)
            ?.files.find((f) => f.id === fileId);

          await cleanupKnowledgeFileResources(currentFile, collectionId, {
            strict: true,
          });

          set((state) => ({
            collections: state.collections.map((collection) => {
              if (collection.id !== collectionId) return collection;
              return {
                ...collection,
                files: collection.files.filter((file) => file.id !== fileId),
                updatedAt: Date.now(),
              };
            }),
          }));
        });
      },

      retryFile: async (collectionId, fileId) => {
        const file = get()
          .collections.find((collection) => collection.id === collectionId)
          ?.files.find((item) => item.id === fileId);

        if (!file) return;

        const contentPath = getContentPath(file);
        const sourcePath = getSourcePath(file);
        if ((file.storageStatus === "error" || !contentPath) && sourcePath) {
          await get().reparseFile(collectionId, fileId);
          return;
        }

        if (!contentPath) {
          const message = "Upload the file again to retry.";
          set((state) => ({
            collections: state.collections.map((collection) => {
              if (collection.id !== collectionId) return collection;
              return {
                ...collection,
                files: collection.files.map((item) =>
                  item.id === fileId
                    ? {
                        ...item,
                        ...buildStatusUpdate(item, {
                          storageStatus: "error",
                          storageError: message,
                        }),
                      }
                    : item,
                ),
              };
            }),
          }));
          throw new Error(message);
        }

        const { rag } = useSettingsStore.getState();
        if (file.indexStatus === "error" || rag.enabled || file.ragId) {
          await get().reindexFile(collectionId, fileId);
          return;
        }

        set((state) => ({
          collections: state.collections.map((collection) => {
            if (collection.id !== collectionId) return collection;
            return {
              ...collection,
              files: collection.files.map((item) =>
                item.id === fileId
                  ? {
                      ...item,
                      ...buildStatusUpdate(item, {
                        storageStatus: "saved",
                        storageError: undefined,
                        indexStatus: "not_indexed",
                        indexError: undefined,
                      }),
                    }
                  : item,
              ),
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      reparseFile: async (collectionId, fileId, replacementSource) => {
        if (replacementSource) {
          const selection = selectKnowledgeFilesForUpload(0, [
            replacementSource,
          ]);
          if (selection.accepted.length !== 1) {
            throw new Error(
              "Select a supported, non-empty file within the size limit.",
            );
          }
        }

        const operationKey = getOperationKey(collectionId, fileId);
        knowledgeOperationControllers.get(operationKey)?.abort();
        return runKnowledgeFileOperation(collectionId, fileId, async () => {
          const collection = get().collections.find(
            (item) => item.id === collectionId,
          );
          const file = collection?.files.find((item) => item.id === fileId);
          if (!file) return;

          const controller = new AbortController();
          knowledgeOperationControllers.set(operationKey, controller);

          const updateCurrentFile = (updates: Partial<KnowledgeFile>) => {
            set((state) => ({
              collections: state.collections.map((item) => {
                if (item.id !== collectionId) return item;
                return {
                  ...item,
                  files: item.files.map((current) =>
                    current.id === fileId
                      ? normalizeKnowledgeFile({
                          ...current,
                          ...buildStatusUpdate(current, updates),
                        }) || current
                      : current,
                  ),
                  updatedAt: Date.now(),
                };
              }),
            }));
          };
          const isFileStillPresent = () =>
            get().collections.some(
              (item) =>
                item.id === collectionId &&
                item.files.some((current) => current.id === fileId),
            );

          const oldSourcePath = getSourcePath(file);
          const oldContentPath = getContentPath(file);
          let sourcePath = oldSourcePath;
          let contentPath: string | undefined;
          let sourceFile = replacementSource;
          let contentSaved = false;

          try {
            if (replacementSource) {
              sourcePath = await saveToOPFS(
                replacementSource,
                `knowledge-base/${collectionId}/source`,
              );
              if (!isFileStillPresent()) {
                await deleteFromOPFS(sourcePath);
                return;
              }
              updateCurrentFile({
                name: replacementSource.name,
                size: replacementSource.size,
                type: replacementSource.type || "application/octet-stream",
                uploadedAt: Date.now(),
                sourcePath,
                sourceMissing: false,
                storageStatus: isTextKnowledgeSource(replacementSource)
                  ? "uploading"
                  : "parsing",
                storageError: undefined,
              });
            } else {
              if (!sourcePath) {
                throw new Error(MISSING_SOURCE_FILE_ERROR);
              }
              const sourceBlob = await resolveOPFSBlob(sourcePath);
              if (!sourceBlob) throw new Error(MISSING_SOURCE_FILE_ERROR);
              sourceFile = new File([sourceBlob], file.name, {
                type: file.type,
              });
              updateCurrentFile({
                storageStatus: isTextKnowledgeSource(file)
                  ? "uploading"
                  : "parsing",
                storageError: undefined,
              });
            }

            if (!sourceFile || !sourcePath) {
              throw new Error(MISSING_SOURCE_FILE_ERROR);
            }

            const sourceIsText = isTextKnowledgeSource(sourceFile);
            const textContent = sourceIsText
              ? await sourceFile.text()
              : await parseKnowledgeDocument(
                  sourceFile,
                  useSettingsStore.getState().rag,
                  controller.signal,
                );
            if (!textContent.trim()) {
              throw new Error("No text content extracted.");
            }

            contentPath = sourceIsText
              ? sourcePath
              : await saveToOPFS(
                  createExtractedTextFile(sourceFile.name, textContent),
                  `knowledge-base/${collectionId}/content`,
                );
            if (!isFileStillPresent()) {
              await cleanupKnowledgeFileResources(
                { sourcePath, contentPath },
                collectionId,
              );
              return;
            }

            updateCurrentFile({
              sourcePath,
              contentPath,
              path: contentPath,
              contentKind: sourceIsText ? "source_text" : "extracted_text",
              contentSize: new Blob([textContent]).size,
              contentEditedAt: undefined,
              sourceMissing: false,
              storageStatus: "saved",
              storageError: undefined,
              indexStatus: "not_indexed",
              indexError: undefined,
            });
            contentSaved = true;

            for (const oldPath of new Set([oldSourcePath, oldContentPath])) {
              if (
                oldPath &&
                oldPath !== sourcePath &&
                oldPath !== contentPath
              ) {
                try {
                  await deleteFromOPFS(oldPath);
                } catch (cleanupError) {
                  logDevWarn(
                    "Failed to delete replaced knowledge file:",
                    cleanupError,
                  );
                }
              }
            }

            const { rag } = useSettingsStore.getState();
            if (rag.enabled || file.ragId) {
              await reindexKnowledgeFile(set, get, collectionId, fileId);
            }
          } catch (error) {
            if (isFileStillPresent()) {
              const message =
                error instanceof Error
                  ? error.message
                  : "Document parsing failed.";
              if (!contentSaved) {
                updateCurrentFile({
                  sourcePath,
                  sourceMissing: !sourcePath,
                  storageStatus: "error",
                  storageError: message,
                });
              }
            } else {
              await Promise.all(
                Array.from(
                  new Set([
                    oldSourcePath,
                    oldContentPath,
                    sourcePath,
                    contentPath,
                  ]),
                )
                  .filter((path): path is string => Boolean(path))
                  .map((path) => deleteFromOPFS(path)),
              );
            }
            if (!(error instanceof Error && error.name === "AbortError")) {
              logDevError(`File reparsing failed: ${file.name}`, error);
            }
            throw error;
          } finally {
            if (
              knowledgeOperationControllers.get(operationKey) === controller
            ) {
              knowledgeOperationControllers.delete(operationKey);
            }
          }
        });
      },

      reconcileCollection: async (collectionId) => {
        const collection = get().collections.find((c) => c.id === collectionId);
        const expectedUrls =
          collection?.files
            .flatMap((file) => [getSourcePath(file), getContentPath(file)])
            .filter((path): path is string => Boolean(path)) || [];

        const actualPaths = await listOPFSDirectory(
          `knowledge-base/${collectionId}`,
        );
        const plan = getOPFSReconciliationPlan({
          expectedUrls,
          actualPaths,
        });

        await Promise.all(plan.orphanUrls.map((url) => deleteFromOPFS(url)));

        if (plan.missingUrls.length > 0) {
          const missingUrls = new Set(plan.missingUrls);
          set((state) => ({
            collections: state.collections.map((item) => {
              if (item.id !== collectionId) return item;
              return {
                ...item,
                files: item.files.map((file) => {
                  const sourcePath = getSourcePath(file);
                  const contentPath = getContentPath(file);
                  const sourceMissing = Boolean(
                    sourcePath && missingUrls.has(sourcePath),
                  );
                  const contentMissing = Boolean(
                    contentPath && missingUrls.has(contentPath),
                  );
                  if (!sourceMissing && !contentMissing) return file;
                  return (
                    normalizeKnowledgeFile({
                      ...file,
                      ...buildStatusUpdate(file, {
                        sourceMissing:
                          sourceMissing || file.sourceMissing || undefined,
                        ...(contentMissing
                          ? {
                              storageStatus: "error" as const,
                              storageError: MISSING_OPFS_FILE_ERROR,
                            }
                          : {}),
                      }),
                    }) || file
                  );
                }),
                updatedAt: Date.now(),
              };
            }),
          }));
        }

        return plan;
      },

      reindexFile: async (collectionId, fileId) => {
        return runKnowledgeFileOperation(collectionId, fileId, () =>
          reindexKnowledgeFile(set, get, collectionId, fileId),
        );
      },

      deleteFile: async (collectionId, fileId) => {
        knowledgeOperationControllers
          .get(getOperationKey(collectionId, fileId))
          ?.abort();
        return runKnowledgeFileOperation(collectionId, fileId, async () => {
          const currentFile = get()
            .collections.find((c) => c.id === collectionId)
            ?.files.find((f) => f.id === fileId);

          await cleanupKnowledgeFileResources(currentFile, collectionId, {
            strict: true,
          });

          set((state) => ({
            collections: state.collections.map((c) => {
              if (c.id === collectionId) {
                return {
                  ...c,
                  files: c.files.filter((f) => f.id !== fileId),
                };
              }
              return c;
            }),
          }));
        });
      },
    }),
    {
      name: STORAGE_KEYS.KNOWLEDGE,
      storage: createJSONStorage(getAppDbStorage),
      version: STORAGE_VERSION,
      migrate: (persistedState) => {
        const state = persistedState as Partial<KnowledgeState>;
        return {
          ...state,
          collections: normalizeKnowledgeCollections(state.collections || []),
        } as KnowledgeState;
      },
      onRehydrateStorage: () => {
        return (state, error) => {
          if (typeof window === "undefined") return;
          if (error) logDevError("Knowledge store hydration failed:", error);
          void reportAppRestoreHydration("knowledge", error).then(
            () => state?.setHasHydrated(true),
            (restoreError) => {
              logDevError(
                "Restored knowledge data failed startup validation:",
                restoreError,
              );
              window.location.reload();
            },
          );
        };
      },
    },
  ),
);
