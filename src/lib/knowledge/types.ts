export type KnowledgeFileStatus =
  "uploading" | "parsing" | "indexing" | "indexed" | "saved" | "error";

export interface KnowledgeFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
  status: KnowledgeFileStatus;
  ragId?: string;
  ragChunkCount?: number;
  path?: string;
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
