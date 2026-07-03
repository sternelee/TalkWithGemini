/**
 * 历史消息处理工具
 */

import { Message } from "@/types";
import {
  convertAttachmentsToGemini,
  convertAttachmentsToOpenAI,
  convertAttachmentsToOpenAIResponses,
} from "./attachments";

/**
 * 准备 Gemini 格式的历史消息
 */
export function prepareGeminiHistory(messages: Message[]) {
  const result: any[] = [];

  for (const msg of messages) {
    const parts: any[] = [];

    // 添加文本内容
    if (msg.content) {
      parts.push({ text: msg.content });
    }

    // 添加附件
    if (msg.attachments?.length) {
      parts.push(...convertAttachmentsToGemini(msg.attachments));
    }

    // 添加工具调用结果
    if (msg.toolCalls?.length) {
      const functionCallParts: any[] = [];
      const functionResponseParts: any[] = [];

      for (const tc of msg.toolCalls) {
        functionCallParts.push({
          functionCall: {
            name: tc.name,
            args: tc.args,
          },
        });

        if (tc.result !== undefined) {
          functionResponseParts.push({
            functionResponse: {
              name: tc.name,
              response:
                typeof tc.result === "object"
                  ? tc.result
                  : { result: String(tc.result) },
            },
          });
        }
      }

      if (msg.role === "model" && functionCallParts.length > 0) {
        parts.push(...functionCallParts);
      }

      if (functionResponseParts.length > 0) {
        result.push({
          role: "model",
          parts,
        });
        result.push({
          role: "user",
          parts: functionResponseParts,
        });
        continue;
      }
    }

    result.push({
      role: msg.role === "model" ? "model" : "user",
      parts,
    });
  }

  return result;
}

/**
 * 准备 OpenAI 格式的历史消息
 */
export function prepareOpenAIHistory(messages: Message[]) {
  const result: any[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      const content: any[] = [{ type: "text", text: msg.content }];

      if (msg.attachments?.length) {
        content.push(...convertAttachmentsToOpenAI(msg.attachments));
      }

      result.push({ role: "user", content });
    } else {
      // 模型消息
      if (msg.toolCalls?.length) {
        // 添加助手的工具调用
        result.push({
          role: "assistant",
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          })),
        });

        // 添加工具结果
        for (const tc of msg.toolCalls) {
          if (tc.result !== undefined) {
            result.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify(tc.result),
            });
          }
        }
      } else {
        result.push({
          role: "assistant",
          content: msg.content,
        });
      }
    }
  }

  return result;
}

/**
 * 准备 OpenAI Responses API 格式的历史输入
 */
export function prepareOpenAIResponsesInput(messages: Message[]) {
  const result: any[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      const content: any[] = [{ type: "input_text", text: msg.content }];

      if (msg.attachments?.length) {
        content.push(...convertAttachmentsToOpenAIResponses(msg.attachments));
      }

      result.push({ role: "user", content });
      continue;
    }

    if (msg.content) {
      result.push({
        role: "assistant",
        content: [{ type: "input_text", text: msg.content }],
      });
    }

    if (msg.toolCalls?.length) {
      for (const tc of msg.toolCalls) {
        result.push({
          type: "function_call",
          call_id: tc.id,
          name: tc.name,
          arguments: JSON.stringify(tc.args ?? {}),
        });

        if (tc.result !== undefined) {
          result.push({
            type: "function_call_output",
            call_id: tc.id,
            output:
              typeof tc.result === "string"
                ? tc.result
                : JSON.stringify(tc.result),
          });
        }
      }
    }
  }

  return result;
}

/**
 * 压缩历史消息（保留最近的 N 条）
 */
export function compressHistory(
  messages: Message[],
  keepCount: number,
): Message[] {
  if (messages.length <= keepCount) {
    return messages;
  }

  return messages.slice(-keepCount);
}

/**
 * 计算历史消息的大概 token 数
 */
export function estimateTokenCount(messages: Message[]): number {
  let total = 0;

  for (const msg of messages) {
    // 粗略估算：1 token ≈ 4 字符
    total += Math.ceil(msg.content.length / 4);

    if (msg.reasoning) {
      total += Math.ceil(msg.reasoning.length / 4);
    }

    // 附件也会占用 token
    if (msg.attachments?.length) {
      total += msg.attachments.length * 100; // 每个附件约 100 tokens
    }
  }

  return total;
}
