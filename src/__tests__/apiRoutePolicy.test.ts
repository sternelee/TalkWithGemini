import { describe, expect, it } from "vitest";
import { getApiRateLimitPolicy } from "../lib/security/apiRoutePolicy";

describe("API route rate-limit policy", () => {
  it("keeps image proxy and proof-session bootstrapping on bounded quotas", () => {
    expect(getApiRateLimitPolicy("/api/media/image-proxy", "POST")).toEqual({
      routeFamily: "/api/media/image-proxy",
      windowMs: 60_000,
      maxRequests: 30,
    });
    expect(getApiRateLimitPolicy("/api/request-proof/session", "GET")).toEqual({
      routeFamily: "/api/request-proof/session",
      windowMs: 60_000,
      maxRequests: 30,
    });
  });

  it("returns a stable route family for dynamic agent paths", () => {
    const first = getApiRateLimitPolicy("/api/agents/a", "GET");
    const second = getApiRateLimitPolicy("/api/agents/b", "GET");

    expect(first?.routeFamily).toBe("/api/agents");
    expect(second?.routeFamily).toBe("/api/agents");
  });
});
