import { v7 as uuidv7 } from "uuid";
import type { Attachment, Message, Source } from "../../types";
import type { ModelInfo } from "@/services/api/chatService";
import {
  isIndexedKnowledgeFileAttachment,
  processRAGAttachments,
  processLocalKBAttachments,
} from "../utils/rag";
import {
  separateKBAttachments,
  processAttachmentsForModel,
} from "../utils/attachments";
import {
  createKnowledgeCollectionAttachment,
  getKnowledgeAttachmentSelectionKey,
  isKnowledgeFileAttachment,
} from "../utils/knowledgeAttachments";
import { parseModelString } from "../utils/model";
import { resolveOPFSUrl } from "../../utils/opfs";
import { appendContextToChatInput } from "../utils/chatInput";
import { hasRagVectorStore } from "../security/localSecretResolvers";

export interface ProcessMessageOptions {
  text: string;
  attachments: Attachment[];
  selectedModel: string;
  modelMetadata: Record<string, any>;
  customModelMetadata: Record<string, any>;
  ragConfig: {
    enabled: boolean;
    url?: string;
    token?: string;
    tokenSecret?: unknown;
    useDefaultVectorStore?: boolean;
    serverVectorStoreAvailable?: boolean;
  };
  knowledgeCollections: any[];
  workspaceKnowledgeCollectionIds?: string[];
}

export interface ProcessedMessageData {
  finalText: string;
  finalAttachments: Attachment[];
  ragSources: Source[];
  userMessage: Message;
}

/**
 * Process message and attachments before sending to LLM
 */
export async function processMessageForSending(
  options: ProcessMessageOptions,
): Promise<ProcessedMessageData> {
  const {
    text,
    attachments,
    selectedModel,
    modelMetadata,
    customModelMetadata,
    ragConfig,
    knowledgeCollections,
    workspaceKnowledgeCollectionIds = [],
  } = options;

  let finalText = text;
  let convertedContent = "";
  let ragSources: Source[] = [];
  const finalAttachments: Attachment[] = [];

  // Separate KB and other attachments
  const { kbAttachments, otherAttachments } =
    separateKBAttachments(attachments);
  const workspaceKBAttachments = workspaceKnowledgeCollectionIds.map((id) => {
    const collection = knowledgeCollections.find((item) => item.id === id);
    return createKnowledgeCollectionAttachment({
      collectionId: id,
      collectionName: collection?.name || id,
    });
  });
  const allKBAttachments: Attachment[] = [];
  const seenKnowledgeKeys = new Set<string>();
  for (const attachment of [...kbAttachments, ...workspaceKBAttachments]) {
    const key = getKnowledgeAttachmentSelectionKey(attachment);
    if (!key || seenKnowledgeKeys.has(key)) continue;
    seenKnowledgeKeys.add(key);
    allKBAttachments.push(attachment);
  }

  // Check model capability
  const { modelName: modelId } = parseModelString(selectedModel);
  const meta = customModelMetadata[modelId] || modelMetadata[modelId];
  const supportAttachment = meta ? (meta.attachment ?? false) : true;

  // Process RAG attachments
  const hasKB = allKBAttachments.length > 0;
  const isRagServiceEnabled = ragConfig.enabled && hasRagVectorStore(ragConfig);

  if (hasKB && isRagServiceEnabled) {
    const fileAttachments = allKBAttachments.filter(isKnowledgeFileAttachment);

    const ragResult = await processRAGAttachments(
      text,
      allKBAttachments,
      ragConfig,
      supportAttachment,
      knowledgeCollections,
    );
    convertedContent += ragResult.convertedContent;
    finalAttachments.push(...ragResult.finalAttachments);
    ragSources = ragResult.ragSources;

    const localFileAttachments = fileAttachments.filter(
      (attachment) =>
        !isIndexedKnowledgeFileAttachment(attachment, knowledgeCollections),
    );
    if (localFileAttachments.length > 0) {
      const localResult = await processLocalKBAttachments(
        localFileAttachments,
        knowledgeCollections,
        supportAttachment,
      );
      convertedContent += localResult.convertedContent;
      finalAttachments.push(...localResult.finalAttachments);
    }
  } else if (hasKB && !isRagServiceEnabled) {
    const localResult = await processLocalKBAttachments(
      allKBAttachments,
      knowledgeCollections,
      supportAttachment,
    );
    convertedContent += localResult.convertedContent;
    finalAttachments.push(...localResult.finalAttachments);
  }

  // Process other attachments
  const attachmentResult = await processAttachmentsForModel(
    otherAttachments,
    supportAttachment,
    resolveOPFSUrl,
  );
  finalAttachments.push(...attachmentResult.finalAttachments);
  convertedContent += attachmentResult.convertedContent;

  // Combine text with converted content
  finalText = appendContextToChatInput(finalText, convertedContent);

  // Create user message
  const userMessage: Message = {
    id: uuidv7(),
    role: "user",
    content: text,
    timestamp: Date.now(),
    attachments: attachments,
  };

  return {
    finalText,
    finalAttachments,
    ragSources,
    userMessage,
  };
}

/**
 * Create initial bot message placeholder
 */
export function createBotMessagePlaceholder(
  modelDisplayName: string,
  ragSources: Source[],
): Message {
  const botMsgId = uuidv7();
  const startTime = Date.now();

  return {
    id: botMsgId,
    role: "model",
    content: "",
    reasoning: "",
    timestamp: startTime,
    model: modelDisplayName,
    ragSources: ragSources.length > 0 ? ragSources : undefined,
    isSearching: false,
  };
}

/**
 * Get model display name from available models
 */
export function getModelDisplayName(
  selectedModel: string,
  availableModels: ModelInfo[],
): string {
  const currentModelInfo = availableModels.find(
    (m) => m.name === selectedModel,
  );
  return currentModelInfo?.displayName || selectedModel;
}
