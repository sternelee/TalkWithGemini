import { getActiveMessagePath } from "@/lib/chat/messageTree";
import type {
  Collection,
  MemoryRecord,
  Session,
  SessionMessageTree,
  Workspace,
} from "@/types";
import type { GlobalSearchSource } from "./types";

function hashRevision(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}

export interface GlobalSearchRevisionInput {
  sessions: Session[];
  workspaces: Workspace[];
  knowledgeCollections: Collection[];
  memories: MemoryRecord[];
  currentSessionId?: string | null;
  activeMessageTree?: SessionMessageTree;
}

export function createGlobalSearchSourceRevisions(
  input: GlobalSearchRevisionInput,
): Record<GlobalSearchSource, string> {
  const activeMessages =
    input.currentSessionId && input.activeMessageTree
      ? getActiveMessagePath(input.activeMessageTree).map((message) => [
          message.id,
          message.role,
          message.timestamp,
          hashRevision(message.content || ""),
          (message.attachments || []).map((attachment) => attachment.fileName),
        ])
      : [];

  return {
    session: hashRevision(
      JSON.stringify([
        input.sessions.map((item) => [
          item.id,
          item.updatedAt,
          item.messageCount,
          item.workspaceId,
          item.title,
        ]),
        input.currentSessionId,
        activeMessages,
      ]),
    ),
    workspace: hashRevision(
      JSON.stringify(
        input.workspaces.map((item) => [
          item.id,
          item.name,
          hashRevision(item.systemPrompt || ""),
          item.knowledgeCollectionIds,
          item.files.map((file) => file.fileName),
        ]),
      ),
    ),
    knowledge: hashRevision(
      JSON.stringify(
        input.knowledgeCollections.map((item) => [
          item.id,
          item.updatedAt,
          item.name,
          item.description,
          item.files.map((file) => [
            file.id,
            file.uploadedAt,
            file.status,
            file.name,
            (file as typeof file & { contentPath?: string }).contentPath ||
              file.path,
          ]),
        ]),
      ),
    ),
    memory: hashRevision(
      JSON.stringify(
        input.memories.map((item) => [
          item.id,
          item.updatedAt,
          item.type,
          item.tags,
          hashRevision(item.content),
        ]),
      ),
    ),
  };
}

export function createGlobalSearchRevision(
  input: GlobalSearchRevisionInput,
): string {
  const revisions = createGlobalSearchSourceRevisions(input);
  const value = JSON.stringify([
    revisions.session,
    revisions.workspace,
    revisions.knowledge,
    revisions.memory,
  ]);
  return hashRevision(value);
}
