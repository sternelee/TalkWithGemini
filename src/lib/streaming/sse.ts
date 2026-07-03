/**
 * 统一的 SSE 流式响应处理
 */

import type { Attachment, ToolCall } from "../../types";
import { toPublicErrorPayload } from "../errors";

export type SSEMessage =
  | { type: "content"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "tool_result"; toolCall: ToolCall }
  | {
      type: "search";
      isSearching: boolean;
      results?: { sources: any[]; images: any[] };
    }
  | { type: "usage"; usage?: any; usageMetadata?: any }
  | { type: "timing"; timing: any }
  | { type: "image"; image: Attachment }
  | { type: "error"; error: string }
  | { type: "done" };

export interface StreamController {
  enqueue: (chunk: Uint8Array) => void;
  close: () => void;
}

/**
 * 创建 SSE 发送器
 */
export function createSSESender(controller: StreamController) {
  return (data: SSEMessage) => {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(new TextEncoder().encode(message));
  };
}

/**
 * 创建流式响应处理器
 */
export function createStreamHandler(
  handler: (controller: StreamController) => Promise<void>,
): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      try {
        await handler(controller);
      } catch (error) {
        const errorPayload = toPublicErrorPayload(error);
        const errorData = `data: ${JSON.stringify({ type: "error", error: errorPayload.error })}\n\n`;
        controller.enqueue(new TextEncoder().encode(errorData));
      } finally {
        controller.close();
      }
    },
  });
}

/**
 * 创建流式响应
 */
export function createStreamResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
