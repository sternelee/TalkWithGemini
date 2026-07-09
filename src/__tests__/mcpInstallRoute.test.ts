import { beforeEach, describe, expect, it, vi } from "vitest";

const listMcpToolsMock = vi.hoisted(() => vi.fn());
const registerServerPluginMock = vi.hoisted(() => vi.fn());
const decryptOptionalSecretMock = vi.hoisted(() => vi.fn());
const safeFetchJsonMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api/middleware", async () =>
  vi.importActual("../lib/api/middleware"),
);

vi.mock("@/lib/api/schemas", async () => vi.importActual("../lib/api/schemas"));

vi.mock("@/lib/mcp/client", () => ({
  listMcpTools: listMcpToolsMock,
}));

vi.mock("@/lib/plugin/serverRegistry", () => ({
  registerServerPlugin: registerServerPluginMock,
}));

vi.mock("../lib/byok/server", () => ({
  decryptOptionalSecret: decryptOptionalSecretMock,
}));

vi.mock("@/lib/security/safeFetch", () => ({
  safeFetchJson: safeFetchJsonMock,
}));

vi.mock("@/lib/security/urlPolicy", async () =>
  vi.importActual("../lib/security/urlPolicy"),
);

vi.mock("@/lib/plugin/openapi", async () =>
  vi.importActual("../lib/plugin/openapi"),
);

vi.mock("@/lib/utils/safeServerLog", () => ({
  safeServerLogError: vi.fn(),
}));

function createRequest(body: unknown) {
  return new Request("http://localhost/api/plugins/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSecretEnvelope(context: string) {
  return {
    v: 1,
    kid: "test-key",
    alg: "RSA-OAEP-256+A256GCM",
    iv: "iv",
    wrappedKey: "wrappedKey",
    ciphertext: "ciphertext",
    context,
  };
}

function createRegistryMcpResponse(
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    server: {
      name: "io.github/context7",
      version: "1.2.3",
      description: "Context-aware docs lookup.",
      remotes: [
        {
          type: "streamable-http",
          url: "https://mcp.example.com/mcp",
          headers: [{ name: "X-Client", value: "neo-chat" }],
        },
      ],
      ...overrides,
    },
  };
}

describe("MCP plugin install route", () => {
  beforeEach(() => {
    vi.resetModules();
    listMcpToolsMock.mockReset();
    registerServerPluginMock.mockReset();
    decryptOptionalSecretMock.mockReset();
    safeFetchJsonMock.mockReset();
    decryptOptionalSecretMock.mockResolvedValue(undefined);
    safeFetchJsonMock.mockResolvedValue({
      response: new Response("{}", { status: 200 }),
      data: createRegistryMcpResponse(),
    });
  });

  it("installs a remote MCP server by listing tools and registering a plugin", async () => {
    listMcpToolsMock.mockResolvedValue([
      {
        name: "resolve-library-id",
        description: "Resolve package docs.",
        inputSchema: {
          type: "object",
          properties: { libraryName: { type: "string" } },
          required: ["libraryName"],
        },
      },
    ]);

    const { POST } = await import("../app/api/plugins/install/route");
    const response = await POST(
      createRequest({
        plugin: {
          id: "mcp:io.github/context7:1.2.3",
          source: "mcp",
          title: "io.github/context7",
          description: "Context-aware docs lookup.",
          logoUrl: "",
          manifestUrl:
            "https://registry.modelcontextprotocol.io/v0.1/servers/io.github%2Fcontext7/versions/1.2.3",
          functions: [],
          auth: { type: "none", required: false },
          mcp: {
            transport: "streamable-http",
            serverUrl: "https://mcp.example.com/mcp",
            serverName: "io.github/context7",
            serverVersion: "1.2.3",
            headers: {
              "X-Client": "neo-chat",
            },
            toolNameMap: {},
          },
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(listMcpToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: "https://mcp.example.com/mcp",
        staticHeaders: {
          "X-Client": "neo-chat",
        },
      }),
    );
    expect(registerServerPluginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "mcp",
        functions: [
          expect.objectContaining({
            name: "mcp_io_github_context7__resolve_library_id",
            mcpToolName: "resolve-library-id",
          }),
        ],
        mcp: expect.objectContaining({
          headers: {
            "X-Client": "neo-chat",
          },
          toolNameMap: {
            mcp_io_github_context7__resolve_library_id: "resolve-library-id",
          },
        }),
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      plugin: {
        source: "mcp",
        functions: [
          {
            name: "mcp_io_github_context7__resolve_library_id",
            mcpToolName: "resolve-library-id",
          },
        ],
      },
    });
  });

  it("uses registry MCP metadata instead of client-supplied marketplace endpoint data", async () => {
    listMcpToolsMock.mockResolvedValue([
      {
        name: "resolve-library-id",
        description: "Resolve package docs.",
        inputSchema: { type: "object", properties: {} },
      },
    ]);
    safeFetchJsonMock.mockResolvedValueOnce({
      response: new Response("{}", { status: 200 }),
      data: createRegistryMcpResponse(),
    });

    const { POST } = await import("../app/api/plugins/install/route");
    const response = await POST(
      createRequest({
        plugin: {
          id: "mcp:io.github/context7:1.2.3",
          source: "mcp",
          title: "io.github/context7",
          description: "Tampered client metadata.",
          logoUrl: "",
          manifestUrl:
            "https://registry.modelcontextprotocol.io/v0.1/servers/io.github%2Fcontext7/versions/1.2.3",
          functions: [],
          auth: { type: "none", required: false },
          mcp: {
            transport: "streamable-http",
            serverUrl: "https://attacker.example/mcp",
            serverName: "io.github/context7",
            serverVersion: "1.2.3",
            headers: {
              "X-Client": "attacker",
              "X-Injected": "true",
            },
            toolNameMap: {},
          },
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(listMcpToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: "https://mcp.example.com/mcp",
        staticHeaders: {
          "X-Client": "neo-chat",
        },
      }),
    );
    expect(registerServerPluginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Context-aware docs lookup.",
        mcp: expect.objectContaining({
          serverUrl: "https://mcp.example.com/mcp",
          headers: {
            "X-Client": "neo-chat",
          },
        }),
      }),
    );
  });

  it("rejects MCP servers that do not expose tools", async () => {
    listMcpToolsMock.mockResolvedValue([]);
    safeFetchJsonMock.mockResolvedValueOnce({
      response: new Response("{}", { status: 200 }),
      data: createRegistryMcpResponse({
        name: "empty",
        version: "1.0.0",
        description: "",
      }),
    });

    const { POST } = await import("../app/api/plugins/install/route");
    const response = await POST(
      createRequest({
        plugin: {
          id: "mcp:empty:1.0.0",
          source: "mcp",
          title: "empty",
          description: "",
          logoUrl: "",
          manifestUrl:
            "https://registry.modelcontextprotocol.io/v0.1/servers/empty",
          functions: [],
          auth: { type: "none", required: false },
          mcp: {
            transport: "streamable-http",
            serverUrl: "https://mcp.example.com/mcp",
            serverName: "empty",
            serverVersion: "1.0.0",
            toolNameMap: {},
          },
        },
      }) as any,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "MCP server does not expose any supported tools",
    });
    expect(registerServerPluginMock).not.toHaveBeenCalled();
  });

  it("installs a custom auth-required MCP server with install-time bearer auth", async () => {
    decryptOptionalSecretMock.mockResolvedValue("secret-token");
    listMcpToolsMock.mockResolvedValue([
      {
        name: "private-search",
        description: "Search private data.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    ]);

    const { POST } = await import("../app/api/plugins/install/route");
    const response = await POST(
      createRequest({
        plugin: {
          id: "custom-mcp-private-123456",
          source: "mcp",
          title: "Private MCP",
          description: "Custom private MCP server.",
          logoUrl: "",
          manifestUrl: "",
          functions: [],
          category: "MCP",
          categories: ["MCP"],
          auth: {
            type: "bearer",
            name: "Authorization",
            in: "header",
            required: true,
          },
          mcp: {
            transport: "streamable-http",
            serverUrl: "https://mcp.example.com/mcp",
            serverName: "Private MCP",
            serverVersion: "custom",
            toolNameMap: {},
          },
        },
        authConfig: {
          type: "bearer",
          key: "Authorization",
          addTo: "header",
          valueSecret: createSecretEnvelope(
            "plugin:custom-mcp-private-123456:auth",
          ),
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(decryptOptionalSecretMock).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "plugin:custom-mcp-private-123456:auth",
      }),
      "plugin:custom-mcp-private-123456:auth",
    );
    expect(listMcpToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: "https://mcp.example.com/mcp",
        authConfig: {
          type: "bearer",
          key: "Authorization",
          addTo: "header",
          value: "secret-token",
        },
      }),
    );
    expect(registerServerPluginMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "custom-mcp-private-123456",
        source: "mcp",
        auth: expect.objectContaining({
          type: "bearer",
          required: true,
        }),
        functions: [
          expect.objectContaining({
            name: "mcp_Private_MCP__private_search",
            mcpToolName: "private-search",
          }),
        ],
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      plugin: {
        id: "custom-mcp-private-123456",
        source: "mcp",
        functions: [
          {
            name: "mcp_Private_MCP__private_search",
            mcpToolName: "private-search",
          },
        ],
      },
    });
  });

  it("rejects auth-required MCP servers before unauthenticated tool listing", async () => {
    safeFetchJsonMock.mockResolvedValueOnce({
      response: new Response("{}", { status: 200 }),
      data: createRegistryMcpResponse({
        name: "private",
        version: "1.0.0",
        description: "",
        remotes: [
          {
            type: "streamable-http",
            url: "https://mcp.example.com/mcp",
            headers: [
              {
                name: "Authorization",
                value: "{token}",
                isRequired: true,
                isSecret: true,
              },
            ],
          },
        ],
      }),
    });

    const { POST } = await import("../app/api/plugins/install/route");
    const response = await POST(
      createRequest({
        plugin: {
          id: "mcp:private:1.0.0",
          source: "mcp",
          title: "private",
          description: "",
          logoUrl: "",
          manifestUrl:
            "https://registry.modelcontextprotocol.io/v0.1/servers/private",
          functions: [],
          auth: {
            type: "bearer",
            name: "Authorization",
            in: "header",
            required: true,
          },
          mcp: {
            transport: "streamable-http",
            serverUrl: "https://mcp.example.com/mcp",
            serverName: "private",
            serverVersion: "1.0.0",
            toolNameMap: {},
          },
        },
      }) as any,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "MCP server requires authentication before tools can be listed",
    });
    expect(listMcpToolsMock).not.toHaveBeenCalled();
    expect(registerServerPluginMock).not.toHaveBeenCalled();
  });
});
