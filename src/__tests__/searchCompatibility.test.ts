import { describe, expect, it } from "vitest";
import {
  getSearchCompatibility,
  getSearchCompatibilityErrorMessage,
  getSearchProviderLabel,
  resolveEffectiveSearchCapability,
} from "../lib/settings/searchRag";

describe("search compatibility", () => {
  it("routes model built-in search by provider capability", () => {
    expect(
      getSearchCompatibility({
        searchProvider: "google",
        modelProviderType: "Google",
      }),
    ).toEqual({
      enabled: true,
      mode: "gemini-google",
      provider: "google",
      source: "model_builtin",
    });

    expect(
      getSearchCompatibility({
        searchProvider: "google",
        modelProviderType: "OpenAI",
      }),
    ).toEqual({
      enabled: true,
      mode: "openai-web",
      provider: "google",
      source: "model_builtin",
    });

    const result = getSearchCompatibility({
      searchProvider: "google",
      modelProviderType: "OpenAI Compatible",
    });

    expect(result).toEqual({
      enabled: false,
      mode: "unavailable",
      provider: "google",
      reason: "model_builtin_search_unsupported",
    });
    expect(getSearchCompatibilityErrorMessage(result)).toContain("external");
  });

  it("requires API keys for external hosted search providers", () => {
    expect(
      getSearchCompatibility({
        searchProvider: "tavily",
        searchConfig: { apiKey: "" },
        modelProviderType: "OpenAI",
      }),
    ).toMatchObject({
      enabled: false,
      reason: "missing_search_api_key",
    });

    expect(
      getSearchCompatibility({
        searchProvider: "tavily",
        searchConfig: { apiKey: "tvly-key" },
        modelProviderType: "OpenAI",
      }),
    ).toEqual({
      enabled: true,
      mode: "external",
      provider: "tavily",
      source: "client_api_key",
    });
  });

  it("allows keyless Firecrawl and identifies optional authentication", () => {
    expect(
      getSearchCompatibility({
        searchProvider: "firecrawl",
        searchConfig: { apiKey: "" },
        modelProviderType: "OpenAI",
      }),
    ).toEqual({
      enabled: true,
      mode: "external",
      provider: "firecrawl",
      source: "public_service",
    });

    expect(
      getSearchCompatibility({
        searchProvider: "firecrawl",
        searchConfig: { baseUrl: "not-a-url" },
        modelProviderType: "OpenAI",
      }),
    ).toMatchObject({
      enabled: false,
      reason: "missing_search_base_url",
    });

    expect(
      getSearchCompatibility({
        searchProvider: "firecrawl",
        searchConfig: { apiKey: "firecrawl-key" },
        modelProviderType: "OpenAI",
      }),
    ).toEqual({
      enabled: true,
      mode: "external",
      provider: "firecrawl",
      source: "client_api_key",
    });

    expect(
      getSearchCompatibility({
        searchProvider: "firecrawl",
        searchConfig: { baseUrl: "https://firecrawl.internal" },
        modelProviderType: "OpenAI",
      }),
    ).toEqual({
      enabled: true,
      mode: "external",
      provider: "firecrawl",
      source: "self_hosted",
    });

    expect(
      getSearchCompatibility({
        searchProvider: "firecrawl",
        searchConfig: {
          apiKey: "firecrawl-key",
          baseUrl: "https://firecrawl.internal",
        },
        modelProviderType: "OpenAI",
      }),
    ).toEqual({
      enabled: true,
      mode: "external",
      provider: "firecrawl",
      source: "self_hosted",
    });

    expect(
      getSearchCompatibility({
        searchProvider: "firecrawl",
        searchConfig: { baseUrl: "https://api.firecrawl.dev/" },
        modelProviderType: "OpenAI",
      }),
    ).toEqual({
      enabled: true,
      mode: "external",
      provider: "firecrawl",
      source: "public_service",
    });
  });

  it("requires a base URL for SearXNG and exposes display labels", () => {
    expect(
      getSearchCompatibility({
        searchProvider: "searxng",
        searchConfig: { baseUrl: "" },
        modelProviderType: "Google",
      }),
    ).toMatchObject({
      enabled: false,
      reason: "missing_search_base_url",
    });

    expect(getSearchProviderLabel("searxng")).toBe("SearXNG");

    expect(
      getSearchCompatibility({
        searchProvider: "searxng",
        searchConfig: { baseUrl: "localhost:8080" },
        modelProviderType: "Google",
      }),
    ).toMatchObject({
      enabled: false,
      reason: "missing_search_base_url",
    });

    expect(
      getSearchCompatibility({
        searchProvider: "searxng",
        searchConfig: { baseUrl: "http://localhost:8080" },
        modelProviderType: "Google",
      }),
    ).toMatchObject({ enabled: true, source: "self_hosted" });
  });

  it("discloses server-default capability without exposing configuration", () => {
    expect(
      getSearchCompatibility({
        searchProvider: "default",
        searchConfig: { serverAvailable: true },
        modelProviderType: "Anthropic",
      }),
    ).toEqual({
      enabled: true,
      mode: "external",
      provider: "default",
      source: "server_default",
    });

    expect(
      getSearchCompatibility({
        searchProvider: "default",
        searchConfig: { serverAvailable: false },
        modelProviderType: "Anthropic",
      }),
    ).toMatchObject({
      enabled: false,
      reason: "missing_server_default",
    });
  });

  it("requires the complete selected model at capability boundaries", () => {
    expect(
      resolveEffectiveSearchCapability({
        searchProvider: "tavily",
        searchConfig: { apiKey: "tvly-key" },
        modelProviderType: "OpenAI",
        selectedModel: "",
      }),
    ).toMatchObject({
      enabled: false,
      reason: "missing_model_provider",
    });

    expect(
      resolveEffectiveSearchCapability({
        searchProvider: "tavily",
        searchConfig: { apiKey: "tvly-key" },
        modelProviderType: "OpenAI",
        selectedModel: "provider-id:gpt-5",
      }),
    ).toMatchObject({ enabled: true, source: "client_api_key" });
  });
});
