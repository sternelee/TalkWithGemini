import { v7 as uuidv7 } from "uuid";
import type { Attachment, Source } from "@/types";
import { generateRAGSearchQueries } from "@/services/api/chatService";
import { queryRAG } from "@/services/api/ragService";
import { resolveOPFSUrl } from "@/utils/opfs";
import {
  appendPlainPromptContext,
  appendPromptContextFile,
  createPromptContextBudget,
  escapePromptContextText,
} from "./promptContext";
import { PROMPT_CONTEXT_LIMITS } from "@/config/limits";
import { withResolvedObjectUrl } from "./objectUrlLifecycle";
import { logDevError } from "./devLogger";
import { hasRagVectorStore } from "../security/localSecretResolvers";
import {
  isKnowledgeCollectionAttachment,
  isKnowledgeFileAttachment,
  parseKnowledgeFileAttachmentData,
} from "./knowledgeAttachments";
import { mapSettledWithConcurrency } from "./concurrency";

const RAG_QUERY_CONCURRENCY = 4;

type IndexedKnowledgeFileSelector = {
  collectionId: string;
  fileId: string;
};

export interface RagQueryError {
  message: string;
  code: "RAG_QUERY_FAILED";
}

/**
 * Citation instructions for Knowledge Base usage
 */
export const CITATION_INSTRUCTION = `
### Guidelines:

- If you don't know the answer, clearly state that.
- If uncertain, ask the user for clarification.
- Respond in the same language as the user's query.
- If the context is unreadable or of poor quality, inform the user and provide the best possible answer.
- If the answer isn't present in the context but you possess the knowledge, explain this to the user and provide the answer using your own understanding.
- Ensure citations are concise and directly related to the information provided.

### Example of Footnotes:

If the user asks about a specific topic and the information is found in a source, the response should include the citation like in the following example:

"According to the study, the proposed method increases efficiency by 20% [^1]."

[^1]: Title of Source
`;

function getSourceMetadataString(source: Source, key: string): string {
  const value = source.metadata?.[key];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function getKnowledgeFile(
  attachment: Attachment,
  knowledgeCollections: any[],
): any | null {
  const fileData = parseKnowledgeFileAttachmentData(attachment);
  if (!fileData) return null;

  const collection = knowledgeCollections.find(
    (item) => item.id === fileData.collectionId,
  );
  return (
    collection?.files?.find((item: any) => item.id === fileData.fileId) || null
  );
}

export function isIndexedKnowledgeFileAttachment(
  attachment: Attachment,
  knowledgeCollections: any[],
): boolean {
  const file = getKnowledgeFile(attachment, knowledgeCollections);
  return file?.status === "indexed" && typeof file.ragId === "string";
}

function getIndexedKnowledgeFileSelectors(
  kbAttachments: Attachment[],
  knowledgeCollections: any[],
): IndexedKnowledgeFileSelector[] {
  const selectors: IndexedKnowledgeFileSelector[] = [];

  for (const attachment of kbAttachments) {
    if (!isKnowledgeFileAttachment(attachment)) continue;
    const fileData = parseKnowledgeFileAttachmentData(attachment);
    if (!fileData) continue;

    const file = getKnowledgeFile(attachment, knowledgeCollections);
    if (file?.status !== "indexed" || typeof file.ragId !== "string") {
      continue;
    }

    selectors.push({
      collectionId: fileData.collectionId,
      fileId: file.ragId,
    });
  }

  return selectors;
}

function sourceMatchesSelectedRagScope(
  source: Source,
  collectionIds: Set<string>,
  fileIdsByCollectionId: Map<string, Set<string>>,
): boolean {
  const collectionId = getSourceMetadataString(source, "collectionId");
  if (collectionIds.has(collectionId)) return true;

  const selectedFileIds = fileIdsByCollectionId.get(collectionId);
  if (!selectedFileIds) return false;

  const fileId = getSourceMetadataString(source, "fileId");
  return selectedFileIds.has(fileId);
}

/**
 * Process RAG (Retrieval-Augmented Generation) attachments
 */
export const processRAGAttachments = async (
  text: string,
  kbAttachments: Attachment[],
  ragConfig: {
    enabled: boolean;
    url?: string;
    token?: string;
    tokenSecret?: unknown;
    useDefaultVectorStore?: boolean;
    serverVectorStoreAvailable?: boolean;
  },
  supportAttachment: boolean,
  knowledgeCollections: any[] = [],
  signal?: AbortSignal,
): Promise<{
  convertedContent: string;
  finalAttachments: Attachment[];
  ragSources: Source[];
  ragError?: RagQueryError;
}> => {
  let convertedContent = "";
  const finalAttachments: Attachment[] = [];
  let ragSources: Source[] = [];
  let ragError: RagQueryError | undefined;
  const contextBudget = createPromptContextBudget();

  if (kbAttachments.length === 0) {
    return { convertedContent, finalAttachments, ragSources };
  }

  const isRagServiceEnabled = ragConfig.enabled && hasRagVectorStore(ragConfig);

  if (isRagServiceEnabled) {
    try {
      const selectedCollectionIds = new Set(
        kbAttachments
          .filter(isKnowledgeCollectionAttachment)
          .map((a) => a.data)
          .filter((id): id is string => Boolean(id)),
      );
      const indexedFileSelectors = getIndexedKnowledgeFileSelectors(
        kbAttachments,
        knowledgeCollections,
      );
      const indexedFileIdsByCollectionId = new Map<string, Set<string>>();
      for (const selector of indexedFileSelectors) {
        if (!indexedFileIdsByCollectionId.has(selector.collectionId)) {
          indexedFileIdsByCollectionId.set(selector.collectionId, new Set());
        }
        indexedFileIdsByCollectionId
          .get(selector.collectionId)
          ?.add(selector.fileId);
      }
      const queryCollectionIds = new Set([
        ...selectedCollectionIds,
        ...indexedFileSelectors.map((selector) => selector.collectionId),
      ]);

      if (queryCollectionIds.size === 0) {
        return { convertedContent, finalAttachments, ragSources };
      }

      // 1. Generate search queries based on user input
      const queries = await generateRAGSearchQueries(text, signal);

      if (queries && queries.length > 0) {
        // 2. Perform the search across all selected collections
        const collectionIds = Array.from(queryCollectionIds);

        const searchRequests: Array<{ query: string; collectionId: string }> =
          [];
        for (const query of queries) {
          for (const id of collectionIds) {
            searchRequests.push({ query, collectionId: id });
          }
        }

        const settledResults = await mapSettledWithConcurrency<
          { query: string; collectionId: string },
          Source[]
        >(searchRequests, RAG_QUERY_CONCURRENCY, ({ query, collectionId }) => {
          signal?.throwIfAborted();
          const request = signal
            ? queryRAG(query, collectionId, signal)
            : queryRAG(query, collectionId);
          return request.then((sources) =>
            sources.map((source): Source => ({
              ...source,
              metadata: {
                ...(source.metadata || {}),
                collectionId:
                  getSourceMetadataString(source, "collectionId") ||
                  collectionId,
              },
            })),
          );
        });
        signal?.throwIfAborted();
        const successfulResults = settledResults.filter(
          (result): result is PromiseFulfilledResult<Source[]> =>
            result.status === "fulfilled",
        );
        const failedResults = settledResults.filter(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        );
        if (successfulResults.length === 0 && failedResults.length > 0) {
          throw failedResults[0].reason;
        }
        failedResults.forEach((result) => {
          logDevError(
            "RAG query failed; preserving partial results",
            result.reason,
          );
        });

        const allResults = successfulResults
          .map((result) => result.value)
          .flat()
          .filter((source) =>
            sourceMatchesSelectedRagScope(
              source,
              selectedCollectionIds,
              indexedFileIdsByCollectionId,
            ),
          );

        // Deduplicate results based on content
        const uniqueResults = new Map<string, Source>();
        allResults.forEach((res) => {
          const key = res.content.slice(0, 100);
          if (!uniqueResults.has(key)) {
            uniqueResults.set(key, res);
          }
        });

        const finalResults = Array.from(uniqueResults.values());
        ragSources = finalResults;

        if (finalResults.length > 0) {
          const ragContextParts: string[] = [];
          for (let i = 0; i < finalResults.length; i++) {
            const result = finalResults[i];
            const title =
              typeof result.title === "string"
                ? result.title.slice(
                    0,
                    PROMPT_CONTEXT_LIMITS.maxSourceTitleChars,
                  )
                : "";
            const content =
              typeof result.content === "string"
                ? result.content.slice(
                    0,
                    PROMPT_CONTEXT_LIMITS.maxSourceContentChars,
                  )
                : "";

            const entry = `${i > 0 ? "\n\n" : ""}[Source ${
              i + 1
            }]\nTitle: ${title}\nContent:\n${content}`;
            if (
              !appendPlainPromptContext(ragContextParts, contextBudget, entry)
            ) {
              break;
            }
          }

          const ragContextStr = ragContextParts.join("");
          const textContent = btoa(unescape(encodeURIComponent(ragContextStr)));

          if (supportAttachment) {
            finalAttachments.push({
              id: uuidv7(),
              mimeType: "text/plain",
              fileName: "knowledge_base_context.txt",
              data: textContent,
            });
            convertedContent += `\n\nRefer to the attached "knowledge_base_context.txt" for background information.\n${CITATION_INSTRUCTION}`;
          } else {
            const parts: string[] = [];
            const budget = createPromptContextBudget();
            appendPromptContextFile(parts, budget, {
              fileName: "knowledge_base_context.txt",
              mimeType: "text/plain",
              content: ragContextStr,
            });
            appendPlainPromptContext(
              parts,
              budget,
              `\n${CITATION_INSTRUCTION}`,
            );
            convertedContent += parts.join("");
          }
        }
      }
    } catch (e) {
      if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) {
        throw e;
      }
      logDevError("RAG Pre-flight failed:", e);
      ragError = {
        code: "RAG_QUERY_FAILED",
        message: "The selected knowledge base could not be queried.",
      };
      convertedContent +=
        "\n\n[Knowledge Base Error]\nThe selected knowledge base could not be queried. Continue with the available conversation context and tell the user the knowledge lookup failed.\n";
    }
  }

  return { convertedContent, finalAttachments, ragSources, ragError };
};

/**
 * Process local Knowledge Base attachments (when RAG service is not enabled)
 */
export const processLocalKBAttachments = async (
  kbAttachments: Attachment[],
  knowledgeCollections: any[],
  supportAttachment: boolean,
): Promise<{
  convertedContent: string;
  finalAttachments: Attachment[];
}> => {
  let convertedContent = "";
  const finalAttachments: Attachment[] = [];
  let addedLocalContext = false;
  const contextBudget = createPromptContextBudget();
  const addedFileKeys = new Set<string>();

  const readKnowledgeFile = async (file: any) => {
    if (!file.path) return null;
    return withResolvedObjectUrl({
      source: file.path,
      resolveObjectUrl: resolveOPFSUrl,
      read: async (blobUrl) => {
        const response = await fetch(blobUrl);
        return response.text();
      },
    });
  };

  const appendKnowledgeFile = async (
    collectionParts: string[] | null,
    file: any,
  ) => {
    const fileKey = file.id || file.path || file.name;
    if (!fileKey || addedFileKeys.has(fileKey)) return false;
    addedFileKeys.add(fileKey);

    try {
      const textContent = await readKnowledgeFile(file);

      if (textContent !== null) {
        if (supportAttachment) {
          const boundedTextContent =
            textContent.length > PROMPT_CONTEXT_LIMITS.maxSingleFileContentChars
              ? `${textContent.slice(
                  0,
                  PROMPT_CONTEXT_LIMITS.maxSingleFileContentChars,
                )}\n[Content truncated to fit prompt context limits.]`
              : textContent;
          const base64Data = btoa(
            unescape(encodeURIComponent(boundedTextContent)),
          );
          finalAttachments.push({
            id: uuidv7(),
            mimeType: "text/plain",
            fileName: file.name,
            data: base64Data,
          });
          return true;
        }

        if (collectionParts) {
          const beforeCount = collectionParts.length;
          appendPromptContextFile(collectionParts, contextBudget, {
            fileName: file.name,
            mimeType: file.type,
            content: textContent,
          });
          return collectionParts.length > beforeCount;
        }
      }
    } catch (e) {
      logDevError(`Failed to read file ${file.name} from KB`, e);
    }

    return false;
  };

  for (const kb of kbAttachments) {
    if (!isKnowledgeCollectionAttachment(kb)) continue;

    const collectionId = kb.data;
    const collection = knowledgeCollections.find((c) => c.id === collectionId);

    if (collection) {
      const sortedFiles = [...collection.files]
        .sort((a, b) => b.uploadedAt - a.uploadedAt)
        .slice(0, 10);

      if (sortedFiles.length > 0) {
        const collectionParts: string[] = [];
        if (!supportAttachment) {
          const safeCollectionName = escapePromptContextText(
            collection.name,
            PROMPT_CONTEXT_LIMITS.maxFileNameChars,
          ).text;

          appendPlainPromptContext(
            collectionParts,
            contextBudget,
            `\n\n--- Knowledge Base: ${safeCollectionName || "Untitled collection"} ---\n`,
          );
        }

        for (const file of sortedFiles) {
          const appended = await appendKnowledgeFile(collectionParts, file);
          addedLocalContext = addedLocalContext || appended;
        }
        if (!supportAttachment && collectionParts.length > 1) {
          appendPlainPromptContext(
            collectionParts,
            contextBudget,
            "--- End Knowledge Base ---\n",
          );
          convertedContent += collectionParts.join("");
        }
      }
    }
  }

  for (const kb of kbAttachments) {
    if (!isKnowledgeFileAttachment(kb)) continue;
    const fileData = parseKnowledgeFileAttachmentData(kb);
    if (!fileData) continue;

    const collection = knowledgeCollections.find(
      (c) => c.id === fileData.collectionId,
    );
    const file = collection?.files?.find(
      (item: any) => item.id === fileData.fileId,
    );
    if (!file) continue;

    const fileParts: string[] = [];
    const appended = await appendKnowledgeFile(
      supportAttachment ? null : fileParts,
      file,
    );
    addedLocalContext = addedLocalContext || appended;
    if (!supportAttachment && fileParts.length > 0) {
      convertedContent += fileParts.join("");
    }
  }

  if (addedLocalContext) {
    convertedContent += `\n${CITATION_INSTRUCTION}`;
  }

  return { convertedContent, finalAttachments };
};
