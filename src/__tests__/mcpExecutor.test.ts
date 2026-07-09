import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLUGIN_EXECUTION_LIMITS } from "../config/limits";

const callMcpToolMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/mcp/client", () => ({
  callMcpTool: callMcpToolMock,
}));

describe("MCP executor", () => {
  beforeEach(() => {
    callMcpToolMock.mockReset();
  });

  it("maps MCP tool-level errors to the existing plugin error shape", async () => {
    callMcpToolMock.mockResolvedValue({
      isError: true,
      content: [{ type: "text", text: "No access" }],
    });

    const { executeMcpToolRequest } = await import("../lib/mcp/executor");
    const result = await executeMcpToolRequest({
      serverUrl: "https://mcp.example.com/mcp",
      toolName: "private-search",
      args: {},
    });

    expect(result).toEqual({ error: "No access" });
  });

  it("truncates oversized MCP success results without marking them as errors", async () => {
    callMcpToolMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: "x".repeat(PLUGIN_EXECUTION_LIMITS.maxRequestBodyChars),
        },
      ],
    });

    const { executeMcpToolRequest } = await import("../lib/mcp/executor");
    const result = await executeMcpToolRequest({
      serverUrl: "https://mcp.example.com/mcp",
      toolName: "large-result",
      args: {},
    });

    expect(result).toMatchObject({ truncated: true });
    expect(result).not.toMatchObject({ isError: true });
    expect(result).not.toHaveProperty("error");
  });
});
