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

export interface OpenAIStreamOptions {
  client: OpenAI;
  model: string;
  messages: any[];
  temperature?: number;
  tools?: any[];
  useReasoning?: boolean;
  onChunk: (message: SSEMessage) => void;
}

export interface OpenAIResponsesStreamOptions {
  client: OpenAI;
  model: string;
  input: any[];
  instructions?: string;
  temperature?: number;
  tools?: any[];
  useReasoning?: boolean;
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
  if (tools && tools.length > 0) requestParams.tools = tools;
  if (useReasoning) requestParams.reasoning = { effort: "high" };

  const stream = (await client.responses.create(requestParams)) as any;
  let toolCallPosition = 0;

  for await (const event of stream) {
    switch (event?.type) {
      case "response.output_text.delta":
        if (event.delta) {
          onChunk({ type: "content", content: event.delta });
        }
        break;

      case "response.output_item.done": {
        const item = event.item;
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
