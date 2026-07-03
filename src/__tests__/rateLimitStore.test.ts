import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearRateLimitStoreForTesting,
  incrementRateLimitBucket,
  setRateLimitStoreForTesting,
} from "../lib/security/rateLimitStore";

describe("rate limit store", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearRateLimitStoreForTesting();
  });

  it("keeps the memory fallback available in local mode", async () => {
    await expect(
      incrementRateLimitBucket("local:key", 1_000, 1_000),
    ).resolves.toMatchObject({
      count: 1,
      resetAt: 2_000,
    });
  });

  it("requires a shared rate limit store in hosted mode", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");

    await expect(
      incrementRateLimitBucket("hosted:key", 1_000, 1_000),
    ).rejects.toThrow(/RATE_LIMIT_STORE=upstash/i);
  });

  it("does not fall back to memory when the hosted rate limit store fails", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    setRateLimitStoreForTesting({
      increment: async () => {
        throw new Error("shared store unavailable");
      },
    });

    await expect(
      incrementRateLimitBucket("hosted:key", 1_000, 1_000),
    ).rejects.toThrow("shared store unavailable");
  });
});
