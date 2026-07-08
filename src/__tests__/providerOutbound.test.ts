import { afterEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({
  lookup: lookupMock,
}));

describe("provider outbound policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    lookupMock.mockReset();
  });

  it("blocks provider SDK base URLs that resolve to private addresses in hosted mode", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    const { ProviderFactory } = await import("../lib/providers/base");

    await expect(
      ProviderFactory.assertProviderOutboundAllowed({
        type: "OpenAI",
        baseUrl: "https://provider.example",
        apiKey: "key",
      }),
    ).rejects.toMatchObject({
      code: "HOSTED_PROXY_BLOCKED",
    });
  });

  it("allows custom public provider SDK base URLs in hosted mode", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    const { ProviderFactory } = await import("../lib/providers/base");

    expect(() =>
      ProviderFactory.createOpenAIClient({
        type: "OpenAI Compatible",
        baseUrl: "https://proxy.example/v1",
        apiKey: "key",
      }),
    ).not.toThrow();
    expect(() =>
      ProviderFactory.createGeminiClient({
        type: "Gemini",
        baseUrl: "https://gemini-proxy.example",
        apiKey: "key",
      }),
    ).not.toThrow();
  });

  it("keeps official provider base URLs available in hosted mode", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    const { ProviderFactory } = await import("../lib/providers/base");

    expect(() =>
      ProviderFactory.createOpenAIClient({
        type: "OpenAI",
        apiKey: "key",
      }),
    ).not.toThrow();
  });
});
