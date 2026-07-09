import { PLUGIN_EXECUTION_LIMITS } from "../../config/limits";
import { callMcpTool, type McpAuthConfig } from "./client";

export interface ExecuteMcpToolRequestOptions {
  serverUrl: string;
  toolName: string;
  args: Record<string, unknown>;
  authConfig?: McpAuthConfig;
  authValue?: string;
  staticHeaders?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getMcpToolErrorMessage(result: Record<string, unknown>): string {
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .map((item) =>
      isRecord(item) && typeof item.text === "string" ? item.text.trim() : "",
    )
    .filter(Boolean)
    .join("\n")
    .trim();

  if (text) return text.slice(0, 4_000);
  if (typeof result.message === "string" && result.message.trim()) {
    return result.message.trim().slice(0, 4_000);
  }
  if (typeof result.error === "string" && result.error.trim()) {
    return result.error.trim().slice(0, 4_000);
  }
  return "MCP tool returned an error.";
}

function compactMcpResult(result: unknown): unknown {
  if (isRecord(result) && result.isError === true) {
    return { error: getMcpToolErrorMessage(result) };
  }

  try {
    const serialized = JSON.stringify(result);
    if (
      !serialized ||
      serialized.length <= PLUGIN_EXECUTION_LIMITS.maxRequestBodyChars
    ) {
      return result;
    }

    return {
      content: [
        {
          type: "text",
          text: `${serialized.slice(
            0,
            PLUGIN_EXECUTION_LIMITS.maxRequestBodyChars,
          )}...`,
        },
      ],
      truncated: true,
    };
  } catch {
    return {
      error: "MCP tool returned an unserializable result.",
    };
  }
}

export async function executeMcpToolRequest(
  options: ExecuteMcpToolRequestOptions,
): Promise<unknown> {
  const result = await callMcpTool({
    serverUrl: options.serverUrl,
    toolName: options.toolName,
    args: options.args,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    staticHeaders: options.staticHeaders,
    authConfig: {
      ...options.authConfig,
      value: options.authValue,
    },
  });

  return compactMcpResult(result);
}
