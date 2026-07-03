import localforage from "localforage";
import { RAG_LIMITS } from "../../config/limits";
import type { Collection, RAGConfig } from "../../types";
import { buildKnowledgeVectorIds } from "../utils/knowledgeVectors";
import { appDb, STORAGE_KEYS } from "../../store/storage/storageConfig";
import { deleteOPFSDirectory } from "../../utils/opfs";
import { encryptSecret } from "../byok/client";
import { BYOK_CONTEXTS } from "../byok/shared";
import { logDevWarn } from "../utils/devLogger";
import {
  hasRagVectorStore,
  resolveRagToken,
} from "../security/localSecretResolvers";
import { deleteLocalSecretMasterKey } from "../security/localSecrets";

const APP_OPFS_DIRECTORIES = ["knowledge-base", "workspaces", "images", "chat"];

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function parsePersistedState<T>(value: unknown): T | null {
  if (!value) return null;

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== "object") return null;

    const maybeState = parsed as { state?: unknown };
    return (maybeState.state || parsed) as T;
  } catch {
    return null;
  }
}

async function deleteRAGIds(
  ids: string[],
  namespace: string,
  rag: RAGConfig,
): Promise<void> {
  if (!hasRagVectorStore(rag) || ids.length === 0) return;

  const useDefault = Boolean(
    rag.useDefaultVectorStore && rag.serverVectorStoreAvailable,
  );

  let tokenSecret: Awaited<ReturnType<typeof encryptSecret>> | undefined;
  if (!useDefault) {
    try {
      const token = await resolveRagToken(rag);
      tokenSecret = await encryptSecret(token, BYOK_CONTEXTS.ragToken);
    } catch (error) {
      logDevWarn("Failed to encrypt RAG token during clear:", error);
      return;
    }
    if (!tokenSecret) return;
  }

  for (const batch of chunkArray(ids, RAG_LIMITS.maxItemsPerRequest)) {
    try {
      const response = await fetch("/api/rag/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids: batch,
          namespace,
          url: rag.url,
          useDefault,
          tokenSecret,
        }),
      });

      if (!response.ok) {
        logDevWarn("Failed to delete persisted RAG vectors during clear.");
      }
    } catch (error) {
      logDevWarn("Failed to delete persisted RAG vectors during clear:", error);
    }
  }
}

async function cleanupPersistedKnowledgeVectors(rag: RAGConfig): Promise<void> {
  const storedKnowledge = await appDb.getItem<unknown>(STORAGE_KEYS.KNOWLEDGE);
  const persisted = parsePersistedState<{ collections?: Collection[] }>(
    storedKnowledge,
  );

  const collections = Array.isArray(persisted?.collections)
    ? persisted.collections
    : [];

  for (const collection of collections) {
    const ids = collection.files.flatMap((file) =>
      file.ragId
        ? buildKnowledgeVectorIds(file.ragId, file.ragChunkCount || 1_000)
        : [],
    );
    await deleteRAGIds(ids, collection.id, rag);
  }
}

async function cleanupOPFSDirectories(): Promise<void> {
  for (const directory of APP_OPFS_DIRECTORIES) {
    try {
      await deleteOPFSDirectory(directory);
    } catch (error) {
      logDevWarn(`Failed to delete OPFS directory "${directory}":`, error);
    }
  }
}

async function clearLocalStorageKeys(): Promise<void> {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(STORAGE_KEYS.CORE_SETTINGS);
  window.localStorage.removeItem(STORAGE_KEYS.SETTINGS);
  window.localStorage.removeItem(STORAGE_KEYS.CHAT);
  window.localStorage.removeItem(STORAGE_KEYS.KNOWLEDGE);
  await deleteLocalSecretMasterKey();
}

export async function clearBrowserAppData(rag: RAGConfig): Promise<void> {
  await cleanupPersistedKnowledgeVectors(rag);
  await cleanupOPFSDirectories();
  await clearLocalStorageKeys();
  await localforage.clear();
  await appDb.clear();
}
