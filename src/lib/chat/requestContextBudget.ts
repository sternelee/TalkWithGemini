import type { Attachment, Message, ToolCall } from "@/types";
import { allocateContextBudget } from "./contextBudget";

const CHARS_PER_TOKEN = 4;
const HISTORY_TRUNCATION_NOTICE = "\n[History truncated to context budget.]";
const ATTACHMENT_OMISSION_NOTICE =
  "\n[Historical attachment omitted to fit the context budget.]";
const TOOL_OMISSION_NOTICE =
  "\n[Older tool calls omitted to fit the context budget.]";

export class ContextBudgetExceededError extends Error {
  readonly code = "CONTEXT_BUDGET_EXCEEDED";
  readonly recoverable = true;

  constructor() {
    super(
      "The current message, attachments, instructions, and tools exceed this model's input limit.",
    );
    this.name = "ContextBudgetExceededError";
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) || "";
  } catch {
    return String(value);
  }
}

function attachmentChars(attachment: Attachment): number {
  return (
    (attachment.data?.length || 0) +
    (attachment.url?.length || 0) +
    attachment.fileName.length +
    attachment.mimeType.length
  );
}

function messageTextChars(message: Message): number {
  return (
    message.content.length +
    (message.role === "user"
      ? message.memoryContext?.promptContext?.length || 0
      : 0)
  );
}

function groupTurns(messages: Message[]): Message[][] {
  const turns: Message[][] = [];
  for (const message of messages) {
    if (message.role === "user" || turns.length === 0) {
      turns.push([message]);
    } else {
      turns[turns.length - 1].push(message);
    }
  }
  return turns;
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= HISTORY_TRUNCATION_NOTICE.length) {
    return HISTORY_TRUNCATION_NOTICE.slice(0, Math.max(0, maxChars));
  }
  return `${value.slice(
    0,
    maxChars - HISTORY_TRUNCATION_NOTICE.length,
  )}${HISTORY_TRUNCATION_NOTICE}`;
}

function fitLatestTurn(turn: Message[], maxChars: number): Message[] {
  if (turn.length === 0 || maxChars <= 0) return [];
  const perMessageBudget = Math.max(1, Math.floor(maxChars / turn.length));
  return turn.map((message) => {
    const content = truncateText(message.content, perMessageBudget);
    const remaining = Math.max(0, perMessageBudget - content.length);
    const memoryContext = message.memoryContext?.promptContext
      ? {
          ...message.memoryContext,
          promptContext: truncateText(
            message.memoryContext.promptContext,
            remaining,
          ),
        }
      : message.memoryContext;
    return { ...message, content, memoryContext };
  });
}

function boundHistoricalAttachments(
  history: Message[],
  maxChars: number,
): Message[] {
  let remaining = maxChars;
  return history
    .slice()
    .reverse()
    .map((message) => {
      if (!message.attachments?.length) return message;
      const kept: Attachment[] = [];
      let omitted = 0;
      for (const attachment of message.attachments.slice().reverse()) {
        const size = attachmentChars(attachment);
        if (size <= remaining) {
          kept.unshift(attachment);
          remaining -= size;
        } else {
          omitted += 1;
        }
      }
      return {
        ...message,
        content:
          omitted > 0
            ? `${ATTACHMENT_OMISSION_NOTICE}\n${message.content}`
            : message.content,
        attachments: kept.length > 0 ? kept : undefined,
      };
    })
    .reverse();
}

function truncatedToolResult(toolCall: ToolCall, maxChars: number): string {
  const header = `[Tool result truncated to context budget]\nTool: ${toolCall.name}\nArguments: ${safeJson(
    toolCall.args,
  )}\nResult:\n`;
  if (maxChars <= header.length) {
    return header.slice(0, Math.max(0, maxChars));
  }
  const original =
    typeof toolCall.result === "string"
      ? toolCall.result
      : safeJson(toolCall.result);
  return `${header}${original.slice(0, Math.max(0, maxChars - header.length))}`;
}

function boundToolResults(history: Message[], maxChars: number): Message[] {
  let remaining = maxChars;
  return history
    .slice()
    .reverse()
    .map((message) => {
      if (!message.toolCalls?.length) return message;
      let omitted = false;
      const toolCalls = message.toolCalls
        .slice()
        .reverse()
        .flatMap((toolCall) => {
          const serializedArgs = safeJson(toolCall.args);
          const boundedArgs =
            serializedArgs.length <= 300
              ? toolCall.args
              : {
                  summary: serializedArgs.slice(0, 260),
                  truncated: true,
                };
          const baseCall = { ...toolCall, args: boundedArgs };
          const baseChars = safeJson({
            id: baseCall.id,
            name: baseCall.name,
            args: baseCall.args,
            status: baseCall.status,
          }).length;
          if (remaining <= 0 || baseChars > remaining) {
            omitted = true;
            return [];
          }
          remaining -= baseChars;
          if (toolCall.result === undefined) return [baseCall];
          const serialized =
            typeof toolCall.result === "string"
              ? toolCall.result
              : safeJson(toolCall.result);
          if (serialized.length <= remaining) {
            remaining -= serialized.length;
            return [{ ...baseCall, result: toolCall.result }];
          }
          const bounded = truncatedToolResult(baseCall, remaining);
          remaining = Math.max(0, remaining - bounded.length);
          return [{ ...baseCall, result: bounded }];
        })
        .reverse();
      return {
        ...message,
        content: omitted
          ? `${TOOL_OMISSION_NOTICE}\n${message.content}`
          : message.content,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    })
    .reverse();
}

export function boundHistoryForRequest(
  history: Message[],
  {
    newMessage,
    attachments,
    modelInputTokenLimit,
    reservedOutputTokens,
    systemInstruction,
    tools,
  }: {
    newMessage: string;
    attachments: Attachment[];
    modelInputTokenLimit?: number;
    reservedOutputTokens?: number;
    systemInstruction?: string;
    tools?: unknown[];
  },
): Message[] {
  const requestedAttachmentChars = history.reduce(
    (sum, message) =>
      sum +
      (message.attachments || []).reduce(
        (attachmentSum, attachment) =>
          attachmentSum + attachmentChars(attachment),
        0,
      ),
    0,
  );
  const requestedToolChars = history.reduce(
    (sum, message) =>
      sum +
      (message.toolCalls || []).reduce(
        (toolSum, toolCall) => toolSum + safeJson(toolCall).length,
        0,
      ),
    0,
  );
  const requestedHistoryChars = history.reduce(
    (sum, message) =>
      sum +
      messageTextChars(message) +
      (message.attachments?.length || 0) * ATTACHMENT_OMISSION_NOTICE.length,
    0,
  );
  const budget = allocateContextBudget({
    modelInputTokenLimit,
    reservedOutputTokens,
    sources: {
      history: requestedHistoryChars,
      attachments: requestedAttachmentChars,
      tools: requestedToolChars,
    },
  });
  const currentChars =
    newMessage.length +
    (systemInstruction?.length || 0) +
    safeJson(tools || []).length +
    attachments.reduce(
      (sum, attachment) => sum + attachmentChars(attachment),
      0,
    );
  const totalAvailableChars = budget.totalAvailableTokens * CHARS_PER_TOKEN;
  if (currentChars > totalAvailableChars) {
    throw new ContextBudgetExceededError();
  }
  if (history.length === 0) return [];
  const remainingRequestChars = Math.max(0, totalAvailableChars - currentChars);
  const attachmentBudget = Math.min(
    budget.allocations.attachments.maxTokens * CHARS_PER_TOKEN,
    remainingRequestChars,
  );
  const toolBudget = Math.min(
    budget.allocations.tools.maxTokens * CHARS_PER_TOKEN,
    Math.max(0, remainingRequestChars - attachmentBudget),
  );
  const historyBudget = Math.min(
    Math.max(0, remainingRequestChars - attachmentBudget - toolBudget),
    remainingRequestChars,
  );

  const sanitized = boundToolResults(
    boundHistoricalAttachments(history, attachmentBudget),
    toolBudget,
  );
  const turns = groupTurns(sanitized);
  const selectedTurns: Message[][] = [];
  let remainingHistoryChars = historyBudget;

  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    const turnChars = turn.reduce(
      (sum, message) => sum + messageTextChars(message),
      0,
    );
    if (turnChars <= remainingHistoryChars) {
      selectedTurns.unshift(turn);
      remainingHistoryChars -= turnChars;
      continue;
    }
    if (selectedTurns.length === 0) {
      selectedTurns.unshift(fitLatestTurn(turn, remainingHistoryChars));
    }
    break;
  }

  return selectedTurns.flat();
}
