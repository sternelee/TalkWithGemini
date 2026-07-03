import { Message, ToolCall } from "@/types";
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
  if (!message.toolCalls?.length) return message;

  return {
    ...message,
    toolCalls: message.toolCalls.map((toolCall) => normalizeToolCall(toolCall)),
  };
}

export function normalizeMessages(messages: Message[] | null | undefined) {
  return (messages || []).map((message) => normalizeMessage(message));
}

export function migrateSearchSettings(search: any) {
  return normalizeSearchSettings(search);
}
