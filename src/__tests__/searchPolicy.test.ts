import { describe, expect, it } from "vitest";
import { getSearchProviderPolicy } from "../lib/security/searchPolicy";
import { validateOutboundUrl } from "../lib/security/urlPolicy";

describe("search provider URL policies", () => {
  it("blocks local and plain HTTP URLs for hosted search providers", () => {
    expect(() =>
      validateOutboundUrl(
        "https://127.0.0.1/search",
        getSearchProviderPolicy("tavily"),
      ),
    ).toThrow(/Private network|Localhost/i);

    expect(() =>
      validateOutboundUrl(
        "http://api.tavily.com/search",
        getSearchProviderPolicy("tavily"),
      ),
    ).toThrow(/Protocol|HTTP/i);
  });

  it("allows local HTTP URLs for self-hosted SearXNG", () => {
    const result = validateOutboundUrl(
      "http://localhost:8080/search",
      getSearchProviderPolicy("searxng"),
    );

    expect(result.hostname).toBe("localhost");
  });
});
