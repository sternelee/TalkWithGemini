import { Message, MessageOutputBlock, ToolCall } from "@/types";
import { normalizeSearchSettings } from "../../lib/settings/searchRag";

export function normalizeToolCall(toolCall: Partial<ToolCall>): ToolCall {
  let status = toolCall.status;
  if (!status) {
    if (toolCall.isError) {
      status = "error";
    } else if (toolCall.result !== undefined) {
      status = "success";
    } else {
      status = "pending";
    }
  }

  return {
    id: toolCall.id || `tool_${Date.now()}`,
    name: toolCall.name || "unknown_tool",
    args: toolCall.args ?? {},
    status,
    result: toolCall.result,
    isError: toolCall.isError,
    auth: toolCall.auth,
  };
}

export function normalizeMessage(message: Message): Message {
  const normalizedBlocks = message.outputBlocks?.map((block) => {
    if (block.type !== "tool_group") return block;
    return {
      ...block,
      toolCalls: block.toolCalls.map((toolCall) =>
        normalizeToolCall(toolCall),
      ),
    } satisfies MessageOutputBlock;
  });

  if (!message.toolCalls?.length && !normalizedBlocks) return message;

  return {
    ...message,
    ...(message.toolCalls?.length
      ? {
          toolCalls: message.toolCalls.map((toolCall) =>
            normalizeToolCall(toolCall),
          ),
        }
      : {}),
    ...(normalizedBlocks ? { outputBlocks: normalizedBlocks } : {}),
  };
}

export function normalizeMessages(messages: Message[] | null | undefined) {
  return (messages || []).map((message) => normalizeMessage(message));
}

export function migrateSearchSettings(search: any) {
  return normalizeSearchSettings(search);
}
