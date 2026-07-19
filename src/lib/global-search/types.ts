import type {
  Collection,
  MemoryRecord,
  Session,
  SessionMessageTree,
  Workspace,
} from "@/types";

export const GLOBAL_SEARCH_SOURCES = [
  "session",
  "knowledge",
  "workspace",
  "memory",
] as const;

export type GlobalSearchSource = (typeof GLOBAL_SEARCH_SOURCES)[number];
export type GlobalSearchRole = "user" | "model";
export type GlobalSearchSort = "relevance" | "newest" | "oldest";

export type GlobalSearchNavigationTarget =
  | { type: "session"; sessionId: string }
  | { type: "message"; sessionId: string; messageId: string }
  | { type: "knowledge"; collectionId: string; fileId?: string }
  | { type: "workspace"; workspaceId: string }
  | { type: "memory"; memoryId: string };

export interface GlobalSearchDocument {
  id: string;
  source: GlobalSearchSource;
  title: string;
  content: string;
  keywords: string[];
  updatedAt: number;
  workspaceId?: string;
  workspaceIds?: string[];
  role?: GlobalSearchRole;
  target: GlobalSearchNavigationTarget;
}

export interface GlobalSearchIndexError {
  source: GlobalSearchSource;
  id: string;
  message: string;
}

export interface GlobalSearchIndexStats {
  documents: number;
  sessions: number;
  messages: number;
  knowledgeFiles: number;
  workspaces: number;
  memories: number;
  indexedContentChars: number;
}

export interface GlobalSearchIndex {
  documents: GlobalSearchDocument[];
  builtAt: number;
  partial: boolean;
  errors: GlobalSearchIndexError[];
  stats: GlobalSearchIndexStats;
}

export interface GlobalSearchBuildProgress {
  phase: GlobalSearchSource;
  processed: number;
  total: number;
}

export interface GlobalSearchLimits {
  maxDocuments: number;
  maxMetadataDocuments: number;
  maxSingleContentChars: number;
  maxTotalContentChars: number;
  yieldEveryDocuments: number;
}

export interface KnowledgeContentReadResult {
  content: string;
  truncated?: boolean;
}

export interface GlobalSearchBuildInput {
  sessions: Session[];
  workspaces: Workspace[];
  knowledgeCollections: Collection[];
  memories: MemoryRecord[];
  loadSessionTree: (
    session: Session,
    signal?: AbortSignal,
  ) => Promise<SessionMessageTree | null | undefined>;
  readKnowledgeContent: (
    collection: Collection,
    file: Collection["files"][number],
    signal: AbortSignal | undefined,
    maxChars: number,
  ) => Promise<KnowledgeContentReadResult | null>;
  signal?: AbortSignal;
  sources?: GlobalSearchSource[];
  limits?: Partial<GlobalSearchLimits>;
  onProgress?: (progress: GlobalSearchBuildProgress) => void;
  now?: () => number;
}

export interface GlobalSearchFilters {
  sources?: GlobalSearchSource[];
  workspaceId?: string;
  roles?: GlobalSearchRole[];
  dateFrom?: number;
  dateTo?: number;
}

export interface GlobalSearchQueryOptions {
  filters?: GlobalSearchFilters;
  sort?: GlobalSearchSort;
  limit?: number;
}

export interface GlobalSearchResult {
  document: GlobalSearchDocument;
  score: number;
  snippet: string;
  matchedIn: "title" | "keywords" | "content";
}
