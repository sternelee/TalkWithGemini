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
