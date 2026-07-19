export type KnowledgeFileStatus =
  "uploading" | "parsing" | "indexing" | "indexed" | "saved" | "error";

export type KnowledgeFileContentKind = "source_text" | "extracted_text";

export type KnowledgeFileStorageStatus =
  "uploading" | "parsing" | "saved" | "error";

export type KnowledgeFileIndexStatus =
  "not_indexed" | "indexing" | "indexed" | "error";

export interface KnowledgeFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
  /** @deprecated Use storageStatus and indexStatus for new code. */
  status: KnowledgeFileStatus;
  ragId?: string;
  ragChunkCount?: number;
  /** @deprecated Compatibility alias for contentPath. */
  path?: string;
  sourcePath?: string;
  contentPath?: string;
  contentKind?: KnowledgeFileContentKind;
  storageStatus?: KnowledgeFileStorageStatus;
  indexStatus?: KnowledgeFileIndexStatus;
  storageError?: string;
  indexError?: string;
  sourceMissing?: boolean;
  contentEditedAt?: number;
  contentSize?: number;
  /** @deprecated Compatibility summary of storageError or indexError. */
  error?: string;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  files: KnowledgeFile[];
  updatedAt: number;
}
