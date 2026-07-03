import { v7 as uuidv7 } from "uuid";
import type { Attachment, Source } from "../../types";
import { generateRAGSearchQueries } from "../../services/api/chatService";
import { queryRAG } from "../../services/api/ragService";
import { resolveOPFSUrl } from "../../utils/opfs";
import {
  appendPlainPromptContext,
  appendPromptContextFile,
  createPromptContextBudget,
  escapePromptContextText,
} from "./promptContext";
import { PROMPT_CONTEXT_LIMITS } from "../../config/limits";
import { withResolvedObjectUrl } from "./objectUrlLifecycle";
import { logDevError } from "./devLogger";
import { hasRagVectorStore } from "../security/localSecretResolvers";
import {
  isKnowledgeCollectionAttachment,
  isKnowledgeFileAttachment,
  parseKnowledgeFileAttachmentData,
} from "./knowledgeAttachments";

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
): Promise<{
  convertedContent: string;
  finalAttachments: Attachment[];
  ragSources: Source[];
}> => {
  let convertedContent = "";
  const finalAttachments: Attachment[] = [];
  let ragSources: Source[] = [];
  const contextBudget = createPromptContextBudget();

  if (kbAttachments.length === 0) {
    return { convertedContent, finalAttachments, ragSources };
  }

  const isRagServiceEnabled = ragConfig.enabled && hasRagVectorStore(ragConfig);

  if (isRagServiceEnabled) {
    try {
      // 1. Generate search queries based on user input
      const queries = await generateRAGSearchQueries(text);

      if (queries && queries.length > 0) {
        // 2. Perform the search across all selected collections
        const collectionIds = Array.from(
          new Set(
            kbAttachments
              .filter(isKnowledgeCollectionAttachment)
              .map((a) => a.data)
              .filter((id): id is string => Boolean(id)),
          ),
        );

        const searchPromises: Promise<Source[]>[] = [];
        for (const query of queries) {
          for (const id of collectionIds) {
            searchPromises.push(queryRAG(query, id));
          }
        }

        const resultsParts = await Promise.all(searchPromises);
        const allResults = resultsParts.flat();

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
      logDevError("RAG Pre-flight failed:", e);
      convertedContent +=
        "\n\n[Knowledge Base Error]\nThe selected knowledge base could not be queried. Continue with the available conversation context and tell the user the knowledge lookup failed.\n";
    }
  }

  return { convertedContent, finalAttachments, ragSources };
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
