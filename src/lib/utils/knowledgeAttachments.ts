import { v7 as uuidv7 } from "uuid";
import type { Attachment } from "../../types";

export const KNOWLEDGE_COLLECTION_MIME = "application/vnd.neo-chat.collection";
export const KNOWLEDGE_FILE_MIME = "application/vnd.neo-chat.knowledge-file";

export interface KnowledgeFileAttachmentData {
  collectionId: string;
  fileId: string;
}

export function createKnowledgeCollectionAttachment({
  collectionId,
  collectionName,
}: {
  collectionId: string;
  collectionName: string;
}): Attachment {
  return {
    id: uuidv7(),
    mimeType: KNOWLEDGE_COLLECTION_MIME,
    data: collectionId,
    fileName: collectionName,
  };
}

export function createKnowledgeFileAttachment({
  collectionId,
  fileId,
  fileName,
}: {
  collectionId: string;
  fileId: string;
  fileName: string;
}): Attachment {
  return {
    id: uuidv7(),
    mimeType: KNOWLEDGE_FILE_MIME,
    data: JSON.stringify({ collectionId, fileId }),
    fileName,
  };
}

export function isKnowledgeCollectionAttachment(attachment: Attachment) {
  return attachment.mimeType === KNOWLEDGE_COLLECTION_MIME;
}

export function isKnowledgeFileAttachment(attachment: Attachment) {
  return attachment.mimeType === KNOWLEDGE_FILE_MIME;
}

export function isKnowledgeAttachment(attachment: Attachment) {
  return (
    isKnowledgeCollectionAttachment(attachment) ||
    isKnowledgeFileAttachment(attachment)
  );
}

export function parseKnowledgeFileAttachmentData(
  attachment: Attachment,
): KnowledgeFileAttachmentData | null {
  if (!isKnowledgeFileAttachment(attachment) || !attachment.data) return null;

  try {
    const parsed = JSON.parse(
      attachment.data,
    ) as Partial<KnowledgeFileAttachmentData>;
    if (
      typeof parsed.collectionId !== "string" ||
      !parsed.collectionId.trim() ||
      typeof parsed.fileId !== "string" ||
      !parsed.fileId.trim()
    ) {
      return null;
    }
    return {
      collectionId: parsed.collectionId,
      fileId: parsed.fileId,
    };
  } catch {
    return null;
  }
}

export function getKnowledgeAttachmentSelectionKey(
  attachment: Attachment,
): string | null {
  if (isKnowledgeCollectionAttachment(attachment)) {
    return attachment.data ? `collection:${attachment.data}` : null;
  }

  const fileData = parseKnowledgeFileAttachmentData(attachment);
  if (!fileData) return null;
  return `file:${fileData.collectionId}:${fileData.fileId}`;
}
