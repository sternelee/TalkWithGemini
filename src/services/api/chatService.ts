import {
  Message,
  Attachment,
  ChatConfig,
  ImageSource,
  ModelMetadata,
  Session,
  MessageOutputBlock,
  Source,
  ToolCall,
} from "@/types";
import { useSettingsStore, getTaskModel } from "@/store/core/settingsStore";
import { useCoreSettingsStore } from "@/store/core/coreSettingsStore";
import { useMemoryStore } from "@/store/core/memoryStore";
import { v7 as uuidv7 } from "uuid";
import { executePluginFunction } from "@/utils/pluginUtils";
import { createSearchProvider } from "./searchService";
import { getEnabledPluginFunctions } from "@/lib/plugin/resolve";
import { parseModelString } from "@/lib/utils/model";
import { normalizeSessionTitle } from "@/lib/chat/entities";
import { appendContextToChatInput } from "@/lib/utils/chatInput";
import { appendDiagramRequestInstructions } from "../../lib/chat/diagramPrompt";
import { appendHtmlVisualRequestInstructions } from "../../lib/chat/htmlVisualPrompt";
import {
  getSearchCompatibility,
  getSearchCompatibilityErrorMessage,
} from "@/lib/settings/searchRag";
import { createMessageOutputBlockBuilder } from "../../lib/chat/messageOutputBlocks";
import {
  buildSearchContextForPrompt,
  createSearchDecisionPrompt,
  parseSearchDecisionResult,
  type SearchDecision,
} from "../../lib/search/decision";
import {
  createContextCompressionSummaryPrompt,
  mergeCompressedContent,
  normalizeCompressedContent,
  textToBase64,
} from "@/lib/utils/contextCompression";
import {
  getResponseErrorMessage,
  readJsonResponseOrThrow,
} from "../../lib/api/client";
import {
  buildProviderRuntimeConfig,
  fetchWithByokRetry,
} from "../../lib/byok/client";
import {
  allocateContextBudget,
  trimTextToEstimatedTokens,
} from "../../lib/chat/contextBudget";
import {
  parseMemoryDreamToolCall,
  parseMemoryRecordToolCall,
  searchMemoryRecords,
  shouldExposeMemorySearchTool,
} from "../../lib/memory/entities";
import {
  createMemoryDreamPrompt,
  createMemoryExtractionPrompt,
  formatMemoryToolResult,
  MEMORY_DREAM_TOOL,
  MEMORY_DREAM_TOOL_NAME,
  MEMORY_RECORD_TOOL,
  MEMORY_RECORD_TOOL_NAME,
  MEMORY_SEARCH_TOOL,
  MEMORY_SEARCH_TOOL_NAME,
} from "../../lib/memory/tools";
import { logDevError, logDevWarn } from "../../lib/utils/devLogger";
import { MEMORY_LIMITS, PLUGIN_EXECUTION_LIMITS } from "../../config/limits";

type SearchStatusResults = { sources: Source[]; images: ImageSource[] };
type ChatUsagePayload = { usage?: unknown; usageMetadata?: unknown };
type ChatToolDefinition = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
};

function coerceToolDefinition(tool: unknown): ChatToolDefinition {
  return tool as ChatToolDefinition;
}

function isBrowserMemoryStorePendingHydration(hasHydrated: boolean): boolean {
  return typeof window !== "undefined" && !hasHydrated;
}

function isMemorySearchEnabled(): boolean {
  const { _hasHydrated, settings } = useMemoryStore.getState();
  return Boolean(
    !isBrowserMemoryStorePendingHydration(_hasHydrated) &&
    settings.enabled &&
    settings.searchEnabled,
  );
}

function addInternalMemoryTools(
  tools: ChatToolDefinition[],
  toolNames: Set<string>,
  message: string,
): void {
  if (!isMemorySearchEnabled()) return;
  if (!shouldExposeMemorySearchTool(message)) return;
  tools.push(coerceToolDefinition(MEMORY_SEARCH_TOOL));
  toolNames.add(MEMORY_SEARCH_TOOL_NAME);
}

function isInternalMemoryTool(name: string | undefined): boolean {
  return name === MEMORY_SEARCH_TOOL_NAME;
}

function getNumberArg(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function executeMemorySearchTool(args: unknown): Promise<unknown> {
  const state = useMemoryStore.getState();
  const { _hasHydrated, settings, memories } = state;
  if (
    isBrowserMemoryStorePendingHydration(_hasHydrated) ||
    !settings.enabled ||
    !settings.searchEnabled
  ) {
    return { memories: [] };
  }

  const input =
    args && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};
  const query =
    typeof input.query === "string" && input.query.trim() ? input.query : "";
  const limit = getNumberArg(input.limit, MEMORY_LIMITS.defaultSearchResults);
  const results = searchMemoryRecords(memories, query, limit);
  state.markMemoriesUsed(results.map((memory) => memory.id));
  return formatMemoryToolResult(results);
}

function resolveModelMetadata(modelName: string): ModelMetadata | undefined {
  const { modelMetadata, customModelMetadata } = useSettingsStore.getState();
  return customModelMetadata[modelName] || modelMetadata[modelName];
}

function getMessagesContextLength(messages: Message[]): number {
  return messages.reduce((sum, message) => {
    const attachmentLength =
      message.attachments?.reduce(
        (attachmentSum, attachment) =>
          attachmentSum +
          (attachment.fileName?.length || 0) +
          (attachment.data?.length || 0) +
          (attachment.url?.length || 0),
        0,
      ) || 0;

    return (
      sum +
      message.content.length +
      (message.reasoning?.length || 0) +
      attachmentLength
    );
  }, 0);
}

function getAttachmentsContextLength(attachments: Attachment[]): number {
  return attachments.reduce(
    (sum, attachment) =>
      sum +
      (attachment.fileName?.length || 0) +
      (attachment.data?.length || 0) +
      (attachment.url?.length || 0),
    0,
  );
}

async function decideExternalSearchUse({
  model,
  history,
  message,
  signal,
}: {
  model: string;
  history: Message[];
  message: string;
  signal?: AbortSignal;
}): Promise<SearchDecision> {
  try {
    const rawDecision = await streamGenerateContent(
      model,
      createSearchDecisionPrompt({ history, message }),
      () => {},
      signal,
    );
    return parseSearchDecisionResult(rawDecision, message);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    logDevWarn("Search decision failed:", error);
    return { shouldSearch: false, query: message };
  }
}

export const executeCode = async (
  modelString: string,
  code: string,
): Promise<string> => {
  const { providerId, modelName } = parseModelString(modelString);

  const { providers } = useCoreSettingsStore.getState();
  const provider = providerId
    ? providers.find((p) => p.id === providerId)
    : providers.find((p) => p.enabled);

  if (!provider) throw new Error("No provider found");

  try {
    const response = await fetchWithByokRetry(async () =>
      fetch("/api/chat/execute-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: await buildProviderRuntimeConfig(provider),
          modelName,
          code,
        }),
      }),
    );

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "Code execution failed"),
      );
    }

    const data = await readJsonResponseOrThrow<{
      output?: string;
      error?: string;
    }>(response, "Code execution failed");
    return data.output || data.error || "No output.";
  } catch (error) {
    logDevError("Code execution error:", error);
    return `Error: ${error instanceof Error ? error.message : String(error)}`;
  }
};

export const generateChatTitle = async (
  history: Message[],
): Promise<string> => {
  const fallbackTitle = () =>
    normalizeSessionTitle(history.find((m) => m.role === "user")?.content);
  const { providers } = useCoreSettingsStore.getState();
  const provider = providers.find((p) => p.enabled);

  if (!provider) return fallbackTitle();

  // Get task model from settings using helper function
  const modelString = getTaskModel("titleGeneration");

  const { providerId, modelName } = parseModelString(modelString);

  const targetProvider = providerId
    ? providers.find((p) => p.id === providerId)
    : provider;

  if (!targetProvider) return fallbackTitle();

  try {
    const response = await fetchWithByokRetry(async () =>
      fetch("/api/chat/generate-title", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: await buildProviderRuntimeConfig(targetProvider),
          modelName,
          history,
        }),
      }),
    );

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "Title generation failed"),
      );
    }

    const data = await readJsonResponseOrThrow<{ title?: string }>(
      response,
      "Title generation failed",
    );
    return normalizeSessionTitle(data.title);
  } catch (error) {
    logDevError("Title generation error:", error);
    return fallbackTitle();
  }
};

export const generateRelatedQuestions = async (
  history: Message[],
): Promise<string[]> => {
  const { providers } = useCoreSettingsStore.getState();
  const provider = providers.find((p) => p.enabled);

  if (!provider) return [];

  // Get task model from settings using helper function
  const modelString = getTaskModel("relatedQuestions");

  const { providerId, modelName } = parseModelString(modelString);

  const targetProvider = providerId
    ? providers.find((p) => p.id === providerId)
    : provider;

  if (!targetProvider) return [];

  try {
    const response = await fetchWithByokRetry(async () =>
      fetch("/api/chat/related-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: await buildProviderRuntimeConfig(targetProvider),
          modelName,
          history,
        }),
      }),
    );

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(
          response,
          "Related questions generation failed",
        ),
      );
    }

    const data = await readJsonResponseOrThrow<{ questions?: string[] }>(
      response,
      "Related questions generation failed",
    );
    return data.questions || [];
  } catch (error) {
    logDevError("Related questions error:", error);
    return [];
  }
};

export const generateRAGSearchQueries = async (
  userPrompt: string,
): Promise<string[]> => {
  const { providers } = useCoreSettingsStore.getState();
  const provider = providers.find((p) => p.enabled);

  if (!provider) return [userPrompt];

  // Get task model from settings using helper function
  const modelString = getTaskModel("ragQuery");

  const { providerId, modelName } = parseModelString(modelString);

  const targetProvider = providerId
    ? providers.find((p) => p.id === providerId)
    : provider;

  if (!targetProvider) return [userPrompt];

  try {
    const response = await fetchWithByokRetry(async () =>
      fetch("/api/chat/rag-queries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: await buildProviderRuntimeConfig(targetProvider),
          modelName,
          userMessage: userPrompt,
        }),
      }),
    );

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(
          response,
          "RAG queries generation failed",
        ),
      );
    }

    const data = await readJsonResponseOrThrow<{ queries?: string[] }>(
      response,
      "RAG queries generation failed",
    );
    return data.queries || [userPrompt];
  } catch (error) {
    logDevError("RAG queries error:", error);
    return [userPrompt];
  }
};

export const generateImage = async (
  modelString: string,
  prompt: string,
): Promise<{ images: Attachment[]; message: string }> => {
  const { providerId, modelName } = parseModelString(modelString);

  const { providers } = useCoreSettingsStore.getState();
  const provider = providerId
    ? providers.find((p) => p.id === providerId)
    : providers.find((p) => p.enabled);

  if (!provider) throw new Error("No provider found");

  try {
    const response = await fetchWithByokRetry(async () =>
      fetch("/api/chat/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: await buildProviderRuntimeConfig(provider),
          modelName,
          prompt,
        }),
      }),
    );

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "Image generation failed"),
      );
    }

    const data = await readJsonResponseOrThrow<{
      images?: Attachment[];
      message?: string;
    }>(response, "Image generation failed");
    return {
      images: data.images || [],
      message: data.message || "No images generated.",
    };
  } catch (error) {
    logDevError("Image generation error:", error);
    throw error;
  }
};

// Export types
export interface ModelInfo {
  name: string;
  displayName: string;
  description: string;
  providerName?: string;
}

// Stream chat response from backend API
export const streamChatResponse = async (
  _sessionId: string, // Prefixed with _ to indicate intentionally unused
  model: string,
  history: Message[],
  newMessage: string,
  attachments: Attachment[],
  config: Partial<ChatConfig>,
  onChunk: (
    text: string,
    reasoning?: string,
    outputBlocks?: MessageOutputBlock[],
  ) => void,
  userSystemInstruction?: string,
  onSearchStatus?: (
    isSearching: boolean,
    results?: SearchStatusResults,
  ) => void,
  onToolUpdate?: (toolCalls: ToolCall[]) => void,
  onImage?: (images: Attachment[]) => void,
  onUsage?: (usage: ChatUsagePayload) => void,
  signal?: AbortSignal,
  activePlugins?: string[], // Add activePlugins parameter
  skillsContext?: string,
  onOutputBlocks?: (outputBlocks: MessageOutputBlock[]) => void,
): Promise<string> => {
  const { providerId, modelName } = parseModelString(model);

  const { providers } = useCoreSettingsStore.getState();
  const provider = providerId
    ? providers.find((p) => p.id === providerId)
    : providers.find((p) => p.enabled);

  if (!provider) throw new Error("No provider available");

  let effectiveNewMessage = newMessage;
  const { search } = useSettingsStore.getState();
  const searchConfig =
    search.provider === "google" ? undefined : search.configs[search.provider];
  const searchCompatibility = getSearchCompatibility({
    searchProvider: search.provider,
    searchConfig,
    modelProviderType: provider.type,
  });
  const outputBlockBuilder = createMessageOutputBlockBuilder();
  const emitOutputBlocks = () => {
    onOutputBlocks?.(outputBlockBuilder.getBlocks());
  };

  if (config?.useSearch && !searchCompatibility.enabled) {
    onSearchStatus?.(false, { sources: [], images: [] });
    throw new Error(getSearchCompatibilityErrorMessage(searchCompatibility));
  }

  if (
    config?.useSearch &&
    onSearchStatus &&
    searchCompatibility.mode === "external"
  ) {
    let externalSearchStarted = false;
    try {
      const decision = await decideExternalSearchUse({
        model,
        history,
        message: newMessage,
        signal,
      });

      if (!decision.shouldSearch) {
        onSearchStatus(false, { sources: [], images: [] });
      } else {
        outputBlockBuilder.upsertSearch({ isSearching: true });
        externalSearchStarted = true;
        onSearchStatus(true);
        emitOutputBlocks();
        const searchResults = await createSearchProvider({
          query: decision.query,
        });
        outputBlockBuilder.upsertSearch({
          isSearching: false,
          results: searchResults,
        });
        onSearchStatus(false, searchResults);
        emitOutputBlocks();

        if (
          searchResults.sources.length > 0 ||
          searchResults.images.length > 0
        ) {
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
      }
    } catch (searchError) {
      logDevWarn("Search preflight failed:", searchError);
      if (externalSearchStarted) {
        outputBlockBuilder.upsertSearch({
          isSearching: false,
          results: { sources: [], images: [] },
          error: "Search provider failed",
        });
        emitOutputBlocks();
      }
      onSearchStatus(false, { sources: [], images: [] });
    }
  }

  // Get plugin tools if activePlugins is provided
  const { installedPlugins, pluginConfigs } = useSettingsStore.getState();
  const tools: ChatToolDefinition[] = [];
  const toolNames = new Set<string>();

  addInternalMemoryTools(tools, toolNames, newMessage);

  if (activePlugins && activePlugins.length > 0) {
    activePlugins.forEach((pluginId) => {
      const plugin = installedPlugins.find((p) => p.id === pluginId);
      const pluginConfig = pluginConfigs[pluginId];

      if (plugin) {
        const functionsToAdd = getEnabledPluginFunctions(plugin, pluginConfig);

        // Convert to OpenAI tool format
        functionsToAdd.forEach((func) => {
          if (toolNames.has(func.name)) return;
          toolNames.add(func.name);

          tools.push({
            type: "function",
            function: {
              name: func.name,
              description: func.description,
              parameters: func.parameters,
            },
          });
        });
      }
    });
  }

  try {
    const allToolCalls: ToolCall[] = [];
    let committedContent = "";
    let committedReasoning = "";
    let requestHistory = history as Message[];
    const messageWithSkills = skillsContext?.trim()
      ? appendContextToChatInput(effectiveNewMessage, skillsContext, {
          separator: "\n\n",
        })
      : effectiveNewMessage;
    let requestMessage = appendDiagramRequestInstructions(
      appendHtmlVisualRequestInstructions(
        messageWithSkills,
        userSystemInstruction,
      ),
      userSystemInstruction,
    );
    let requestAttachments = attachments;
    const maxToolRounds = PLUGIN_EXECUTION_LIMITS.maxToolRounds;

    const emitToolCalls = () => {
      onToolUpdate?.([...allToolCalls]);
    };

    const upsertToolCall = (toolCall: ToolCall) => {
      const index = allToolCalls.findIndex((tc) => tc.id === toolCall.id);
      if (index === -1) {
        allToolCalls.push(toolCall);
      } else {
        allToolCalls[index] = { ...allToolCalls[index], ...toolCall };
      }
      emitToolCalls();
    };

    const runRound = async (): Promise<{
      content: string;
      reasoning: string;
      toolCalls: ToolCall[];
    }> => {
      const response = await fetchWithByokRetry(async () =>
        fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            provider: await buildProviderRuntimeConfig(provider),
            modelName,
            history: requestHistory,
            newMessage: requestMessage,
            attachments: requestAttachments,
            config,
            systemInstruction: userSystemInstruction,
            tools,
            enableGoogleSearch:
              config?.useSearch && searchCompatibility.mode === "gemini-google",
            enableOpenAIWebSearch:
              config?.useSearch && searchCompatibility.mode === "openai-web",
          }),
          signal,
        }),
      );

      const contentType = response.headers.get("content-type");
      const isSSE = contentType?.includes("text/event-stream");

      if (!response.ok && !isSSE) {
        throw new Error(
          await getResponseErrorMessage(response, "Stream request failed"),
        );
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullContent = "";
      let fullReasoning = "";
      let buffer = "";
      const roundToolCalls: ToolCall[] = [];

      const handleEventData = (data: string) => {
        if (!data || data === "[DONE]") return false;
        const parsed = JSON.parse(data);

        switch (parsed.type) {
          case "content":
            fullContent += parsed.content;
            outputBlockBuilder.appendText(parsed.content);
            onChunk(
              committedContent + fullContent,
              committedReasoning + fullReasoning,
              outputBlockBuilder.getBlocks(),
            );
            return false;

          case "reasoning":
            fullReasoning += parsed.content;
            outputBlockBuilder.appendReasoning(parsed.content);
            onChunk(
              committedContent + fullContent,
              committedReasoning + fullReasoning,
              outputBlockBuilder.getBlocks(),
            );
            return false;

          case "tool_call": {
            const toolCall: ToolCall = {
              id: parsed.toolCall?.id || uuidv7(),
              name: parsed.toolCall?.name,
              args: parsed.toolCall?.args ?? {},
              status: parsed.toolCall?.status || "pending",
            };
            roundToolCalls.push(toolCall);
            outputBlockBuilder.appendToolCall(toolCall);
            emitOutputBlocks();
            upsertToolCall(toolCall);
            return false;
          }

          case "tool_result":
            if (parsed.toolCall) {
              outputBlockBuilder.updateToolCall(parsed.toolCall);
              emitOutputBlocks();
              upsertToolCall(parsed.toolCall);
            }
            return false;

          case "search":
            outputBlockBuilder.upsertSearch({
              isSearching: parsed.isSearching,
              results: parsed.results,
            });
            onSearchStatus?.(parsed.isSearching, parsed.results);
            emitOutputBlocks();
            return false;

          case "image":
            onImage?.([parsed.image]);
            return false;

          case "usage": {
            const usageData = parsed.usage || parsed.usageMetadata;
            if (usageData && onUsage) {
              if (parsed.usage) {
                onUsage({ usage: usageData });
              } else if (parsed.usageMetadata) {
                onUsage({ usageMetadata: usageData });
              }
            }
            return false;
          }

          case "error":
            throw new Error(parsed.error);

          case "done":
            return true;

          default:
            return false;
        }
      };

      const processSSEEvent = (event: string) => {
        const dataLines = event
          .split("\n")
          .filter((line) => line.startsWith("data: "))
          .map((line) => line.slice(6));

        if (dataLines.length === 0) return false;

        try {
          return handleEventData(dataLines.join("\n"));
        } catch (eventError) {
          if (eventError instanceof SyntaxError) {
            logDevError("Failed to parse SSE data:", eventError);
            return false;
          }
          throw eventError;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const isDone = processSSEEvent(event);
          if (isDone) {
            return {
              content: fullContent,
              reasoning: fullReasoning,
              toolCalls: roundToolCalls,
            };
          }
        }
      }

      if (buffer.trim()) {
        const isDone = processSSEEvent(buffer);
        if (isDone) {
          return {
            content: fullContent,
            reasoning: fullReasoning,
            toolCalls: roundToolCalls,
          };
        }
      }

      return {
        content: fullContent,
        reasoning: fullReasoning,
        toolCalls: roundToolCalls,
      };
    };

    for (let round = 0; round <= maxToolRounds; round++) {
      const result = await runRound();
      const pendingToolCalls = result.toolCalls.filter(
        (toolCall) =>
          toolCall.name &&
          (toolCall.status === "pending" ||
            toolCall.status === "running" ||
            toolCall.result === undefined),
      );

      if (pendingToolCalls.length === 0) {
        return committedContent + result.content;
      }

      if (round === maxToolRounds) {
        pendingToolCalls.forEach((toolCall) => {
          const skippedToolCall: ToolCall = {
            ...toolCall,
            status: "skipped",
            isError: true,
            result:
              "Tool execution skipped because the maximum tool-call rounds were reached.",
          };
          outputBlockBuilder.updateToolCall(skippedToolCall);
          emitOutputBlocks();
          upsertToolCall(skippedToolCall);
        });
        return (
          committedContent +
          result.content +
          `\n\n[Tool Error] Tool execution stopped after reaching the ${maxToolRounds} tool-call rounds limit.`
        );
      }

      pendingToolCalls.forEach((toolCall) => {
        const runningToolCall: ToolCall = { ...toolCall, status: "running" };
        outputBlockBuilder.updateToolCall(runningToolCall);
        emitOutputBlocks();
        upsertToolCall(runningToolCall);
      });

      const executedToolCalls = await Promise.all(
        pendingToolCalls.map(async (toolCall) => {
          try {
            const resultData = isInternalMemoryTool(toolCall.name)
              ? await executeMemorySearchTool(toolCall.args)
              : await executePluginFunction(
                  toolCall.name,
                  toolCall.args,
                  toolCall.auth,
                  activePlugins,
                  signal,
                );
            const isError =
              !!resultData &&
              typeof resultData === "object" &&
              "error" in resultData;
            const completed: ToolCall = {
              ...toolCall,
              status: isError ? "error" : "success",
              isError,
              result: resultData,
            };
            outputBlockBuilder.updateToolCall(completed);
            emitOutputBlocks();
            upsertToolCall(completed);
            return completed;
          } catch (toolError) {
            const failed: ToolCall = {
              ...toolCall,
              status: "error",
              isError: true,
              result:
                toolError instanceof Error
                  ? toolError.message
                  : String(toolError),
            };
            outputBlockBuilder.updateToolCall(failed);
            emitOutputBlocks();
            upsertToolCall(failed);
            return failed;
          }
        }),
      );

      committedContent = result.content
        ? `${committedContent}${result.content}\n\n`
        : committedContent;
      committedReasoning = result.reasoning
        ? `${committedReasoning}${result.reasoning}\n\n`
        : committedReasoning;

      requestHistory = [
        ...requestHistory,
        {
          id: uuidv7(),
          role: "user",
          content: requestMessage,
          attachments: requestAttachments,
          timestamp: Date.now(),
        },
        {
          id: uuidv7(),
          role: "model",
          content: result.content,
          reasoning: result.reasoning,
          toolCalls: executedToolCalls,
          timestamp: Date.now(),
        },
      ];
      requestMessage =
        "Use the tool results above to answer the user's original request. Only call another tool if more external data is required.";
      requestAttachments = [];
    }

    return committedContent;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw error;
  }
};

// Helper functions for history preparation and compression
// These remain client-side as they need access to local state

// Helper to get compression config from store
const getCompressionConfig = () => {
  const { system } = useSettingsStore.getState();
  // Use stored values or defaults if something is wrong (though state should be init)
  // Turns to Messages: 1 Turn = 2 Messages
  return {
    thresholdMessages: (system.compressionThreshold || 12) * 2,
    keepMessages: (system.historyKeepCount || 4) * 2,
  };
};

// Generate summary using backend API
const generateSummary = async (text: string): Promise<string> => {
  try {
    // Use configured task model
    const summaryModel = getTaskModel("contextCompression");

    const prompt = createContextCompressionSummaryPrompt(text);

    const response = await streamGenerateContent(
      summaryModel,
      prompt,
      () => {},
    );
    return response;
  } catch (e) {
    logDevWarn("Summary generation failed, returning raw truncation", e);
    return normalizeCompressedContent(
      `${text.slice(0, 1000)}... [Summary Failed]`,
    );
  }
};

// Reconstruct history for the LLM based on stored compression state + uncompressed tail
export const prepareHistoryForLLM = async (
  allMessages: Message[],
  compression: Session["compression"],
  model: string,
): Promise<Message[]> => {
  // Filter out empty model messages (can happen after retract/delete operations)
  const validMessages = allMessages.filter(
    (m) =>
      m.role === "user" ||
      (m.role === "model" &&
        (m.content.trim() !== "" ||
          m.attachments?.length ||
          m.reasoning ||
          m.searchSources?.length ||
          m.toolCalls?.length)),
  );

  // If no compression state exists, return filtered history
  if (!compression) return validMessages;

  // 1. Identify uncompressed tail
  const lastCompressedIndex = validMessages.findIndex(
    (m) => m.id === compression.lastCompressedMessageId,
  );
  let uncompressedTail: Message[] = [];

  if (lastCompressedIndex !== -1) {
    uncompressedTail = validMessages.slice(lastCompressedIndex + 1);
  } else {
    // If ID not found (maybe message deleted?), fallback to full history or handle error.
    // Safer to return full history if state is invalid.
    return validMessages;
  }

  // 2. Identify First User Message (Requirement: Preserve user's first question)
  const firstUserMsg = validMessages.find((m) => m.role === "user");

  // 3. Construct Compressed Message Placeholder
  // Check model capability for attachment
  const { modelMetadata, customModelMetadata } = useSettingsStore.getState();
  const { modelName: modelId } = parseModelString(model);
  const meta = customModelMetadata[modelId] || modelMetadata[modelId];
  const supportAttachment = meta ? (meta.attachment ?? false) : true;

  let compressedMsg: Message;
  const placeholderId = uuidv7();
  const compressedContent = normalizeCompressedContent(
    compression.compressedContent,
  );

  if (supportAttachment) {
    compressedMsg = {
      id: placeholderId,
      role: "model",
      timestamp: Date.now(),
      content:
        "The context has been compressed. If you need to view the previous conversation, please read the attached content.",
      attachments: [
        {
          id: uuidv7(),
          mimeType: "text/plain",
          fileName: "conversation_history.txt",
          data: textToBase64(compressedContent),
        },
      ],
    };
  } else {
    compressedMsg = {
      id: placeholderId,
      role: "model",
      timestamp: Date.now(),
      content: `The context has been compressed. To retrieve previous conversation content, please read the following conversation summary:\n\n${compressedContent}`,
    };
  }

  // 4. Assemble Final Array
  // [First User] -> [Compressed Placeholder] -> [Uncompressed Tail]
  // Note: If firstUserMsg is actually part of the tail (unlikely if compression exists), we shouldn't duplicate it.
  // Since compression usually happens after 12 turns, firstUserMsg is definitely compressed.

  const result: Message[] = [];
  if (firstUserMsg) {
    result.push(firstUserMsg);
  }
  result.push(compressedMsg);
  result.push(...uncompressedTail);

  return result;
};

// Background task to calculate new compression if needed
export const performBackgroundCompression = async (
  allMessages: Message[],
  currentCompression: Session["compression"],
  model: string,
): Promise<Session["compression"] | null> => {
  const { thresholdMessages, keepMessages } = getCompressionConfig();

  // 1. Identify Uncompressed Segment
  let startIndex = 0;
  let oldContent = "";

  if (currentCompression) {
    const lastIdx = allMessages.findIndex(
      (m) => m.id === currentCompression.lastCompressedMessageId,
    );
    if (lastIdx !== -1) {
      startIndex = lastIdx + 1;
      oldContent = currentCompression.compressedContent;
    }
  } else {
    // If no previous compression, start from index 1 (keeping index 0 User safe)
    startIndex = 1;
  }

  const uncompressedMessages = allMessages.slice(startIndex);

  // 2. Check Threshold
  if (uncompressedMessages.length < thresholdMessages + keepMessages) {
    return null; // No new compression needed
  }

  // 3. Define chunk to compress
  // We keep the last 'keepMessages' raw. Compress everything else in the uncompressed segment.
  const splitIndex = uncompressedMessages.length - keepMessages;
  const messagesToCompress = uncompressedMessages.slice(0, splitIndex);
  const lastCompressedMsg = messagesToCompress[messagesToCompress.length - 1];

  if (!lastCompressedMsg) return null;

  // 4. Generate Content
  const textToCompress = messagesToCompress
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join("\n\n");

  const { modelMetadata, customModelMetadata } = useSettingsStore.getState();
  const { modelName: modelId } = parseModelString(model);
  const meta = customModelMetadata[modelId] || modelMetadata[modelId];
  const supportAttachment = meta ? (meta.attachment ?? false) : true;

  let newCompressedContent = "";

  if (supportAttachment) {
    // Append raw text
    newCompressedContent = mergeCompressedContent(oldContent, textToCompress);
  } else {
    // Generate Summary
    const summary = await generateSummary(textToCompress);
    newCompressedContent = mergeCompressedContent(
      oldContent,
      oldContent ? `[New Summary Segment]:\n${summary}` : summary,
    );
  }

  return {
    compressedContent: newCompressedContent,
    lastCompressedMessageId: lastCompressedMsg.id,
  };
};

// Simple streaming text generation (for prompts without complex history)
export const streamGenerateContent = async (
  model: string,
  prompt: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> => {
  const { providerId, modelName } = parseModelString(model);

  const { providers } = useCoreSettingsStore.getState();
  const provider = providerId
    ? providers.find((p) => p.id === providerId)
    : providers.find((p) => p.enabled);

  if (!provider) throw new Error("No provider found");

  try {
    const response = await fetchWithByokRetry(async () =>
      fetch("/api/chat/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: await buildProviderRuntimeConfig(provider),
          modelName,
          prompt,
        }),
        signal,
      }),
    );

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "Generate request failed"),
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const data = event
          .split("\n")
          .filter((line) => line.startsWith("data: "))
          .map((line) => line.slice(6))
          .join("\n");

        if (!data || data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);

          switch (parsed.type) {
            case "content":
              fullText += parsed.content;
              onChunk(fullText); // Pass accumulated text, not just the chunk
              break;

            case "error":
              throw new Error(parsed.error);

            case "done":
              return fullText;
          }
        } catch (e) {
          if (e instanceof Error && data.includes('"type":"error"')) {
            throw e;
          }
          logDevError("Failed to parse SSE data:", e);
        }
      }
    }

    return fullText;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    logDevError("Stream generate error:", error);
    throw error;
  }
};

export const streamGenerateToolCall = async (
  model: string,
  prompt: string,
  tools: ChatToolDefinition[],
  signal?: AbortSignal,
): Promise<ToolCall | null> => {
  if (tools.length === 0) return null;

  const { providerId, modelName } = parseModelString(model);

  const { providers } = useCoreSettingsStore.getState();
  const provider = providerId
    ? providers.find((p) => p.id === providerId)
    : providers.find((p) => p.enabled);

  if (!provider) {
    logDevWarn("Skill tool selection skipped: no provider found.");
    return null;
  }

  try {
    const response = await fetchWithByokRetry(async () =>
      fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: await buildProviderRuntimeConfig(provider),
          modelName,
          history: [],
          newMessage: prompt,
          attachments: [],
          config: { temperature: 0 },
          tools,
        }),
        signal,
      }),
    );

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "Tool selection failed"),
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    const readEvent = (event: string): ToolCall | null | undefined => {
      const data = event
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n");

      if (!data || data === "[DONE]") return undefined;

      const parsed = JSON.parse(data);
      switch (parsed.type) {
        case "tool_call":
          return parsed.toolCall || null;
        case "error":
          throw new Error(parsed.error);
        case "done":
          return null;
        default:
          return undefined;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const result = readEvent(event);
        if (result !== undefined) {
          await reader.cancel().catch(() => undefined);
          return result;
        }
      }
    }

    if (buffer.trim()) {
      const result = readEvent(buffer);
      if (result !== undefined) return result;
    }

    return null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    logDevWarn("Skill tool selection failed:", error);
    return null;
  }
};

export const performBackgroundMemoryExtraction = async ({
  sessionId,
  userMessage,
  assistantMessage,
  signal,
}: {
  sessionId: string;
  userMessage: Pick<Message, "id" | "content">;
  assistantMessage: Pick<Message, "id" | "content">;
  signal?: AbortSignal;
}) => {
  const state = useMemoryStore.getState();
  const { _hasHydrated, settings } = state;
  if (
    isBrowserMemoryStorePendingHydration(_hasHydrated) ||
    !settings.enabled ||
    !settings.autoRecordEnabled
  ) {
    return [];
  }
  if (!userMessage.content.trim() || !assistantMessage.content.trim()) {
    return [];
  }

  const toolCall = await streamGenerateToolCall(
    getTaskModel("memory"),
    createMemoryExtractionPrompt({
      userMessage: userMessage.content,
      assistantMessage: assistantMessage.content,
    }),
    [coerceToolDefinition(MEMORY_RECORD_TOOL)],
    signal,
  );

  if (!toolCall || toolCall.name !== MEMORY_RECORD_TOOL_NAME) return [];

  const memories = parseMemoryRecordToolCall(toolCall.args, {
    source: "ai",
    sourceSessionId: sessionId,
    sourceMessageIds: [userMessage.id, assistantMessage.id],
  });
  if (memories.length === 0) return [];

  const saved = useMemoryStore.getState().upsertMemories(memories);
  const nextState = useMemoryStore.getState();
  if (
    nextState.settings.enabled &&
    nextState.settings.dreamEnabled &&
    nextState.memories.length > nextState.settings.triggerCount
  ) {
    void performMemoryDream({ force: false, signal });
  }

  return saved;
};

export const performMemoryDream = async ({
  force = false,
  signal,
}: {
  force?: boolean;
  signal?: AbortSignal;
} = {}) => {
  const state = useMemoryStore.getState();
  const { _hasHydrated, settings, memories, dreamStatus } = state;
  if (
    isBrowserMemoryStorePendingHydration(_hasHydrated) ||
    !settings.enabled ||
    !settings.dreamEnabled ||
    dreamStatus.isRunning
  ) {
    return null;
  }
  if (memories.length <= settings.targetCount) return null;
  if (!force && memories.length <= settings.triggerCount) return null;

  state.startDream();
  try {
    const targetCount = Math.min(
      settings.targetCount,
      MEMORY_LIMITS.targetCount,
    );
    const toolCall = await streamGenerateToolCall(
      getTaskModel("memory"),
      createMemoryDreamPrompt({ memories, targetCount }),
      [coerceToolDefinition(MEMORY_DREAM_TOOL)],
      signal,
    );

    if (!toolCall || toolCall.name !== MEMORY_DREAM_TOOL_NAME) {
      throw new Error("Memory dream did not return a valid tool call.");
    }

    const dreamed = parseMemoryDreamToolCall(toolCall.args, {
      targetCount,
    });

    if (dreamed.length === 0 || dreamed.length > targetCount) {
      throw new Error("Memory dream returned an invalid memory set.");
    }

    useMemoryStore.getState().replaceMemories(dreamed);
    useMemoryStore.getState().finishDream();
    return dreamed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useMemoryStore.getState().finishDream(message);
    logDevWarn("Memory dream failed:", error);
    return null;
  }
};
