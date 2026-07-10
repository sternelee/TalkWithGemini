import { beforeEach, describe, expect, it, vi } from "vitest";

const executeMcpToolRequestMock = vi.hoisted(() => vi.fn());
const decryptOptionalSecretMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api/middleware", async () =>
  vi.importActual("../lib/api/middleware"),
);

vi.mock("@/lib/api/schemas", async () => vi.importActual("../lib/api/schemas"));

vi.mock("../lib/mcp/executor", () => ({
  executeMcpToolRequest: executeMcpToolRequestMock,
}));

vi.mock("@/lib/byok/server", () => ({
  decryptOptionalSecret: decryptOptionalSecretMock,
}));

vi.mock("@/lib/security/safeFetch", () => ({
  safeFetchText: vi.fn(),
}));

vi.mock("@/lib/security/deployment", async () =>
  vi.importActual("../lib/security/deployment"),
);

vi.mock("@/lib/utils/safeServerLog", () => ({
  safeServerLogError: vi.fn(),
}));

function createRequest(body: unknown, signal?: AbortSignal) {
  return new Request("http://localhost/api/plugins/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

describe("MCP plugin execute route", () => {
  beforeEach(() => {
    vi.resetModules();
    executeMcpToolRequestMock.mockReset();
    decryptOptionalSecretMock.mockReset();
  });

  it("dispatches MCP plugin execution through the MCP executor", async () => {
    const controller = new AbortController();
    executeMcpToolRequestMock.mockResolvedValue({
      structuredContent: { answer: "ok" },
    });

    const { registerServerPlugin } =
      await import("../lib/plugin/serverRegistry");
    await registerServerPlugin({
      id: "mcp:io.github/context7:1.2.3",
      title: "io.github/context7",
      description: "",
      logoUrl: "",
      manifestUrl: "",
      source: "mcp",
      functions: [
        {
          name: "mcp_io_github_context7__resolve_library_id",
          mcpToolName: "resolve-library-id",
          description: "Resolve package docs.",
          parameters: { type: "object", properties: {} },
          risk: "external",
        },
      ],
      auth: { type: "none", required: false },
      mcp: {
        transport: "streamable-http",
        serverUrl: "https://mcp.example.com/mcp",
        serverName: "io.github/context7",
        serverVersion: "1.2.3",
        headers: {
          "X-Client": "neo-chat",
        },
        toolNameMap: {
          mcp_io_github_context7__resolve_library_id: "resolve-library-id",
        },
      },
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const request = createRequest(
      {
        pluginId: "mcp:io.github/context7:1.2.3",
        functionName: "mcp_io_github_context7__resolve_library_id",
        args: { libraryName: "react" },
      },
      controller.signal,
    );
    const response = await POST(request as any);

    expect(response.status).toBe(200);
    expect(executeMcpToolRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: "https://mcp.example.com/mcp",
        toolName: "resolve-library-id",
        args: { libraryName: "react" },
        signal: request.signal,
        staticHeaders: {
          "X-Client": "neo-chat",
        },
      }),
    );
    await expect(response.json()).resolves.toEqual({
      result: { structuredContent: { answer: "ok" } },
    });
  });
});
