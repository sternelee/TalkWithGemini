import {
  searchMemoryRecords,
  shouldExposeMemorySearchTool,
} from "../../../lib/memory/entities";
import {
  formatMemoryToolResult,
  MEMORY_SEARCH_TOOL,
  MEMORY_SEARCH_TOOL_NAME,
} from "../../../lib/memory/tools";
import { useMemoryStore } from "@/store/core/memoryStore";

import { MEMORY_LIMITS } from "../../../config/limits";
import type { ChatToolDefinition } from "./types";

function coerceToolDefinition(tool: unknown): ChatToolDefinition {
  return tool as ChatToolDefinition;
}

export function isBrowserMemoryStorePendingHydration(
  hasHydrated: boolean,
): boolean {
  return typeof window !== "undefined" && !hasHydrated;
}

function isMemorySearchEnabled(): boolean {
  const { _hasHydrated, settings } = useMemoryStore.getState();
  return Boolean(
    !isBrowserMemoryStorePendingHydration(_hasHydrated) &&
    settings.enabled &&
    settings.searchEnabled,
  );
}

function getNumberArg(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function addInternalMemoryTools(
  tools: ChatToolDefinition[],
  toolNames: Set<string>,
  message: string,
): void {
  if (!isMemorySearchEnabled()) return;
  if (!shouldExposeMemorySearchTool(message)) return;
  tools.push(coerceToolDefinition(MEMORY_SEARCH_TOOL));
  toolNames.add(MEMORY_SEARCH_TOOL_NAME);
}

export function isInternalMemoryTool(name: string | undefined): boolean {
  return name === MEMORY_SEARCH_TOOL_NAME;
}

export async function executeMemorySearchTool(args: unknown): Promise<unknown> {
  const state = useMemoryStore.getState();
  const { _hasHydrated, settings, memories } = state;
  if (
    isBrowserMemoryStorePendingHydration(_hasHydrated) ||
    !settings.enabled ||
    !settings.searchEnabled
  ) {
    return { memories: [] };
  }

  const input =
    args && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};
  const query =
    typeof input.query === "string" && input.query.trim() ? input.query : "";
  const limit = getNumberArg(input.limit, MEMORY_LIMITS.defaultSearchResults);
  const results = searchMemoryRecords(memories, query, limit);
  state.markMemoriesUsed(results.map((memory) => memory.id));
  return formatMemoryToolResult(results);
}
