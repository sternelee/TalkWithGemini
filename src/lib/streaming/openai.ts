/**
 * OpenAI 流式响应处理器
 */

import OpenAI from "openai";
import { PLUGIN_EXECUTION_LIMITS } from "../../config/limits";
import { SSEMessage } from "./sse";
import {
  appendOpenAIToolCallDelta,
  createOpenAIToolCallAccumulator,
  finalizeOpenAIToolCalls,
  finalizeStreamedToolCall,
} from "./toolCalls";
import { normalizeSearchSources } from "../search/results";

export interface OpenAIStreamOptions {
  client: OpenAI;
  model: string;
  messages: any[];
  temperature?: number;
  tools?: any[];
  useReasoning?: boolean;
  onChunk: (message: SSEMessage) => void;
}

function extractTextValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(extractTextValue).join("");
  }
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  return (
    extractTextValue(record.text) ||
    extractTextValue(record.content) ||
    extractTextValue(record.summary) ||
    extractTextValue(record.delta)
  );
}

function createSourceCandidate(
  value: unknown,
  fallbackTitle = "Search source",
  fallbackContent?: string,
) {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const url =
    extractTextValue(record.url) ||
    extractTextValue(record.uri) ||
    extractTextValue(record.link);
  if (!url) return null;

  const title =
    extractTextValue(record.title) ||
    extractTextValue(record.name) ||
    fallbackTitle;
  const content =
    extractTextValue(record.content) ||
    extractTextValue(record.snippet) ||
    extractTextValue(record.text) ||
    fallbackContent ||
    title;

  return { title, url, content };
}

function collectSourceCandidates(
  value: unknown,
  fallbackContent?: string,
): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        createSourceCandidate(item, "Search source", fallbackContent),
      )
      .filter(Boolean);
  }
  const candidate = createSourceCandidate(
    value,
    "Search source",
    fallbackContent,
  );
  return candidate ? [candidate] : [];
}

function extractWebSearchSources(item: any) {
  const rawSources = [
    ...collectSourceCandidates(item?.results),
    ...collectSourceCandidates(item?.action?.sources),
    ...collectSourceCandidates(item?.sources),
  ];
  return normalizeSearchSources(rawSources);
}

function extractUrlCitationSources(content: any) {
  const text = extractTextValue(content?.text);
  const annotations = Array.isArray(content?.annotations)
    ? content.annotations
    : [];
  const rawSources = annotations
    .filter((annotation: any) => annotation?.type === "url_citation")
    .map((annotation: any) =>
      createSourceCandidate(annotation, "Citation", text),
    )
    .filter(Boolean);

  return normalizeSearchSources(rawSources);
}

function extractReasoningSummary(item: any): string {
  return [
    extractTextValue(item?.summary),
    extractTextValue(item?.content),
    extractTextValue(item?.text),
  ]
    .filter(Boolean)
    .join("");
}

export interface OpenAIResponsesStreamOptions {
  client: OpenAI;
  model: string;
  input: any[];
  instructions?: string;
  temperature?: number;
  tools?: any[];
  useReasoning?: boolean;
  enableWebSearch?: boolean;
  onChunk: (message: SSEMessage) => void;
}

/**
 * 处理 OpenAI Chat Completions 流式响应
 */
export async function streamOpenAIChatCompletions(
  options: OpenAIStreamOptions,
) {
  const {
    client,
    model,
    messages,
    temperature = 1,
    tools,
    useReasoning,
    onChunk,
  } = options;

  const startTime = Date.now();

  // Build request parameters
  const requestParams: any = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };

  // O1 models don't support temperature or tools
  const isO1Model = model.startsWith("o1-");

  if (!isO1Model) {
    requestParams.temperature = temperature;
    if (tools && tools.length > 0) {
      requestParams.tools = tools;
    }
  }

  // Add reasoning effort for o1 models if useReasoning is enabled
  if (isO1Model && useReasoning) {
    requestParams.reasoning_effort = "high";
  }

  const stream = (await client.chat.completions.create(requestParams)) as any;

  // let fullContent = "";
  const toolCalls = createOpenAIToolCallAccumulator();

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;

    // 处理文本内容
    if (delta?.content) {
      // fullContent += delta.content;
      onChunk({ type: "content", content: delta.content });
    }

    const reasoningContent =
      extractTextValue(delta?.reasoning_content) ||
      extractTextValue(delta?.reasoning);
    if (reasoningContent) {
      onChunk({ type: "reasoning", content: reasoningContent });
    }

    // 处理工具调用
    if (delta?.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        appendOpenAIToolCallDelta(toolCalls, toolCall);
      }
    }

    // 处理使用统计
    if (chunk.usage) {
      onChunk({
        type: "usage",
        usage: {
          prompt_tokens: chunk.usage.prompt_tokens,
          completion_tokens: chunk.usage.completion_tokens,
          total_tokens: chunk.usage.total_tokens,
        },
      });
    }
  }

  // 发送完整的工具调用
  for (const toolCall of finalizeOpenAIToolCalls(toolCalls)) {
    onChunk({ type: "tool_call", toolCall });
  }

  // 发送时间统计
  const endTime = Date.now();
  onChunk({
    type: "timing",
    timing: {
      startTime,
      endTime,
      duration: endTime - startTime,
    },
  });
}

/**
 * Backward-compatible alias for the legacy chat-completions stream.
 */
export const streamOpenAIResponse = streamOpenAIChatCompletions;

/**
 * 处理 OpenAI Responses API 流式响应
 */
export async function streamOpenAIResponses(
  options: OpenAIResponsesStreamOptions,
) {
  const {
    client,
    model,
    input,
    instructions,
    temperature,
    tools,
    useReasoning,
    enableWebSearch,
    onChunk,
  } = options;

  const startTime = Date.now();
  const requestParams: any = {
    model,
    input,
    stream: true,
  };

  if (instructions) requestParams.instructions = instructions;
  if (temperature !== undefined) requestParams.temperature = temperature;
  const requestTools = tools ? [...tools] : [];
  if (enableWebSearch) {
    requestTools.push({ type: "web_search_preview" });
    requestParams.include = [
      "web_search_call.results",
      "web_search_call.action.sources",
    ];
  }
  if (requestTools.length > 0) requestParams.tools = requestTools;
  if (useReasoning) {
    requestParams.reasoning = { effort: "high", summary: "auto" };
  }

  const stream = (await client.responses.create(requestParams)) as any;
  let toolCallPosition = 0;
  let hasStreamedOutputText = false;
  let hasStreamedReasoning = false;

  for await (const event of stream) {
    switch (event?.type) {
      case "response.output_text.delta":
        if (event.delta) {
          hasStreamedOutputText = true;
          onChunk({ type: "content", content: event.delta });
        }
        break;

      case "response.reasoning_summary_text.delta":
      case "response.reasoning_text.delta": {
        const reasoningContent = extractTextValue(event.delta);
        if (reasoningContent) {
          hasStreamedReasoning = true;
          onChunk({ type: "reasoning", content: reasoningContent });
        }
        break;
      }

      case "response.output_text.annotation.added": {
        const sources = normalizeSearchSources(
          collectSourceCandidates(event.annotation),
        );
        if (sources.length > 0) {
          onChunk({
            type: "search",
            isSearching: false,
            results: { sources, images: [] },
          });
        }
        break;
      }

      case "response.output_item.done": {
        const item = event.item;
        if (item?.type === "web_search_call") {
          const sources = extractWebSearchSources(item);
          if (sources.length > 0) {
            onChunk({
              type: "search",
              isSearching: false,
              results: { sources, images: [] },
            });
          }
          break;
        }

        if (item?.type === "reasoning") {
          if (!hasStreamedReasoning) {
            const reasoningContent = extractReasoningSummary(item);
            if (reasoningContent) {
              onChunk({ type: "reasoning", content: reasoningContent });
            }
          }
          break;
        }

        if (item?.type === "message") {
          const contentItems = Array.isArray(item.content) ? item.content : [];
          for (const content of contentItems) {
            if (!hasStreamedOutputText) {
              const text = extractTextValue(content?.text);
              if (text) {
                onChunk({ type: "content", content: text });
              }
            }

            const sources = extractUrlCitationSources(content);
            if (sources.length > 0) {
              onChunk({
                type: "search",
                isSearching: false,
                results: { sources, images: [] },
              });
            }
          }
          break;
        }

        if (item?.type !== "function_call") break;
        if (toolCallPosition >= PLUGIN_EXECUTION_LIMITS.maxStreamedToolCalls) {
          break;
        }

        const toolCall = finalizeStreamedToolCall(
          {
            id: item.call_id || item.id,
            name: item.name,
            argsText: item.arguments,
          },
          toolCallPosition,
        );
        toolCallPosition += 1;
        if (toolCall) {
          onChunk({ type: "tool_call", toolCall });
        }
        break;
      }

      case "response.completed": {
        const usage = event.response?.usage;
        if (usage) {
          onChunk({
            type: "usage",
            usage: {
              prompt_tokens: usage.input_tokens ?? 0,
              completion_tokens: usage.output_tokens ?? 0,
              total_tokens: usage.total_tokens ?? 0,
            },
          });
        }
        break;
      }

      case "response.failed":
      case "response.error": {
        const errorMessage =
          event.error?.message ||
          event.response?.error?.message ||
          "OpenAI Responses stream failed";
        onChunk({ type: "error", error: errorMessage });
        break;
      }
    }
  }

  const endTime = Date.now();
  onChunk({
    type: "timing",
    timing: {
      startTime,
      endTime,
      duration: endTime - startTime,
    },
  });
}
