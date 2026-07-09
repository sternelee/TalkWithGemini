import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Plugin } from "../types";

const encryptSecretMock = vi.hoisted(() => vi.fn());
const storeMock = vi.hoisted(() => ({
  state: {} as {
    marketPlugins: Plugin[];
    marketPluginsTimestamp: number;
    marketMcpServers: Plugin[];
    marketMcpServersTimestamp: number;
    setMarketPlugins: ReturnType<typeof vi.fn>;
    setMarketMcpServers: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("@/store/core/settingsStore", () => ({
  useSettingsStore: {
    getState: () => storeMock.state,
  },
}));

vi.mock("../lib/utils/devLogger", () => ({
  logDevError: vi.fn(),
  logDevInfo: vi.fn(),
  logDevWarn: vi.fn(),
}));

vi.mock("../lib/api/client", async () => {
  const actual = await vi.importActual("../lib/api/client");
  return {
    ...actual,
    signedApiFetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, init),
    ),
  };
});

vi.mock("../lib/byok/client", () => ({
  BYOK_CONTEXTS: {
    pluginAuth: (pluginId: string) => `plugin:${pluginId}:auth`,
  },
  encryptSecret: encryptSecretMock,
}));

const pluginA: Plugin = {
  id: "example.com:alpha",
  title: "Alpha",
  description: "Alpha plugin",
  logoUrl: "",
  manifestUrl: "https://example.com/alpha.json",
  functions: [],
};

const pluginB: Plugin = {
  id: "example.com:beta",
  title: "Beta",
  description: "Beta plugin",
  logoUrl: "",
  manifestUrl: "https://example.com/beta.json",
  functions: [],
};

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

function getFetchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls as Array<[RequestInfo | URL, RequestInit?]>;
}

describe("plugin market service cache", () => {
  beforeEach(() => {
    vi.resetModules();
    encryptSecretMock.mockReset();
    storeMock.state = {
      marketPlugins: [],
      marketPluginsTimestamp: 0,
      marketMcpServers: [],
      marketMcpServersTimestamp: 0,
      setMarketPlugins: vi.fn((plugins: Plugin[]) => {
        storeMock.state.marketPlugins = plugins;
        storeMock.state.marketPluginsTimestamp = Date.now();
      }),
      setMarketMcpServers: vi.fn((plugins: Plugin[]) => {
        storeMock.state.marketMcpServers = plugins;
        storeMock.state.marketMcpServersTimestamp = Date.now();
      }),
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns valid cached plugins without fetching", async () => {
    storeMock.state.marketPlugins = [pluginA];
    storeMock.state.marketPluginsTimestamp = Date.now();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchApiGuruList } = await import("../services/api/pluginService");
    const plugins = await fetchApiGuruList();

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject(pluginA);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps cached plugins fresh for 72 hours", async () => {
    storeMock.state.marketPlugins = [pluginA];
    storeMock.state.marketPluginsTimestamp = Date.now() - 48 * 60 * 60 * 1000;
    const fetchMock = vi.fn(async () => jsonResponse({ plugins: [pluginB] }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchApiGuruList } = await import("../services/api/pluginService");
    const plugins = await fetchApiGuruList();

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject(pluginA);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes cached plugins after 72 hours", async () => {
    storeMock.state.marketPlugins = [pluginA];
    storeMock.state.marketPluginsTimestamp = Date.now() - 73 * 60 * 60 * 1000;
    const fetchMock = vi.fn(async () => jsonResponse({ plugins: [pluginB] }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchApiGuruList } = await import("../services/api/pluginService");
    const plugins = await fetchApiGuruList();

    expect(getFetchCalls(fetchMock)[0]?.[0]).toBe("/api/plugins/list");
    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject(pluginB);
  });

  it("force refresh bypasses cache and stores fresh plugins", async () => {
    storeMock.state.marketPlugins = [pluginA];
    storeMock.state.marketPluginsTimestamp = Date.now();
    const fetchMock = vi.fn(async () => jsonResponse({ plugins: [pluginB] }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchApiGuruList } = await import("../services/api/pluginService");
    const plugins = await fetchApiGuruList(true);

    expect(getFetchCalls(fetchMock)[0]?.[0]).toBe("/api/plugins/list");
    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject(pluginB);
    expect(storeMock.state.setMarketPlugins).toHaveBeenCalledWith([
      expect.objectContaining(pluginB),
    ]);
  });

  it("falls back to stale cache when refreshing fails", async () => {
    storeMock.state.marketPlugins = [pluginA];
    storeMock.state.marketPluginsTimestamp = Date.now() - 25 * 60 * 60 * 1000;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "failed" }, { status: 500 })),
    );

    const { fetchApiGuruList } = await import("../services/api/pluginService");
    const plugins = await fetchApiGuruList();

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject(pluginA);
  });

  it("reuses an in-flight plugin list request", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { fetchApiGuruList } = await import("../services/api/pluginService");
    const first = fetchApiGuruList();
    const second = fetchApiGuruList();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch?.(jsonResponse({ plugins: [pluginA] }));

    await expect(first).resolves.toEqual([expect.objectContaining(pluginA)]);
    await expect(second).resolves.toEqual([expect.objectContaining(pluginA)]);
  });

  it("caches MCP server market data separately from OpenAPI plugins", async () => {
    storeMock.state.marketPlugins = [pluginA];
    storeMock.state.marketPluginsTimestamp = Date.now();
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        servers: [
          {
            server: {
              name: "io.github/context7",
              version: "1.2.3",
              description: "Context-aware docs lookup.",
              remotes: [
                {
                  type: "streamable-http",
                  url: "https://mcp.example.com/mcp",
                },
              ],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { fetchMcpServerList, fetchApiGuruList } =
      await import("../services/api/pluginService");
    const mcpServers = await fetchMcpServerList(true);
    const openApiPlugins = await fetchApiGuruList();

    const registryUrl = new URL(String(getFetchCalls(fetchMock)[0]?.[0]));
    expect(registryUrl.origin).toBe("https://registry.modelcontextprotocol.io");
    expect(registryUrl.pathname).toBe("/v0.1/servers");
    expect(registryUrl.searchParams.get("version")).toBe("latest");
    expect(mcpServers).toEqual([
      expect.objectContaining({
        id: "mcp:io.github/context7:1.2.3",
        source: "mcp",
        title: "io.github/context7",
      }),
    ]);
    expect(openApiPlugins).toEqual([expect.objectContaining(pluginA)]);
    expect(storeMock.state.setMarketMcpServers).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "mcp:io.github/context7:1.2.3",
        source: "mcp",
      }),
    ]);
  });

  it("fetches paged MCP servers directly from the MCP registry", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        servers: [
          {
            server: {
              name: "io.github/context7",
              version: "1.2.3",
              description: "Context-aware docs lookup.",
              remotes: [
                {
                  type: "streamable-http",
                  url: "https://mcp.example.com/mcp",
                },
              ],
            },
          },
        ],
        metadata: { nextCursor: "next-cursor" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { fetchMcpServerPage } =
      await import("../services/api/pluginService");
    const page = await fetchMcpServerPage({
      cursor: "start-cursor",
      search: "context",
      limit: 1,
    });

    const requestUrl = new URL(String(getFetchCalls(fetchMock)[0]?.[0]));
    expect(requestUrl.origin).toBe("https://registry.modelcontextprotocol.io");
    expect(requestUrl.pathname).toBe("/v0.1/servers");
    expect(requestUrl.searchParams.get("cursor")).toBe("start-cursor");
    expect(requestUrl.searchParams.get("search")).toBe("context");
    expect(requestUrl.searchParams.get("version")).toBe("latest");
    expect(requestUrl.searchParams.get("limit")).toBe("100");
    expect(page).toEqual({
      plugins: [
        expect.objectContaining({
          id: "mcp:io.github/context7:1.2.3",
          source: "mcp",
          title: "io.github/context7",
          mcp: expect.objectContaining({
            serverUrl: "https://mcp.example.com/mcp",
          }),
        }),
      ],
      nextCursor: "next-cursor",
    });
    expect(storeMock.state.setMarketMcpServers).not.toHaveBeenCalled();
  });

  it("falls back to the MCP server route when direct registry fetching fails", async () => {
    const mcpPlugin: Plugin = {
      id: "mcp:io.github/context7:1.2.3",
      title: "io.github/context7",
      description: "Context-aware docs lookup.",
      logoUrl: "",
      manifestUrl: "",
      source: "mcp",
      functions: [],
      auth: { type: "none", required: false },
      mcp: {
        transport: "streamable-http",
        serverUrl: "https://mcp.example.com/mcp",
        serverName: "io.github/context7",
        serverVersion: "1.2.3",
        toolNameMap: {},
      },
    };
    const fetchMock = vi.fn(async () =>
      fetchMock.mock.calls.length === 1
        ? jsonResponse({ error: "registry unavailable" }, { status: 503 })
        : jsonResponse({ plugins: [mcpPlugin], nextCursor: "next-cursor" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { fetchMcpServerPage } =
      await import("../services/api/pluginService");
    const page = await fetchMcpServerPage({
      cursor: "start-cursor",
      search: "context",
      limit: 20,
    });

    const directUrl = new URL(String(getFetchCalls(fetchMock)[0]?.[0]));
    const requestUrl = new URL(
      String(getFetchCalls(fetchMock)[1]?.[0]),
      "http://localhost",
    );
    expect(directUrl.origin).toBe("https://registry.modelcontextprotocol.io");
    expect(requestUrl.pathname).toBe("/api/mcp/servers");
    expect(requestUrl.searchParams.get("cursor")).toBe("start-cursor");
    expect(requestUrl.searchParams.get("search")).toBe("context");
    expect(requestUrl.searchParams.get("limit")).toBe("20");
    expect(page).toEqual({
      plugins: [expect.objectContaining(mcpPlugin)],
      nextCursor: "next-cursor",
    });
    expect(storeMock.state.setMarketMcpServers).not.toHaveBeenCalled();
  });

  it("surfaces marketplace plugin install API errors", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          error:
            "MCP server requires authentication before tools can be listed",
        },
        { status: 400 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { installPlugin } = await import("../services/api/pluginService");

    await expect(
      installPlugin({
        id: "mcp:private:1.0.0",
        title: "private",
        description: "",
        logoUrl: "",
        manifestUrl: "",
        source: "mcp",
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
      }),
    ).rejects.toThrow(
      "MCP server requires authentication before tools can be listed",
    );
  });

  it("installs a custom MCP server without auth through the shared install API", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body || "{}"));
        return jsonResponse({
          plugin: {
            ...payload.plugin,
            functions: [
              {
                name: "mcp_private_docs__search",
                description: "Search docs.",
                parameters: { type: "object", properties: {} },
                mcpToolName: "search",
              },
            ],
          },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const { installCustomMcpServer } =
      await import("../services/api/pluginService");
    const plugin = await installCustomMcpServer({
      name: "Private Docs",
      serverUrl: "https://mcp.example.com/mcp",
    });

    const [, requestInit] = getFetchCalls(fetchMock)[0];
    const payload = JSON.parse(String(requestInit?.body || "{}"));
    expect(getFetchCalls(fetchMock)[0]?.[0]).toBe("/api/plugins/install");
    expect(payload).toMatchObject({
      plugin: {
        id: expect.stringMatching(/^custom-mcp-private-docs-\d+$/),
        source: "mcp",
        title: "Private Docs",
        auth: { type: "none", required: false },
        mcp: {
          transport: "streamable-http",
          serverUrl: "https://mcp.example.com/mcp",
          serverName: "Private Docs",
          serverVersion: "custom",
          toolNameMap: {},
        },
      },
    });
    expect(payload.authConfig).toBeUndefined();
    expect(encryptSecretMock).not.toHaveBeenCalled();
    expect(plugin).toMatchObject({
      source: "mcp",
      functions: [
        expect.objectContaining({
          mcpToolName: "search",
        }),
      ],
    });
  });

  it("encrypts a custom MCP bearer token for install-time tool discovery", async () => {
    encryptSecretMock.mockResolvedValue({
      v: 1,
      kid: "test-key",
      alg: "RSA-OAEP-256+A256GCM",
      iv: "iv",
      wrappedKey: "wrappedKey",
      ciphertext: "ciphertext",
      context: "plugin:custom-mcp-private-docs-123:auth",
    });
    vi.spyOn(Date, "now").mockReturnValue(123);
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body || "{}"));
        return jsonResponse({
          plugin: {
            ...payload.plugin,
            functions: [
              {
                name: "mcp_private_docs__search",
                description: "Search docs.",
                parameters: { type: "object", properties: {} },
                mcpToolName: "search",
              },
            ],
          },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const { installCustomMcpServer } =
      await import("../services/api/pluginService");
    await installCustomMcpServer({
      name: "Private Docs",
      serverUrl: "https://mcp.example.com/mcp",
      bearerToken: "secret-token",
    });

    expect(encryptSecretMock).toHaveBeenCalledWith(
      "secret-token",
      "plugin:custom-mcp-private-docs-123:auth",
    );
    const [, requestInit] = getFetchCalls(fetchMock)[0];
    const payload = JSON.parse(String(requestInit?.body || "{}"));
    expect(payload).toMatchObject({
      plugin: {
        id: "custom-mcp-private-docs-123",
        auth: {
          type: "bearer",
          name: "Authorization",
          in: "header",
          required: true,
        },
      },
      authConfig: {
        type: "bearer",
        key: "Authorization",
        addTo: "header",
        valueSecret: {
          context: "plugin:custom-mcp-private-docs-123:auth",
        },
      },
    });
  });
});
