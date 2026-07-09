import { describe, expect, it } from "vitest";
import { MARKET_LIMITS } from "../config/limits";
import {
  normalizeApiGuruPlugins,
  normalizeMarketPlugin,
  normalizeMarketPlugins,
} from "../lib/market/plugins";

describe("market plugin normalization", () => {
  it("keeps valid plugins with trimmed fields and category limits", () => {
    const plugin = normalizeMarketPlugin({
      id: "example.com:api",
      title: "  Example API  ",
      description: "x".repeat(MARKET_LIMITS.maxPluginDescriptionChars + 10),
      logoUrl: "https://example.com/logo.png",
      manifestUrl: "https://example.com/openapi.json",
      externalDocsUrl: "https://example.com/docs",
      category: "",
      categories: ["Search", "search", "", "Images"],
      functions: [{ name: "ignored" }],
      added: "2026-01-01",
    });

    expect(plugin).toMatchObject({
      id: "example.com:api",
      title: "Example API",
      logoUrl: "https://example.com/logo.png",
      manifestUrl: "https://example.com/openapi.json",
      externalDocsUrl: "https://example.com/docs",
      category: "Search",
      categories: ["Search", "Images"],
      functions: [],
    });
    expect(plugin?.description).toHaveLength(
      MARKET_LIMITS.maxPluginDescriptionChars,
    );
  });

  it("drops malformed plugins and unsafe identifiers or manifest URLs", () => {
    expect(normalizeMarketPlugin(null)).toBeNull();
    expect(
      normalizeMarketPlugin({
        id: "bad/plugin",
        manifestUrl: "https://example.com/openapi.json",
      }),
    ).toBeNull();
    expect(
      normalizeMarketPlugin({
        id: "good-plugin",
        manifestUrl: "javascript:alert(1)",
      }),
    ).toBeNull();
  });

  it("keeps MCP metadata HTTPS-only while allowing LAN endpoints", () => {
    expect(
      normalizeMarketPlugin({
        id: "mcp:lan:1.0.0",
        source: "mcp",
        title: "LAN MCP",
        manifestUrl:
          "https://registry.modelcontextprotocol.io/v0.1/servers/lan",
        mcp: {
          transport: "streamable-http",
          serverUrl: "https://192.168.1.10/mcp",
          serverName: "lan",
          headers: { "X-Client": "neo-chat" },
          toolNameMap: {},
        },
      }),
    ).toMatchObject({
      source: "mcp",
      mcp: {
        serverUrl: "https://192.168.1.10/mcp",
        headers: { "X-Client": "neo-chat" },
      },
    });

    expect(
      normalizeMarketPlugin({
        id: "mcp:lan-http:1.0.0",
        source: "mcp",
        title: "LAN HTTP MCP",
        manifestUrl: "",
        mcp: {
          transport: "streamable-http",
          serverUrl: "http://192.168.1.10/mcp",
          serverName: "lan-http",
          toolNameMap: {},
        },
      }),
    ).toBeNull();
  });

  it("deduplicates and caps plugin lists", () => {
    const plugins = Array.from(
      { length: MARKET_LIMITS.maxPlugins + 10 },
      (_, index) => ({
        id: `plugin-${index}`,
        title: `Plugin ${index}`,
        manifestUrl: `https://example.com/${index}.json`,
      }),
    );

    const normalized = normalizeMarketPlugins([
      ...plugins,
      { id: "plugin-1", manifestUrl: "https://example.com/duplicate.json" },
    ]);

    expect(normalized).toHaveLength(MARKET_LIMITS.maxPlugins);
    expect(normalized[1]?.title).toBe("Plugin 1");
  });

  it("converts malformed APIs.guru data without failing the whole list", () => {
    const plugins = normalizeApiGuruPlugins({
      "bad.example.com": { preferred: "v1", versions: {} },
      "google.example.com": {
        preferred: "v1",
        versions: {
          v1: {
            swaggerUrl: "https://example.com/google.json",
            info: { title: "Filtered Google" },
          },
        },
      },
      "good.example.com": {
        preferred: "v1",
        added: "2026-01-01",
        versions: {
          v1: {
            swaggerUrl: "https://example.com/openapi.json",
            info: {
              title: "Good",
              description: "Useful API",
              "x-logo": { url: "https://example.com/logo.png" },
              "x-apisguru-categories": ["tools"],
            },
            externalDocs: { url: "https://example.com/docs" },
          },
        },
      },
    });

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      id: "good.example.com",
      title: "Good",
      category: "tools",
    });
  });
});
