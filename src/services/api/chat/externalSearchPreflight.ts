import type {
  Attachment,
  ImageSource,
  Message,
  ModelMetadata,
  Source,
} from "@/types";
import {
  allocateContextBudget,
  trimTextToEstimatedTokens,
} from "@/lib/chat/contextBudget";
import { appendContextToChatInput } from "@/lib/utils/chatInput";
import { logDevWarn } from "@/lib/utils/devLogger";
import {
  buildSearchContextForPrompt,
  createSearchDecisionPrompt,
  parseSearchDecisionResult,
  type SearchDecision,
} from "@/lib/search/decision";

import { createSearchProvider } from "../searchService";
import {
  getAttachmentsContextLength,
  getMessagesContextLength,
} from "./contextLength";
import {
  resolveModelMetadata,
  resolveTextGenerationModel,
} from "./modelSelection";

export type SearchStatusResults = { sources: Source[]; images: ImageSource[] };

type SearchBlockUpdate = {
  isSearching?: boolean;
  error?: string;
  results?: {
    sources?: Source[];
    images?: ImageSource[];
  };
};

type GenerateText = (
  model: string,
  prompt: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
) => Promise<string>;

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof Error && error.name === "AbortError")
  );
}

async function decideExternalSearchUse({
  model,
  history,
  message,
  signal,
  generate,
}: {
  model: string;
  history: Message[];
  message: string;
  signal?: AbortSignal;
  generate: GenerateText;
}): Promise<SearchDecision> {
  try {
    const rawDecision = await generate(
      model,
      createSearchDecisionPrompt({ history, message }),
      () => {},
      signal,
    );
    return parseSearchDecisionResult(rawDecision, message);
  } catch (error) {
    if (isAbortError(error, signal)) throw error;
    logDevWarn("Search decision failed:", error);
    return { shouldSearch: false, query: message };
  }
}

export async function runExternalSearchPreflight({
  model,
  modelName,
  selectedModelMetadata,
  providers,
  history,
  newMessage,
  attachments,
  signal,
  generate,
  onSearchStatus,
  upsertSearchBlock,
  emitOutputBlocks,
}: {
  model: string;
  modelName: string;
  selectedModelMetadata?: ModelMetadata;
  providers: Array<{
    id: string;
    enabled?: boolean;
    models?: string[];
  }>;
  history: Message[];
  newMessage: string;
  attachments: Attachment[];
  signal?: AbortSignal;
  generate: GenerateText;
  onSearchStatus: (isSearching: boolean, results?: SearchStatusResults) => void;
  upsertSearchBlock: (update: SearchBlockUpdate) => void;
  emitOutputBlocks: () => void;
}): Promise<string> {
  let effectiveNewMessage = newMessage;
  let externalSearchStarted = false;

  try {
    const searchDecisionModel = resolveTextGenerationModel({
      selectedModel: model,
      selectedModelMetadata,
      providers,
    });
    if (!searchDecisionModel) {
      onSearchStatus(false, { sources: [], images: [] });
      return effectiveNewMessage;
    }

    const decision = await decideExternalSearchUse({
      model: searchDecisionModel,
      history,
      message: newMessage,
      signal,
      generate,
    });

    if (!decision.shouldSearch) {
      onSearchStatus(false, { sources: [], images: [] });
      return effectiveNewMessage;
    }

    upsertSearchBlock({ isSearching: true });
    externalSearchStarted = true;
    onSearchStatus(true);
    emitOutputBlocks();
    const searchResults = await createSearchProvider(
      { query: decision.query },
      signal,
    );
    upsertSearchBlock({
      isSearching: false,
      results: searchResults,
    });
    onSearchStatus(false, searchResults);
    emitOutputBlocks();

    if (searchResults.sources.length > 0 || searchResults.images.length > 0) {
      const searchContext = buildSearchContextForPrompt({
        sources: searchResults.sources,
        images: searchResults.images,
      });
      const metadata = resolveModelMetadata(modelName);
      const budget = allocateContextBudget({
        modelInputTokenLimit: metadata?.limit?.context,
        reservedOutputTokens: metadata?.limit?.output,
        sources: {
          history: getMessagesContextLength(history),
          attachments: getAttachmentsContextLength(attachments),
          search: searchContext.length,
        },
      });
      const boundedSearchContext = trimTextToEstimatedTokens(
        searchContext,
        budget.allocations.search.maxTokens,
      );

      if (boundedSearchContext) {
        effectiveNewMessage = appendContextToChatInput(
          newMessage,
          boundedSearchContext,
          { separator: "\n\n" },
        );
      }
    }
  } catch (searchError) {
    if (isAbortError(searchError, signal)) throw searchError;
    logDevWarn("Search preflight failed:", searchError);
    if (externalSearchStarted) {
      upsertSearchBlock({
        isSearching: false,
        results: { sources: [], images: [] },
        error: "Search provider failed",
      });
      emitOutputBlocks();
    }
    onSearchStatus(false, { sources: [], images: [] });
    if (externalSearchStarted) {
      throw new Error("Search provider failed");
    }
  }

  return effectiveNewMessage;
}
