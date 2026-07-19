import { Message, MessageOutputBlock, ToolCall } from "@/types";
import { normalizeSearchSettings } from "@/lib/settings/searchRag";

function normalizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const text = item.trim().slice(0, 160);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
    if (output.length >= maxItems) break;
  }
  return output;
}

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

  const interruptedConfirmation = status === "awaiting_confirmation";
  if (interruptedConfirmation) status = "error";

  const confirmation = interruptedConfirmation
    ? {
        required: true,
        state: "interrupted" as const,
        decidedAt: Date.now(),
      }
    : toolCall.confirmation
      ? {
          required: toolCall.confirmation.required === true,
          state: toolCall.confirmation.state,
          ...(toolCall.confirmation.decision
            ? { decision: toolCall.confirmation.decision }
            : {}),
          ...(typeof toolCall.confirmation.decidedAt === "number"
            ? { decidedAt: toolCall.confirmation.decidedAt }
            : {}),
        }
      : undefined;
  const interruptedResult = {
    error: {
      code: "CONFIRMATION_INTERRUPTED",
      message: "Tool confirmation was interrupted before a decision.",
    },
  };

  return {
    id: toolCall.id || `tool_${Date.now()}`,
    name: toolCall.name || "unknown_tool",
    pluginId: toolCall.pluginId,
    pluginTitle: toolCall.pluginTitle,
    functionFingerprint: toolCall.functionFingerprint,
    args: toolCall.args ?? {},
    status,
    result: interruptedConfirmation ? interruptedResult : toolCall.result,
    isError: interruptedConfirmation ? true : toolCall.isError,
    risk: toolCall.risk,
    confirmation,
    errorInfo: interruptedConfirmation
      ? {
          code: "CONFIRMATION_INTERRUPTED",
          message: "Tool confirmation was interrupted before a decision.",
          recoverable: true,
        }
      : toolCall.errorInfo,
    auth: toolCall.auth,
  };
}

export function normalizeMessage(message: Message): Message {
  const memoryContext =
    message.memoryContext &&
    typeof message.memoryContext === "object" &&
    typeof message.memoryContext.promptContext === "string"
      ? {
          injectedMemoryIds: normalizeStringList(
            message.memoryContext.injectedMemoryIds,
            100,
          ),
          promptContext: message.memoryContext.promptContext
            .trim()
            .slice(0, 8_000),
          ...(typeof message.memoryContext.createdAt === "number" &&
          Number.isFinite(message.memoryContext.createdAt)
            ? { createdAt: Math.floor(message.memoryContext.createdAt) }
            : {}),
        }
      : undefined;
  const normalizedBlocks = message.outputBlocks?.map((block) => {
    if (block.type !== "tool_group") return block;
    return {
      ...block,
      toolCalls: block.toolCalls.map((toolCall) => normalizeToolCall(toolCall)),
    } satisfies MessageOutputBlock;
  });

  if (!message.toolCalls?.length && !normalizedBlocks && !memoryContext) {
    return message;
  }

  return {
    ...message,
    ...(memoryContext?.promptContext &&
    memoryContext.injectedMemoryIds.length > 0
      ? { memoryContext }
      : { memoryContext: undefined }),
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
