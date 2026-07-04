import { describe, expect, it } from "vitest";
import { RAG_LIMITS, SEARCH_CONFIG_LIMITS } from "../config/limits";
import {
  normalizeRAGConfig,
  normalizeSearchConfig,
  normalizeSearchSettings,
} from "../lib/settings/searchRag";

describe("search and RAG settings normalization", () => {
  it("falls back invalid search providers and clamps result limits", () => {
    const search = normalizeSearchSettings({
      provider: "unknown",
      resultsLimit: 999,
      configs: {
        tavily: { apiKey: " key " },
        searxng: { baseUrl: "" },
        injected: { apiKey: "bad" },
      },
    });

    expect(search.provider).toBe("firecrawl");
    expect(search.resultsLimit).toBe(SEARCH_CONFIG_LIMITS.maxResultsLimit);
    expect(search.configs.tavily.apiKey).toBe("key");
    expect(search.configs.searxng.baseUrl).toBe("http://localhost:8080");
    expect(search.configs).not.toHaveProperty("injected");
  });

  it("falls back missing search settings to Firecrawl", () => {
    const search = normalizeSearchSettings(undefined);

    expect(search.provider).toBe("firecrawl");
    expect(search.configs.firecrawl.apiKey).toBe("");
  });

  it("trims and caps search API keys and base URLs", () => {
    const apiKey = ` ${"k".repeat(SEARCH_CONFIG_LIMITS.maxApiKeyChars + 10)}`;
    const baseUrl = ` https://example.com/${"u".repeat(
      SEARCH_CONFIG_LIMITS.maxBaseUrlChars,
    )}`;

    const tavily = normalizeSearchConfig("tavily", { apiKey, baseUrl });
    const searxng = normalizeSearchConfig("searxng", { baseUrl });

    expect(tavily?.apiKey).toHaveLength(SEARCH_CONFIG_LIMITS.maxApiKeyChars);
    expect(tavily?.baseUrl).toHaveLength(SEARCH_CONFIG_LIMITS.maxBaseUrlChars);
    expect(searxng?.baseUrl).toHaveLength(SEARCH_CONFIG_LIMITS.maxBaseUrlChars);
    expect(normalizeSearchConfig("google", { apiKey })).toBeUndefined();
  });

  it("normalizes RAG credentials, namespace, and numeric ranges", () => {
    const rag = normalizeRAGConfig({
      enabled: "true",
      url: ` https://rag.example/${"u".repeat(RAG_LIMITS.maxBaseUrlChars)}`,
      token: ` ${"t".repeat(RAG_LIMITS.maxTokenChars + 10)}`,
      topK: 500,
      chunkSize: 1,
      llamaParseApiKey: " llama-key ",
      namespace: ` ns-${"x".repeat(RAG_LIMITS.maxNamespaceChars)}`,
    });

    expect(rag.enabled).toBe(false);
    expect(rag.url).toHaveLength(RAG_LIMITS.maxBaseUrlChars);
    expect(rag.token).toHaveLength(RAG_LIMITS.maxTokenChars);
    expect(rag.topK).toBe(RAG_LIMITS.maxTopK);
    expect(rag.chunkSize).toBe(RAG_LIMITS.minChunkSize);
    expect(rag.documentParseProvider).toBe("mineru");
    expect(rag.llamaParseApiKey).toBe("llama-key");
    expect(rag.mineruApiToken).toBe("");
    expect(rag.namespace).toHaveLength(RAG_LIMITS.maxNamespaceChars);
  });

  it("uses stable RAG defaults for malformed values", () => {
    const rag = normalizeRAGConfig({
      enabled: true,
      topK: Number.NaN,
      chunkSize: "nope",
      namespace: "",
    });

    expect(rag.enabled).toBe(true);
    expect(rag.topK).toBe(10);
    expect(rag.chunkSize).toBe(512);
    expect(rag.documentParseProvider).toBe("mineru");
    expect(rag.namespace).toBeUndefined();
  });

  it("normalizes document parser provider and Mineru token", () => {
    const rag = normalizeRAGConfig({
      documentParseProvider: "llamaParse",
      mineruApiToken: " mineru-token ",
    });

    expect(rag.documentParseProvider).toBe("llamaParse");
    expect(rag.mineruApiToken).toBe("mineru-token");
  });
});
