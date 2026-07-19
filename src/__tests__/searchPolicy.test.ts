import { afterEach, describe, expect, it, vi } from "vitest";
import { getSearchProviderPolicy } from "../lib/security/searchPolicy";
import { validateOutboundUrl } from "../lib/security/urlPolicy";

describe("search provider URL policies", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows HTTP and private targets for every provider in hosted mode", () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");

    for (const provider of [
      "tavily",
      "firecrawl",
      "exa",
      "bocha",
      "searxng",
    ] as const) {
      const result = validateOutboundUrl(
        "http://127.0.0.1:8080/search",
        getSearchProviderPolicy(provider),
      );

      expect(result.hostname).toBe("127.0.0.1");
    }
  });
});
