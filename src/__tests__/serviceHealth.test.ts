import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("service health status", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("publishes non-sensitive hosted health status", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("ACCESS_PASSWORD", "access-secret");
    vi.stubEnv("BYOK_PRIVATE_KEY_PEM", "private-key-secret");
    vi.stubEnv("RATE_LIMIT_STORE", "upstash");
    vi.stubEnv("DOCUMENT_PARSE_JOB_STORE", "upstash");
    vi.stubEnv("PLUGIN_REGISTRY_STORE", "upstash");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.internal");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "redis-secret");
    vi.stubEnv("DEFAULT_PROVIDER_API_KEY", "provider-secret");
    vi.stubEnv("DEFAULT_SEARCH_PROVIDER", "tavily");
    vi.stubEnv("DEFAULT_SEARCH_API_KEY", "search-secret");
    vi.stubEnv("DEFAULT_RAG_BASE_URL", "https://rag.internal");
    vi.stubEnv("DEFAULT_RAG_TOKEN", "rag-secret");
    vi.stubEnv("DEFAULT_LLAMA_PARSE_API_KEY", "llama-secret");
    vi.stubEnv("DEFAULT_VOICE_PROVIDER", "elevenlabs");
    vi.stubEnv("DEFAULT_ELEVENLABS_API_KEY", "voice-secret");

    const { getServiceHealthStatus } =
      await import("../lib/services/serviceHealth");
    const health = getServiceHealthStatus({ now: 1_700_000_000_000 });
    const serialized = JSON.stringify(health);

    expect(health.deploymentMode).toBe("hosted");
    expect(health.services.byok.status).toBe("available");
    expect(health.services.rateLimitStore.status).toBe("available");
    expect(health.services.pluginRegistry.status).toBe("available");
    expect(health.services.defaultModel.status).toBe("available");
    expect(health.services.search.status).toBe("available");
    expect(health.services.rag.status).toBe("available");
    expect(health.services.voice.status).toBe("available");
    for (const secret of [
      "access-secret",
      "private-key-secret",
      "redis-secret",
      "redis.internal",
      "provider-secret",
      "search-secret",
      "rag-secret",
      "llama-secret",
      "voice-secret",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("marks hosted missing shared stores as policy blocked", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("RATE_LIMIT_STORE", "memory");
    vi.stubEnv("DOCUMENT_PARSE_JOB_STORE", "memory");
    vi.stubEnv("PLUGIN_REGISTRY_STORE", "memory");

    const { getServiceHealthStatus } =
      await import("../lib/services/serviceHealth");
    const health = getServiceHealthStatus({ now: 1_700_000_000_000 });

    expect(health.services.rateLimitStore).toMatchObject({
      status: "policy_blocked",
      code: "SHARED_STORE_REQUIRED",
    });
    expect(health.services.pluginRegistry).toMatchObject({
      status: "policy_blocked",
      code: "SHARED_STORE_REQUIRED",
    });
  });
});
