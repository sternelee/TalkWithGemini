import { v7 as uuidv7 } from "uuid";
import { KNOWLEDGE_LIMITS } from "@/config/limits";
import type {
  Collection,
  KnowledgeFile,
  KnowledgeFileContentKind,
  KnowledgeFileIndexStatus,
  KnowledgeFileStorageStatus,
  KnowledgeFileStatus,
} from "@/types";

const VALID_FILE_STATUSES = new Set<KnowledgeFileStatus>([
  "uploading",
  "parsing",
  "indexing",
  "indexed",
  "saved",
  "error",
]);

const VALID_CONTENT_KINDS = new Set<KnowledgeFileContentKind>([
  "source_text",
  "extracted_text",
]);

const VALID_STORAGE_STATUSES = new Set<KnowledgeFileStorageStatus>([
  "uploading",
  "parsing",
  "saved",
  "error",
]);

const VALID_INDEX_STATUSES = new Set<KnowledgeFileIndexStatus>([
  "not_indexed",
  "indexing",
  "indexed",
  "error",
]);

const COLLECTION_COLORS = new Set([
  "blue",
  "purple",
  "green",
  "orange",
  "red",
  "pink",
  "cyan",
  "gray",
]);

const COLLECTION_ICONS = new Set([
  "Folder",
  "Atom",
  "BookText",
  "Microscope",
  "Cat",
  "ChartLine",
  "ChessKnight",
  "CodeXml",
  "Coffee",
  "GraduationCap",
  "MessagesSquare",
  "Archive",
]);

function trimString(value: unknown, maxChars: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().slice(0, maxChars);
  return trimmed || fallback;
}

function normalizeTimestamp(value: unknown): number {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now();
}

function normalizeSize(value: unknown): number {
  const size = Math.floor(Number(value));
  if (!Number.isFinite(size) || size < 0) return 0;
  return Math.min(size, KNOWLEDGE_LIMITS.maxFileBytes);
}

function normalizeRagChunkCount(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count) || count < 0) return undefined;
  return Math.min(count, KNOWLEDGE_LIMITS.maxRagChunkCount);
}

function isTextMimeType(mimeType: string): boolean {
  if (mimeType.startsWith("text/")) return true;
  if (mimeType.endsWith("+xml") || mimeType.endsWith("+json")) return true;
  return [
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
  ].includes(mimeType);
}

function deriveLegacyStatus(
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

export function normalizeKnowledgeFile(file: unknown): KnowledgeFile | null {
  if (!file || typeof file !== "object") return null;

  const raw = file as Partial<KnowledgeFile>;
  const id = trimString(raw.id, KNOWLEDGE_LIMITS.maxFileIdChars, uuidv7());
  const name = trimString(
    raw.name,
    KNOWLEDGE_LIMITS.maxFileNameChars,
    "Untitled file",
  );
  const type = trimString(
    raw.type,
    KNOWLEDGE_LIMITS.maxMimeTypeChars,
    "application/octet-stream",
  );
  const legacyStatus = VALID_FILE_STATUSES.has(
    raw.status as KnowledgeFileStatus,
  )
    ? (raw.status as KnowledgeFileStatus)
    : "saved";
  const ragId = trimString(raw.ragId, KNOWLEDGE_LIMITS.maxRagIdChars);
  const legacyPath = trimString(raw.path, KNOWLEDGE_LIMITS.maxPathChars);
  const explicitSourcePath = trimString(
    raw.sourcePath,
    KNOWLEDGE_LIMITS.maxPathChars,
  );
  const contentPath = trimString(
    raw.contentPath,
    KNOWLEDGE_LIMITS.maxPathChars,
    legacyPath,
  );
  const explicitContentKind = VALID_CONTENT_KINDS.has(
    raw.contentKind as KnowledgeFileContentKind,
  )
    ? (raw.contentKind as KnowledgeFileContentKind)
    : undefined;
  const isText = isTextMimeType(type);
  const contentKind =
    explicitContentKind ||
    (contentPath ? (isText ? "source_text" : "extracted_text") : undefined);
  const sourcePath =
    explicitSourcePath ||
    (contentKind === "source_text" ? contentPath : undefined);

  const explicitStorageStatus = VALID_STORAGE_STATUSES.has(
    raw.storageStatus as KnowledgeFileStorageStatus,
  )
    ? (raw.storageStatus as KnowledgeFileStorageStatus)
    : undefined;
  const explicitIndexStatus = VALID_INDEX_STATUSES.has(
    raw.indexStatus as KnowledgeFileIndexStatus,
  )
    ? (raw.indexStatus as KnowledgeFileIndexStatus)
    : undefined;
  const storageStatus: KnowledgeFileStorageStatus =
    explicitStorageStatus ||
    (legacyStatus === "uploading" || legacyStatus === "parsing"
      ? legacyStatus
      : legacyStatus === "error" && !contentPath
        ? "error"
        : contentPath
          ? "saved"
          : "uploading");
  const indexStatus: KnowledgeFileIndexStatus =
    explicitIndexStatus ||
    (legacyStatus === "indexing"
      ? "indexing"
      : legacyStatus === "indexed"
        ? "indexed"
        : legacyStatus === "error" && Boolean(contentPath)
          ? "error"
          : "not_indexed");
  const legacyError = trimString(raw.error, KNOWLEDGE_LIMITS.maxErrorChars);
  const storageError = trimString(
    raw.storageError,
    KNOWLEDGE_LIMITS.maxErrorChars,
    storageStatus === "error" ? legacyError : "",
  );
  const indexError = trimString(
    raw.indexError,
    KNOWLEDGE_LIMITS.maxErrorChars,
    indexStatus === "error" ? legacyError : "",
  );
  const error = storageError || indexError || legacyError;
  const ragChunkCount = normalizeRagChunkCount(raw.ragChunkCount);
  const contentEditedAt = raw.contentEditedAt
    ? normalizeTimestamp(raw.contentEditedAt)
    : undefined;
  const contentSize =
    raw.contentSize === undefined ? undefined : normalizeSize(raw.contentSize);
  const sourceMissing =
    typeof raw.sourceMissing === "boolean"
      ? raw.sourceMissing
      : contentKind === "extracted_text" && !sourcePath;
  const status = deriveLegacyStatus(storageStatus, indexStatus);

  return {
    id,
    name,
    size: normalizeSize(raw.size),
    type,
    uploadedAt: normalizeTimestamp(raw.uploadedAt),
    status,
    storageStatus,
    indexStatus,
    ...(ragId ? { ragId } : {}),
    ...(ragChunkCount !== undefined ? { ragChunkCount } : {}),
    ...(sourcePath ? { sourcePath } : {}),
    ...(contentPath ? { contentPath, path: contentPath } : {}),
    ...(contentKind ? { contentKind } : {}),
    ...(storageError ? { storageError } : {}),
    ...(indexError ? { indexError } : {}),
    ...(sourceMissing ? { sourceMissing: true } : {}),
    ...(contentEditedAt ? { contentEditedAt } : {}),
    ...(contentSize !== undefined ? { contentSize } : {}),
    ...(error ? { error } : {}),
  };
}

export function normalizeKnowledgeCollection(
  collection: unknown,
): Collection | null {
  if (!collection || typeof collection !== "object") return null;

  const raw = collection as Partial<Collection>;
  const id = trimString(
    raw.id,
    KNOWLEDGE_LIMITS.maxCollectionIdChars,
    uuidv7(),
  );
  const color = trimString(raw.color, KNOWLEDGE_LIMITS.maxCollectionColorChars);
  const icon = trimString(raw.icon, KNOWLEDGE_LIMITS.maxCollectionIconChars);
  const files = Array.isArray(raw.files)
    ? raw.files
        .map((file) => normalizeKnowledgeFile(file))
        .filter((file): file is KnowledgeFile => Boolean(file))
        .slice(0, KNOWLEDGE_LIMITS.maxFilesPerCollection)
    : [];

  return {
    id,
    name: trimString(
      raw.name,
      KNOWLEDGE_LIMITS.maxCollectionNameChars,
      "Untitled collection",
    ),
    description: trimString(
      raw.description,
      KNOWLEDGE_LIMITS.maxCollectionDescriptionChars,
    ),
    icon: COLLECTION_ICONS.has(icon) ? icon : "Folder",
    color: COLLECTION_COLORS.has(color) ? color : "blue",
    files,
    updatedAt: normalizeTimestamp(raw.updatedAt),
  };
}

export function normalizeKnowledgeCollections(
  collections: unknown,
): Collection[] {
  if (!Array.isArray(collections)) return [];

  const normalized: Collection[] = [];
  const seenIds = new Set<string>();

  for (const collection of collections) {
    const normalizedCollection = normalizeKnowledgeCollection(collection);
    if (!normalizedCollection || seenIds.has(normalizedCollection.id)) continue;

    normalized.push(normalizedCollection);
    seenIds.add(normalizedCollection.id);
    if (normalized.length >= KNOWLEDGE_LIMITS.maxCollections) break;
  }

  return normalized;
}
