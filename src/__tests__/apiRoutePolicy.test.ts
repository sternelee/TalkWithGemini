import { describe, expect, it } from "vitest";
import { getApiRateLimitPolicy } from "../lib/security/apiRoutePolicy";

describe("API route rate-limit policy", () => {
  it("returns a stable route family for dynamic agent paths", () => {
    const first = getApiRateLimitPolicy("/api/agents/a", "GET");
    const second = getApiRateLimitPolicy("/api/agents/b", "GET");

    expect(first?.routeFamily).toBe("/api/agents");
    expect(second?.routeFamily).toBe("/api/agents");
  });
});
