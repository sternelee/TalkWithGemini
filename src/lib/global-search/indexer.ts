import { getActiveMessagePath } from "@/lib/chat/messageTree";
import { GLOBAL_SEARCH_LIMITS } from "@/config/limits";
import type { Message } from "@/types";
import type {
  GlobalSearchBuildInput,
  GlobalSearchDocument,
  GlobalSearchIndex,
  GlobalSearchIndexError,
  GlobalSearchIndexStats,
  GlobalSearchLimits,
  GlobalSearchSource,
} from "./types";

export const DEFAULT_GLOBAL_SEARCH_LIMITS: GlobalSearchLimits = {
  maxDocuments: GLOBAL_SEARCH_LIMITS.maxDocuments,
  maxMetadataDocuments: GLOBAL_SEARCH_LIMITS.maxMetadataDocuments,
  maxSingleContentChars: GLOBAL_SEARCH_LIMITS.maxSingleContentChars,
  maxTotalContentChars: GLOBAL_SEARCH_LIMITS.maxTotalContentChars,
  yieldEveryDocuments: GLOBAL_SEARCH_LIMITS.yieldEveryDocuments,
};

export class GlobalSearchCancelledError extends Error {
  constructor() {
    super("Global search indexing was cancelled.");
    this.name = "GlobalSearchCancelledError";
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new GlobalSearchCancelledError();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to read content.";
}

function normalizeTimestamp(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getAttachmentNames(message: Message): string[] {
  return (message.attachments || [])
    .map((attachment) => attachment.fileName?.trim())
    .filter((name): name is string => Boolean(name));
}

function firstContentLine(content: string, fallback: string): string {
  return (
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
      ?.slice(0, 100) || fallback
  );
}

async function yieldToMainThread() {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

export async function buildGlobalSearchIndex({
  sessions,
  workspaces,
  knowledgeCollections,
  memories,
  loadSessionTree,
  readKnowledgeContent,
  signal,
  sources,
  limits: limitOverrides,
  onProgress,
  now = Date.now,
}: GlobalSearchBuildInput): Promise<GlobalSearchIndex> {
  const limits = { ...DEFAULT_GLOBAL_SEARCH_LIMITS, ...limitOverrides };
  const documents: GlobalSearchDocument[] = [];
  const errors: GlobalSearchIndexError[] = [];
  const stats: GlobalSearchIndexStats = {
    documents: 0,
    sessions: 0,
    messages: 0,
    knowledgeFiles: 0,
    workspaces: 0,
    memories: 0,
    indexedContentChars: 0,
  };
  let partial = false;
  let documentsSinceYield = 0;
  let fullContentDocuments = 0;
  const sourceSet = new Set(
    sources || ["session", "knowledge", "workspace", "memory"],
  );

  const recordError = (
    source: GlobalSearchSource,
    id: string,
    error: unknown,
  ) => {
    partial = true;
    errors.push({ source, id, message: errorMessage(error).slice(0, 500) });
  };

  const addDocument = async (document: GlobalSearchDocument) => {
    throwIfAborted(signal);
    if (documents.length >= limits.maxMetadataDocuments) {
      partial = true;
      return false;
    }

    const canIndexContent = fullContentDocuments < limits.maxDocuments;
    const remaining = Math.max(
      0,
      limits.maxTotalContentChars - stats.indexedContentChars,
    );
    const allowed = canIndexContent
      ? Math.min(limits.maxSingleContentChars, remaining)
      : 0;
    const content = document.content.slice(0, allowed);
    if (content.length < document.content.length) partial = true;
    if (canIndexContent) fullContentDocuments += 1;

    documents.push({ ...document, content });
    stats.indexedContentChars += content.length;
    stats.documents += 1;
    documentsSinceYield += 1;

    if (documentsSinceYield >= Math.max(1, limits.yieldEveryDocuments)) {
      documentsSinceYield = 0;
      await yieldToMainThread();
      throwIfAborted(signal);
    }
    return true;
  };

  if (sourceSet.has("session")) {
    for (let index = 0; index < sessions.length; index += 1) {
      throwIfAborted(signal);
      const session = sessions[index];
      onProgress?.({
        phase: "session",
        processed: index,
        total: sessions.length,
      });

      const didAddSession = await addDocument({
        id: `session:${session.id}`,
        source: "session",
        title: session.title,
        content: "",
        keywords: [],
        updatedAt: normalizeTimestamp(session.updatedAt, now()),
        workspaceId: session.workspaceId,
        target: { type: "session", sessionId: session.id },
      });
      if (didAddSession) stats.sessions += 1;

      try {
        const tree = await loadSessionTree(session, signal);
        throwIfAborted(signal);
        if (!tree) continue;

        for (const message of getActiveMessagePath(tree)) {
          const attachmentNames = getAttachmentNames(message);
          const didAddMessage = await addDocument({
            id: `message:${session.id}:${message.id}`,
            source: "session",
            title: session.title,
            content: message.content || "",
            keywords: attachmentNames,
            updatedAt: normalizeTimestamp(message.timestamp, session.updatedAt),
            workspaceId: session.workspaceId,
            role: message.role,
            target: {
              type: "message",
              sessionId: session.id,
              messageId: message.id,
            },
          });
          if (didAddMessage) stats.messages += 1;
        }
      } catch (error) {
        if (error instanceof GlobalSearchCancelledError) throw error;
        recordError("session", session.id, error);
      }
    }
    onProgress?.({
      phase: "session",
      processed: sessions.length,
      total: sessions.length,
    });
  }

  if (sourceSet.has("workspace")) {
    for (let index = 0; index < workspaces.length; index += 1) {
      const workspace = workspaces[index];
      onProgress?.({
        phase: "workspace",
        processed: index,
        total: workspaces.length,
      });
      const didAdd = await addDocument({
        id: `workspace:${workspace.id}`,
        source: "workspace",
        title: workspace.name,
        content: workspace.systemPrompt || "",
        keywords: workspace.files.map((file) => file.fileName).filter(Boolean),
        updatedAt: normalizeTimestamp(workspace.createdAt, now()),
        workspaceId: workspace.id,
        target: { type: "workspace", workspaceId: workspace.id },
      });
      if (didAdd) stats.workspaces += 1;
    }
    onProgress?.({
      phase: "workspace",
      processed: workspaces.length,
      total: workspaces.length,
    });
  }

  const knowledgeWorkspaceIds = new Map<string, string[]>();
  for (const workspace of workspaces) {
    for (const collectionId of workspace.knowledgeCollectionIds) {
      const ids = knowledgeWorkspaceIds.get(collectionId) || [];
      if (!ids.includes(workspace.id)) ids.push(workspace.id);
      knowledgeWorkspaceIds.set(collectionId, ids);
    }
  }

  if (sourceSet.has("knowledge")) {
    for (
      let collectionIndex = 0;
      collectionIndex < knowledgeCollections.length;
      collectionIndex += 1
    ) {
      const collection = knowledgeCollections[collectionIndex];
      onProgress?.({
        phase: "knowledge",
        processed: collectionIndex,
        total: knowledgeCollections.length,
      });

      await addDocument({
        id: `knowledge:${collection.id}`,
        source: "knowledge",
        title: collection.name,
        content: collection.description,
        keywords: [],
        updatedAt: normalizeTimestamp(collection.updatedAt, now()),
        workspaceIds: knowledgeWorkspaceIds.get(collection.id),
        target: { type: "knowledge", collectionId: collection.id },
      });

      for (const file of collection.files) {
        throwIfAborted(signal);
        let content = "";
        try {
          const result = await readKnowledgeContent(
            collection,
            file,
            signal,
            limits.maxSingleContentChars,
          );
          content = result?.content || "";
          if (result?.truncated) partial = true;
        } catch (error) {
          if (error instanceof GlobalSearchCancelledError) throw error;
          recordError("knowledge", file.id, error);
        }

        const didAdd = await addDocument({
          id: `knowledge:${collection.id}:${file.id}`,
          source: "knowledge",
          title: file.name,
          content,
          keywords: [collection.name, collection.description].filter(Boolean),
          updatedAt: normalizeTimestamp(file.uploadedAt, collection.updatedAt),
          workspaceIds: knowledgeWorkspaceIds.get(collection.id),
          target: {
            type: "knowledge",
            collectionId: collection.id,
            fileId: file.id,
          },
        });
        if (didAdd) stats.knowledgeFiles += 1;
      }
    }
    onProgress?.({
      phase: "knowledge",
      processed: knowledgeCollections.length,
      total: knowledgeCollections.length,
    });
  }

  if (sourceSet.has("memory")) {
    for (let index = 0; index < memories.length; index += 1) {
      const memory = memories[index];
      onProgress?.({
        phase: "memory",
        processed: index,
        total: memories.length,
      });
      const didAdd = await addDocument({
        id: `memory:${memory.id}`,
        source: "memory",
        title: firstContentLine(memory.content, memory.type),
        content: memory.content,
        keywords: [memory.type, ...memory.tags],
        updatedAt: normalizeTimestamp(memory.updatedAt, memory.createdAt),
        target: { type: "memory", memoryId: memory.id },
      });
      if (didAdd) stats.memories += 1;
    }
    onProgress?.({
      phase: "memory",
      processed: memories.length,
      total: memories.length,
    });
  }

  return {
    documents,
    builtAt: now(),
    partial,
    errors,
    stats,
  };
}
