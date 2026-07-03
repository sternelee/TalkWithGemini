import { describe, expect, it } from "vitest";
import {
  getSearchCompatibility,
  getSearchCompatibilityErrorMessage,
  getSearchProviderLabel,
} from "../lib/settings/searchRag";

describe("search compatibility", () => {
  it("allows Gemini native Google Search only for Gemini providers", () => {
    expect(
      getSearchCompatibility({
        searchProvider: "google",
        modelProviderType: "Gemini",
      }),
    ).toEqual({
      enabled: true,
      mode: "gemini-google",
      provider: "google",
    });

    const result = getSearchCompatibility({
      searchProvider: "google",
      modelProviderType: "OpenAI",
    });

    expect(result).toEqual({
      enabled: false,
      mode: "unavailable",
      provider: "google",
      reason: "google_requires_gemini",
    });
    expect(getSearchCompatibilityErrorMessage(result)).toContain("Gemini");
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
    });
  });

  it("allows Firecrawl search without an API key", () => {
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
    });
  });

  it("requires a base URL for SearXNG and exposes display labels", () => {
    expect(
      getSearchCompatibility({
        searchProvider: "searxng",
        searchConfig: { baseUrl: "" },
        modelProviderType: "Gemini",
      }),
    ).toMatchObject({
      enabled: false,
      reason: "missing_search_base_url",
    });

    expect(getSearchProviderLabel("searxng")).toBe("SearXNG");
  });
});
