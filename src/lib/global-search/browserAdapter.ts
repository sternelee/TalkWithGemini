import { normalizeSessionMessageTree } from "@/lib/chat/messageTree";
import { appDb } from "@/store/storage/storageConfig";
import type {
  Collection,
  KnowledgeFile,
  Message,
  SessionMessageTree,
} from "@/types";
import { resolveOPFSBlob } from "@/utils/opfs";
import { GlobalSearchCancelledError } from "./indexer";
import type { KnowledgeContentReadResult } from "./types";

type SearchableKnowledgeFile = KnowledgeFile & {
  sourcePath?: string;
  contentPath?: string;
  contentKind?: "source_text" | "extracted_text";
};

function isTextMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith("text/") ||
    mimeType.endsWith("+json") ||
    mimeType.endsWith("+xml") ||
    [
      "application/json",
      "application/javascript",
      "application/xml",
      "application/xhtml+xml",
      "application/x-yaml",
      "application/sql",
      "application/graphql",
      "application/ld+json",
      "application/x-sh",
      "application/typescript",
    ].includes(mimeType)
  );
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new GlobalSearchCancelledError();
}

/** Read a persisted message tree while accepting pre-tree legacy arrays. */
export async function loadPersistedSessionTree(
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionMessageTree> {
  throwIfAborted(signal);
  const stored = await appDb.getItem<Message[] | SessionMessageTree>(
    `session_messages_${sessionId}`,
  );
  throwIfAborted(signal);
  return normalizeSessionMessageTree(stored);
}

/**
 * Reads only the knowledge text/derived-text path. A new binary source path is
 * never decoded as text; legacy non-text records are readable because their
 * sole `path` contains the already-extracted text.
 */
export async function readPersistedKnowledgeContent(
  _collection: Collection,
  rawFile: KnowledgeFile,
  signal: AbortSignal | undefined,
  maxChars: number,
): Promise<KnowledgeContentReadResult | null> {
  throwIfAborted(signal);
  const file = rawFile as SearchableKnowledgeFile;
  const contentPath = file.contentPath || file.path;
  if (!contentPath) return null;

  const pathIsKnownBinarySource =
    !file.contentPath &&
    Boolean(file.sourcePath) &&
    file.sourcePath === file.path &&
    file.contentKind !== "source_text" &&
    !isTextMimeType(file.type);
  if (pathIsKnownBinarySource) return null;

  const blob = await resolveOPFSBlob(contentPath);
  throwIfAborted(signal);
  if (!blob)
    throw new Error(`Local knowledge content is missing: ${file.name}`);

  // UTF-8 can use up to four bytes per code point. Bound the Blob read before
  // converting it to a string, then apply the exact character cap.
  const maxReadBytes = Math.max(1, maxChars) * 4;
  const source = blob.size > maxReadBytes ? blob.slice(0, maxReadBytes) : blob;
  const text = await source.text();
  throwIfAborted(signal);
  const content = text.slice(0, maxChars);

  return {
    content,
    truncated: blob.size > maxReadBytes || content.length < text.length,
  };
}
