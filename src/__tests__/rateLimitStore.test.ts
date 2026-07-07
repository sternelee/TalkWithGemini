import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearRateLimitStoreForTesting,
  incrementRateLimitBucket,
  setRateLimitStoreForTesting,
} from "../lib/security/rateLimitStore";

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({
  lookup: lookupMock,
}));

describe("rate limit store", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    lookupMock.mockReset();
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

  it("uses the safe outbound policy for hosted shared store requests", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("RATE_LIMIT_STORE", "upstash");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://127.0.0.1:8787");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "redis-secret");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json([{ result: 1 }, { result: 1_000 }]));

    await expect(
      incrementRateLimitBucket("hosted:key", 1_000, 1_000),
    ).rejects.toThrow(/Private network outbound requests are blocked/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
