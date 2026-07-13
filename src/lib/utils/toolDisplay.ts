import { TOOL_DISPLAY_LIMITS } from "@/config/limits";

export interface ToolDisplayValue {
  text: string;
  truncated: boolean;
}

type DisplayJson =
  | string
  | number
  | boolean
  | null
  | DisplayJson[]
  | { [key: string]: DisplayJson };

const CIRCULAR_PLACEHOLDER = "[Circular]";
const DEPTH_PLACEHOLDER = "[Max depth reached]";
const OMITTED_KEYS_KEY = "__omitted_keys__";

function markTruncated(state: { truncated: boolean }) {
  state.truncated = true;
}

function trimText(
  value: string,
  maxChars: number,
  state: { truncated: boolean },
): string {
  if (value.length <= maxChars) return value;
  markTruncated(state);
  if (maxChars <= 3) return value.slice(0, maxChars);
  return `${value.slice(0, maxChars - 3)}...`;
}

function normalizeForDisplay(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  state: { truncated: boolean },
): DisplayJson {
  if (value === null) return null;

  switch (typeof value) {
    case "string":
      return trimText(value, TOOL_DISPLAY_LIMITS.maxStringChars, state);
    case "number":
      return Number.isFinite(value) ? value : String(value);
    case "boolean":
      return value;
    case "bigint":
      return `${value.toString()}n`;
    case "undefined":
      return "[undefined]";
    case "symbol":
      return value.description ? `[Symbol(${value.description})]` : "[Symbol]";
    case "function":
      return "[Function]";
    case "object":
      break;
    default:
      return String(value);
  }

  if (depth >= TOOL_DISPLAY_LIMITS.maxDepth) {
    markTruncated(state);
    return DEPTH_PLACEHOLDER;
  }

  if (seen.has(value)) {
    markTruncated(state);
    return CIRCULAR_PLACEHOLDER;
  }

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value
        .slice(0, TOOL_DISPLAY_LIMITS.maxArrayItems)
        .map((item) => normalizeForDisplay(item, depth + 1, seen, state));

      if (value.length > TOOL_DISPLAY_LIMITS.maxArrayItems) {
        markTruncated(state);
        items.push(
          `[${value.length - TOOL_DISPLAY_LIMITS.maxArrayItems} more items omitted]`,
        );
      }

      return items;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    const result: { [key: string]: DisplayJson } = {};
    for (const [key, entryValue] of entries.slice(
      0,
      TOOL_DISPLAY_LIMITS.maxObjectEntries,
    )) {
      const safeKey = trimText(key, TOOL_DISPLAY_LIMITS.maxStringChars, state);
      result[safeKey] = normalizeForDisplay(entryValue, depth + 1, seen, state);
    }

    if (entries.length > TOOL_DISPLAY_LIMITS.maxObjectEntries) {
      markTruncated(state);
      result[OMITTED_KEYS_KEY] =
        `${entries.length - TOOL_DISPLAY_LIMITS.maxObjectEntries} more keys omitted`;
    }

    return result;
  } catch (error) {
    markTruncated(state);
    return error instanceof Error
      ? `[Unserializable: ${error.message}]`
      : "[Unserializable]";
  } finally {
    seen.delete(value);
  }
}

export function formatToolDisplayValue(value: unknown): ToolDisplayValue {
  const state = { truncated: false };
  const normalized = normalizeForDisplay(value, 0, new WeakSet(), state);
  let text: string;

  try {
    text =
      typeof normalized === "string"
        ? normalized
        : JSON.stringify(normalized, null, 2);
  } catch (error) {
    state.truncated = true;
    text =
      error instanceof Error
        ? `[Unserializable: ${error.message}]`
        : "[Unserializable]";
  }

  if (text.length > TOOL_DISPLAY_LIMITS.maxRenderedChars) {
    state.truncated = true;
    const suffix = "\n[Display truncated]";
    const budget = Math.max(
      0,
      TOOL_DISPLAY_LIMITS.maxRenderedChars - suffix.length,
    );
    text = `${text.slice(0, budget)}${suffix}`;
  }

  return {
    text,
    truncated: state.truncated,
  };
}

export function formatToolDisplayName(name: unknown): string {
  const raw = typeof name === "string" ? name : "unknown_tool";
  const normalized = raw
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();

  return (
    trimText(
      normalized || "Unknown Tool",
      TOOL_DISPLAY_LIMITS.maxToolNameChars,
      { truncated: false },
    ) || "Unknown Tool"
  );
}
