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

type ThinkTagStreamEvent = {
  type: "content" | "reasoning";
  content: string;
};

const THINK_OPEN_TAG = "<think>";
const THINK_CLOSE_TAG = "</think>";

function findTagIndex(value: string, tag: string): number {
  return value.toLowerCase().indexOf(tag);
}

function splitBeforePotentialTagPrefix(value: string, tag: string) {
  const lower = value.toLowerCase();
  for (
    let length = Math.min(tag.length - 1, lower.length);
    length > 0;
    length--
  ) {
    if (tag.startsWith(lower.slice(-length))) {
      return {
        ready: value.slice(0, -length),
        pending: value.slice(-length),
      };
    }
  }
  return { ready: value, pending: "" };
}

function pushThinkTagEvent(
  events: ThinkTagStreamEvent[],
  type: ThinkTagStreamEvent["type"],
  content: string,
) {
  if (content) events.push({ type, content });
}

function createThinkTagStreamParser() {
  let buffer = "";
  let insideThink = false;

  const consume = (input: string): ThinkTagStreamEvent[] => {
    buffer += input;
    const events: ThinkTagStreamEvent[] = [];

    while (buffer) {
      if (insideThink) {
        const closeIndex = findTagIndex(buffer, THINK_CLOSE_TAG);
        if (closeIndex !== -1) {
          pushThinkTagEvent(events, "reasoning", buffer.slice(0, closeIndex));
          buffer = buffer.slice(closeIndex + THINK_CLOSE_TAG.length);
          insideThink = false;
          continue;
        }

        const { ready, pending } = splitBeforePotentialTagPrefix(
          buffer,
          THINK_CLOSE_TAG,
        );
        pushThinkTagEvent(events, "reasoning", ready);
        buffer = pending;
        break;
      }

      const openIndex = findTagIndex(buffer, THINK_OPEN_TAG);
      if (openIndex !== -1) {
        pushThinkTagEvent(events, "content", buffer.slice(0, openIndex));
        buffer = buffer.slice(openIndex + THINK_OPEN_TAG.length);
        insideThink = true;
        continue;
      }

      const { ready, pending } = splitBeforePotentialTagPrefix(
        buffer,
        THINK_OPEN_TAG,
      );
      pushThinkTagEvent(events, "content", ready);
      buffer = pending;
      break;
    }

    return events;
  };

  const flush = (): ThinkTagStreamEvent[] => {
    const pending = buffer;
    buffer = "";
    return pending
      ? [{ type: insideThink ? "reasoning" : "content", content: pending }]
      : [];
  };

  return { consume, flush };
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

interface ChatCompletionRequestOptions {
  model: string;
  messages: any[];
  temperature?: number;
  tools?: any[];
  useReasoning?: boolean;
}

function normalizeChatCompletionMessages(messages: any[]): any[] {
  return messages.map((message) => {
    const content = message?.content;
    if (!Array.isArray(content) || content.length !== 1) return message;

    const [onlyPart] = content;
    if (
      onlyPart?.type !== "text" ||
      typeof onlyPart.text !== "string" ||
      Object.keys(onlyPart).some((key) => key !== "type" && key !== "text")
    ) {
      return message;
    }

    return {
      ...message,
      content: onlyPart.text,
    };
  });
}

function createChatCompletionRequestParams({
  model,
  messages,
  temperature = 1,
  tools,
  useReasoning,
}: ChatCompletionRequestOptions): any {
  const requestParams: any = {
    model,
    messages: normalizeChatCompletionMessages(messages),
    stream: true,
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

  return requestParams;
}

function emitChatCompletionChunk(
  chunk: any,
  toolCalls: ReturnType<typeof createOpenAIToolCallAccumulator>,
  emitReasoning: boolean,
  thinkTagParser: ReturnType<typeof createThinkTagStreamParser>,
  onChunk: (message: SSEMessage) => void,
): void {
  const delta = chunk.choices?.[0]?.delta;

  // 处理文本内容
  if (delta?.content) {
    for (const event of thinkTagParser.consume(delta.content)) {
      if (event.type === "content") {
        onChunk({ type: "content", content: event.content });
      } else if (emitReasoning) {
        onChunk({ type: "reasoning", content: event.content });
      }
    }
  }

  const reasoningContent =
    extractTextValue(delta?.reasoning_content) ||
    extractTextValue(delta?.reasoning);
  if (emitReasoning && reasoningContent) {
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

async function finishChatCompletionStream(
  chunks: AsyncIterable<any>,
  startTime: number,
  emitReasoning: boolean,
  onChunk: (message: SSEMessage) => void,
): Promise<void> {
  const toolCalls = createOpenAIToolCallAccumulator();
  const thinkTagParser = createThinkTagStreamParser();

  for await (const chunk of chunks) {
    emitChatCompletionChunk(
      chunk,
      toolCalls,
      emitReasoning,
      thinkTagParser,
      onChunk,
    );
  }

  for (const event of thinkTagParser.flush()) {
    if (event.type === "content") {
      onChunk({ type: "content", content: event.content });
    } else if (emitReasoning) {
      onChunk({ type: "reasoning", content: event.content });
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
  const requestParams = createChatCompletionRequestParams({
    model,
    messages,
    temperature,
    tools,
    useReasoning,
  });

  const stream = (await client.chat.completions.create(requestParams)) as any;
  await finishChatCompletionStream(
    stream,
    startTime,
    Boolean(useReasoning),
    onChunk,
  );
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
        if (useReasoning && reasoningContent) {
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
            if (useReasoning && reasoningContent) {
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
