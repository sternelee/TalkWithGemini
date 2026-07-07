import { useSettingsStore } from "@/store/core/settingsStore";
import type { Source } from "../../types";
import { RAG_LIMITS } from "../../config/limits";
import {
  getResponseErrorMessage,
  readJsonResponseOrThrow,
  signedApiFetch,
} from "../../lib/api/client";
import { normalizeSearchSources } from "../../lib/search/results";
import { BYOK_CONTEXTS } from "../../lib/byok/shared";
import { encryptSecret, fetchWithByokRetry } from "../../lib/byok/client";
import { logDevError } from "../../lib/utils/devLogger";
import {
  hasRagVectorStore,
  resolveRagToken,
} from "../../lib/security/localSecretResolvers";

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export async function queryRAG(
  text: string,
  namespace = "",
): Promise<Source[]> {
  const { rag } = useSettingsStore.getState();

  if (!hasRagVectorStore(rag) || !rag.enabled) {
    return [];
  }

  try {
    const response = await fetchWithByokRetry(async () => {
      const useDefault = Boolean(
        rag.useDefaultVectorStore && rag.serverVectorStoreAvailable,
      );
      const token = useDefault ? undefined : await resolveRagToken(rag);
      const tokenSecret = useDefault
        ? undefined
        : await encryptSecret(token, BYOK_CONTEXTS.ragToken);
      return signedApiFetch("/api/rag/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          namespace: useDefault ? undefined : namespace,
          url: rag.url,
          useDefault,
          tokenSecret,
          topK: rag.topK || 10,
        }),
      });
    });

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "RAG query failed"),
      );
    }

    const data = await readJsonResponseOrThrow<{ sources?: Source[] }>(
      response,
      "RAG query failed",
    );
    return normalizeSearchSources(data.sources, {
      allowPlaceholderUrl: true,
      maxSources: rag.topK || 10,
    });
  } catch (e) {
    logDevError("RAG Query Failed:", e);
    throw e;
  }
}

export async function upsertToRAG(
  items: { id: string; data: string; metadata?: any }[],
  namespace = "",
): Promise<boolean> {
  const { rag } = useSettingsStore.getState();

  if (!hasRagVectorStore(rag)) {
    return false;
  }

  try {
    for (const batch of chunkArray(items, RAG_LIMITS.maxItemsPerRequest)) {
      const response = await fetchWithByokRetry(async () => {
        const useDefault = Boolean(
          rag.useDefaultVectorStore && rag.serverVectorStoreAvailable,
        );
        const token = useDefault ? undefined : await resolveRagToken(rag);
        const tokenSecret = useDefault
          ? undefined
          : await encryptSecret(token, BYOK_CONTEXTS.ragToken);
        return signedApiFetch("/api/rag/upsert", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: batch,
            namespace: useDefault ? undefined : namespace,
            url: rag.url,
            useDefault,
            tokenSecret,
          }),
        });
      });

      if (!response.ok) {
        throw new Error("RAG upsert failed");
      }

      const data = await readJsonResponseOrThrow<{ success?: boolean }>(
        response,
        "RAG upsert failed",
      );
      if (!data.success) return false;
    }

    return true;
  } catch (e) {
    logDevError("RAG Upsert Failed:", e);
    return false;
  }
}

export async function deleteFromRAG(
  ids: string[],
  namespace = "",
): Promise<boolean> {
  const { rag } = useSettingsStore.getState();

  if (!hasRagVectorStore(rag) || ids.length === 0) {
    return false;
  }

  try {
    for (const batch of chunkArray(ids, RAG_LIMITS.maxItemsPerRequest)) {
      const response = await fetchWithByokRetry(async () => {
        const useDefault = Boolean(
          rag.useDefaultVectorStore && rag.serverVectorStoreAvailable,
        );
        const token = useDefault ? undefined : await resolveRagToken(rag);
        const tokenSecret = useDefault
          ? undefined
          : await encryptSecret(token, BYOK_CONTEXTS.ragToken);
        return signedApiFetch("/api/rag/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ids: batch,
            namespace: useDefault ? undefined : namespace,
            url: rag.url,
            useDefault,
            tokenSecret,
          }),
        });
      });

      if (!response.ok) {
        throw new Error("RAG delete failed");
      }

      const data = await readJsonResponseOrThrow<{ success?: boolean }>(
        response,
        "RAG delete failed",
      );
      if (!data.success) return false;
    }

    return true;
  } catch (e) {
    logDevError("RAG Delete Failed:", e);
    return false;
  }
}
