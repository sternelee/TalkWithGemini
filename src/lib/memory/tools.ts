import { MEMORY_LIMITS } from "@/config/limits";
import type { MemoryRecord } from "./types";

export const MEMORY_SEARCH_TOOL_NAME = "memory_search";
export const MEMORY_RECORD_TOOL_NAME = "memory_record";
export const MEMORY_DREAM_TOOL_NAME = "memory_dream";

export const MEMORY_SEARCH_TOOL = {
  type: "function",
  function: {
    name: MEMORY_SEARCH_TOOL_NAME,
    description:
      "Search local long-term memory only when the user explicitly asks about remembered, previous, or missing context that is not already present.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Short search query for relevant local memories.",
        },
        limit: {
          type: "number",
          description: "Maximum memories to return. Defaults to 5.",
        },
      },
      required: ["query"],
    },
  },
} as const;

export const MEMORY_RECORD_TOOL = {
  type: "function",
  function: {
    name: MEMORY_RECORD_TOOL_NAME,
    description:
      "Save only durable, important user preferences, instructions, project facts, decisions, warnings, or stable context.",
    parameters: {
      type: "object",
      properties: {
        memories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "fact",
                  "preference",
                  "instruction",
                  "project",
                  "warning",
                  "decision",
                  "context",
                ],
              },
              content: { type: "string" },
              importance: { type: "number" },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["type", "content"],
          },
        },
      },
      required: ["memories"],
    },
  },
} as const;

export const MEMORY_DREAM_TOOL = {
  type: "function",
  function: {
    name: MEMORY_DREAM_TOOL_NAME,
    description:
      "Consolidate long-term memories into a smaller, more useful set of active memories.",
    parameters: MEMORY_RECORD_TOOL.function.parameters,
  },
} as const;

export function createMemoryExtractionPrompt(input: {
  userMessage: string;
  assistantMessage: string;
}): string {
  const userMessage = input.userMessage.slice(
    0,
    MEMORY_LIMITS.maxExtractionContextChars / 2,
  );
  const assistantMessage = input.assistantMessage.slice(
    0,
    MEMORY_LIMITS.maxExtractionContextChars / 2,
  );

  return `Review the latest exchange and decide whether it contains durable long-term memory worth saving.

Save only important stable information such as user preferences, explicit standing instructions, project facts, risks, decisions, or context that should influence future answers.
Do not save transient requests, small talk, one-off tasks, or generic facts.

Call ${MEMORY_RECORD_TOOL_NAME} with an empty memories array if nothing is worth saving.

<latest_exchange>
<user>${userMessage}</user>
<assistant>${assistantMessage}</assistant>
</latest_exchange>`;
}

export function createMemoryDreamPrompt(input: {
  memories: MemoryRecord[];
  targetCount: number;
}): string {
  const serialized = JSON.stringify(
    input.memories.map((memory) => ({
      id: memory.id,
      type: memory.type,
      content: memory.content,
      importance: memory.importance,
      tags: memory.tags,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
      lastUsedAt: memory.lastUsedAt,
    })),
    null,
    2,
  ).slice(0, MEMORY_LIMITS.maxDreamPromptChars);

  return `Consolidate these local long-term memories into at most ${input.targetCount} high-value memories.

Rules:
- Merge duplicates and overlapping ideas.
- Keep important user preferences, standing instructions, project facts, warnings, decisions, and stable context.
- Drop stale, low-value, vague, or one-off memories.
- Preserve useful tags and importance.
- Call ${MEMORY_DREAM_TOOL_NAME} with the final memories.

<memories_json>
${serialized}
</memories_json>`;
}

export function formatMemoryToolResult(memories: MemoryRecord[]) {
  return {
    memories: memories.map((memory) => ({
      id: memory.id,
      type: memory.type,
      content: memory.content.slice(0, MEMORY_LIMITS.maxToolResultContentChars),
      importance: memory.importance,
      tags: memory.tags,
      updatedAt: memory.updatedAt,
    })),
  };
}
