import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { v7 as uuidv7 } from "uuid";
import {
  Collection,
  KnowledgeFile,
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
  reconcileCollection: (
    collectionId: string,
  ) => Promise<OPFSReconciliationPlan>;
  reindexFile: (collectionId: string, fileId: string) => Promise<void>;
  deleteFile: (collectionId: string, fileId: string) => Promise<void>;
}

const MISSING_OPFS_FILE_ERROR =
  "Local file content is missing. Retry upload or remove this file.";

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

async function parseKnowledgeDocument(file: File, rag: RAGConfig) {
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
  });
}

async function cleanupKnowledgeFileResources(
  file: Pick<KnowledgeFile, "path" | "ragId" | "ragChunkCount"> | undefined,
  collectionId: string,
  options: { strict?: boolean } = {},
) {
  if (!file) return;
  const errors: unknown[] = [];

  if (file.path) {
    try {
      await deleteFromOPFS(file.path);
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

        // 1. Initialize files in state with "uploading" status
        const newKnowledgeFiles: KnowledgeFile[] = filesToUpload
          .map((f) =>
            normalizeKnowledgeFile({
              id: uuidv7(),
              name: f.name,
              size: f.size,
              type: f.type || "application/octet-stream",
              uploadedAt: Date.now(),
              status: "uploading",
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
          path?: string,
          ragId?: string,
          ragChunkCount?: number,
        ) => {
          await cleanupKnowledgeFileResources(
            { path, ragId, ragChunkCount },
            collectionId,
          );
        };

        // Helper to update status of a specific file
        const updateFileStatus = (
          fileId: string,
          status: KnowledgeFileStatus,
          updates?: Partial<KnowledgeFile>,
        ) => {
          set((state) => ({
            collections: state.collections.map((c) => {
              if (c.id === collectionId) {
                return {
                  ...c,
                  files: c.files.map((f) => {
                    if (f.id !== fileId) return f;
                    return (
                      normalizeKnowledgeFile({ ...f, status, ...updates }) || f
                    );
                  }),
                };
              }
              return c;
            }),
          }));
        };

        // 2. Process each file
        for (let i = 0; i < filesToUpload.length; i++) {
          const file = filesToUpload[i];
          const kFile = newKnowledgeFiles[i];
          let errorMsg = undefined;
          let ragId = undefined;
          let opfsPath = undefined;
          let ragChunkCount = undefined;

          try {
            if (!isFileStillPresent(kFile.id)) continue;

            if (rag.enabled) {
              // --- RAG FLOW ---
              if (!hasRagVectorStore(rag))
                throw new Error("RAG Configuration missing.");

              let textContent = "";
              const isText = isTextMimeType(file.type);

              if (isText) {
                textContent = await file.text();
              } else {
                updateFileStatus(kFile.id, "parsing");
                textContent = await parseKnowledgeDocument(file, rag);
              }

              if (!textContent.trim())
                throw new Error("No text content extracted.");

              // STEP: Save Text to OPFS (New Requirement)
              // Create a plain text file with the same name as the original
              const textFile = new File([textContent], file.name, {
                type: "text/plain",
              });
              opfsPath = await saveToOPFS(
                textFile,
                `knowledge-base/${collectionId}`,
              );

              // Update state with path immediately so user can view it if needed
              if (!isFileStillPresent(kFile.id)) {
                await cleanupStaleUploadResources(opfsPath);
                continue;
              }
              updateFileStatus(kFile.id, "indexing", { path: opfsPath });

              // STEP: Indexing
              const chunkSize = rag.chunkSize || 512;
              const ragFileId = kFile.id;
              const vectorItems = buildKnowledgeVectorItems({
                collectionId,
                fileName: file.name,
                ragFileId,
                textContent,
                chunkSize,
              });

              // FIX: Pass collectionId as namespace
              if (!isFileStillPresent(kFile.id)) {
                await cleanupStaleUploadResources(opfsPath);
                continue;
              }
              const success = await upsertToRAG(vectorItems, collectionId);
              if (!success) throw new Error("Failed to upload to Vector DB.");

              ragId = ragFileId; // Mark as RAG processed
              ragChunkCount = vectorItems.length;

              if (!isFileStillPresent(kFile.id)) {
                await cleanupStaleUploadResources(
                  opfsPath,
                  ragId,
                  ragChunkCount,
                );
                continue;
              }

              // STEP: Indexed (Final)
              updateFileStatus(kFile.id, "indexed", {
                ragId,
                ragChunkCount,
              });
            } else {
              // --- NO RAG FLOW (Local Storage) ---
              const isText = isTextMimeType(file.type);

              if (isText) {
                // Save to OPFS
                opfsPath = await saveToOPFS(
                  file,
                  `knowledge-base/${collectionId}`,
                );
              } else {
                updateFileStatus(kFile.id, "parsing");

                const textContent = await parseKnowledgeDocument(file, rag);
                if (!textContent.trim())
                  throw new Error("No text content extracted.");

                // STEP: Save Text to OPFS (New Requirement)
                // Create a plain text file with the same name as the original
                const textFile = new File([textContent], file.name, {
                  type: "text/plain",
                });
                opfsPath = await saveToOPFS(
                  textFile,
                  `knowledge-base/${collectionId}`,
                );
              }

              // STEP: Saved (Final)
              if (!isFileStillPresent(kFile.id)) {
                await cleanupStaleUploadResources(opfsPath);
                continue;
              }
              updateFileStatus(kFile.id, "saved", { path: opfsPath });
            }
          } catch (e: any) {
            logDevError(`File processing failed: ${file.name}`, e);
            errorMsg = e.message || "Unknown error";
            updateFileStatus(kFile.id, "error", { error: errorMsg });
          }
        }
      },

      updateFileContent: async (collectionId, fileId, content) => {
        const { collections } = get();
        const collection = collections.find((c) => c.id === collectionId);
        if (!collection) return;

        const file = collection.files.find((f) => f.id === fileId);
        if (!file || !file.path) return;

        const isFileStillPresent = () =>
          get().collections.some(
            (c) =>
              c.id === collectionId && c.files.some((f) => f.id === fileId),
          );

        try {
          const blob = new Blob([content]);
          let nextRagChunkCount = file.ragChunkCount;
          let nextRagId = file.ragId;
          let nextStatus = file.status;

          if (!isFileStillPresent()) return;

          const { rag } = useSettingsStore.getState();
          const shouldIndexWithRAG = !!file.ragId || rag.enabled;

          if (shouldIndexWithRAG) {
            if (!hasRagVectorStore(rag)) {
              throw new Error("RAG Configuration missing.");
            }
            const chunkSize = rag.chunkSize || 512;
            const ragFileId = file.ragId || file.id;
            const vectorItems = buildKnowledgeVectorItems({
              collectionId,
              fileName: file.name,
              ragFileId,
              textContent: content,
              chunkSize,
            });
            if (vectorItems.length === 0) {
              throw new Error("No text content available to index.");
            }
            const success = await upsertToRAG(vectorItems, collectionId);
            if (!success) {
              throw new Error("Failed to update RAG vectors.");
            }

            if (!isFileStillPresent()) {
              await cleanupKnowledgeFileResources(
                {
                  path: file.path,
                  ragId: ragFileId,
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

            nextRagId = ragFileId;
            nextRagChunkCount = vectorItems.length;
            nextStatus = "indexed";
          }

          // Write local copy after RAG validation so failed re-indexing does
          // not silently leave retrievable knowledge stale.
          if (!isFileStillPresent()) return;
          await writeToOPFS(file.path, content);

          if (!isFileStillPresent()) {
            await cleanupKnowledgeFileResources(
              {
                path: file.path,
                ragId: file.ragId,
                ragChunkCount: nextRagChunkCount,
              },
              collectionId,
            );
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
                        status: nextStatus,
                        size: blob.size,
                        ragId: nextRagId,
                        ragChunkCount: nextRagChunkCount,
                        error: undefined,
                      }) || f
                    );
                  }),
                  updatedAt: Date.now(),
                };
              }
              return c;
            }),
          }));
        } catch (e) {
          logDevError("Failed to update file content", e);
          throw e;
        }
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

        let opfsPath: string | undefined;
        let ragId: string | undefined;
        let ragChunkCount: number | undefined;

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

        try {
          opfsPath = await saveToOPFS(
            textFile,
            `knowledge-base/${collectionId}`,
          );
          if (!isFileStillPresent()) {
            await cleanupKnowledgeFileResources(
              { path: opfsPath },
              collectionId,
            );
            return;
          }

          const { rag } = useSettingsStore.getState();
          if (rag.enabled) {
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
            path: opfsPath,
            status: ragId ? "indexed" : "saved",
            ragId,
            ragChunkCount,
            error: undefined,
          });
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : "Unknown error";
          if (isFileStillPresent()) {
            updateCreatedFile({
              path: opfsPath,
              status: "error",
              error: errorMsg,
              ragId,
              ragChunkCount,
            });
          }
          throw e;
        }
      },

      cancelUpload: async (collectionId, fileId) => {
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
      },

      retryFile: async (collectionId, fileId) => {
        const file = get()
          .collections.find((collection) => collection.id === collectionId)
          ?.files.find((item) => item.id === fileId);

        if (!file) return;

        if (!file.path) {
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
                        status: "error",
                        error: message,
                      }
                    : item,
                ),
              };
            }),
          }));
          throw new Error(message);
        }

        const { rag } = useSettingsStore.getState();
        if (rag.enabled || file.ragId) {
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
                      status: "saved",
                      error: undefined,
                    }
                  : item,
              ),
              updatedAt: Date.now(),
            };
          }),
        }));
      },

      reconcileCollection: async (collectionId) => {
        const collection = get().collections.find((c) => c.id === collectionId);
        const expectedUrls =
          collection?.files
            .map((file) => file.path)
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
                  if (!file.path || !missingUrls.has(file.path)) return file;
                  return (
                    normalizeKnowledgeFile({
                      ...file,
                      status: "error",
                      error: MISSING_OPFS_FILE_ERROR,
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
        const file = get()
          .collections.find((c) => c.id === collectionId)
          ?.files.find((f) => f.id === fileId);

        if (!file?.path) {
          throw new Error("No local file content is available to re-index.");
        }

        const { rag } = useSettingsStore.getState();
        if (!rag.enabled || !hasRagVectorStore(rag)) {
          throw new Error(
            "Enable and configure RAG before rebuilding the index.",
          );
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
                      status: "indexing",
                      error: undefined,
                    }
                  : item,
              ),
            };
          }),
        }));

        try {
          const content = await withResolvedObjectUrl({
            source: file.path,
            resolveObjectUrl: resolveOPFSUrl,
            read: async (objectUrl) => {
              const response = await fetch(objectUrl);
              return response.text();
            },
          });

          if (!content?.trim()) {
            throw new Error("No text content available to index.");
          }

          await get().updateFileContent(collectionId, fileId, content);
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
                        status: "error",
                        error:
                          error instanceof Error
                            ? error.message
                            : "Failed to rebuild RAG index.",
                      }
                    : item,
                ),
              };
            }),
          }));
          throw error;
        }
      },

      deleteFile: async (collectionId, fileId) => {
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
          if (error) {
            logDevError("Knowledge store hydration failed:", error);
            state?.setHasHydrated(true);
          } else if (state) {
            state.setHasHydrated(true);
          }
        };
      },
    },
  ),
);
