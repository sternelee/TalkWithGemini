import { SimpleRecursiveSplitter } from "../../utils/textSplitter";

export interface KnowledgeVectorItem {
  id: string;
  data: string;
  metadata: {
    fileId: string;
    fileName: string;
    collectionId: string;
    chunkIndex: number;
  };
}

interface BuildKnowledgeVectorItemsOptions {
  collectionId: string;
  fileName: string;
  ragFileId: string;
  textContent: string;
  chunkSize: number;
}

export function buildKnowledgeVectorItems({
  collectionId,
  fileName,
  ragFileId,
  textContent,
  chunkSize,
}: BuildKnowledgeVectorItemsOptions): KnowledgeVectorItem[] {
  const splitter = new SimpleRecursiveSplitter({
    chunkSize,
    chunkOverlap: Math.floor(chunkSize * 0.1),
  });

  return splitter.splitText(textContent).map((chunk, index) => ({
    id: `${ragFileId}_${index}`,
    data: chunk,
    metadata: {
      fileId: ragFileId,
      fileName,
      collectionId,
      chunkIndex: index,
    },
  }));
}

export function buildKnowledgeVectorIds(
  ragId: string,
  chunkCount: number,
): string[] {
  if (chunkCount <= 0) return [];

  return Array.from({ length: chunkCount }, (_, index) => `${ragId}_${index}`);
}
