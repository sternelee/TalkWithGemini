import { v7 as uuidv7 } from "uuid";
import { KNOWLEDGE_LIMITS } from "../../config/limits";
import type {
  Collection,
  KnowledgeFile,
  KnowledgeFileStatus,
} from "../../types";

const VALID_FILE_STATUSES = new Set<KnowledgeFileStatus>([
  "uploading",
  "parsing",
  "indexing",
  "indexed",
  "saved",
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
  const status = VALID_FILE_STATUSES.has(raw.status as KnowledgeFileStatus)
    ? (raw.status as KnowledgeFileStatus)
    : "saved";
  const ragId = trimString(raw.ragId, KNOWLEDGE_LIMITS.maxRagIdChars);
  const path = trimString(raw.path, KNOWLEDGE_LIMITS.maxPathChars);
  const error = trimString(raw.error, KNOWLEDGE_LIMITS.maxErrorChars);
  const ragChunkCount = normalizeRagChunkCount(raw.ragChunkCount);

  return {
    id,
    name,
    size: normalizeSize(raw.size),
    type,
    uploadedAt: normalizeTimestamp(raw.uploadedAt),
    status,
    ...(ragId ? { ragId } : {}),
    ...(ragChunkCount !== undefined ? { ragChunkCount } : {}),
    ...(path ? { path } : {}),
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
