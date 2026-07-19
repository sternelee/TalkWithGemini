import { afterEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({
  lookup: lookupMock,
}));

describe("provider outbound policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    lookupMock.mockReset();
  });

  it("allows provider SDK base URLs that resolve to private addresses in hosted mode", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    const { ProviderFactory } = await import("../lib/providers/base");

    await expect(
      ProviderFactory.assertProviderOutboundAllowed({
        type: "OpenAI",
        baseUrl: "https://provider.example",
        apiKey: "key",
      }),
    ).resolves.toBeUndefined();
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
        type: "Google",
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

  it("allows OpenAI SDK redirects to local HTTP targets in hosted mode", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1:11434/v1/models" },
        }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { ProviderFactory } = await import("../lib/providers/base");
    const client = ProviderFactory.createOpenAIClient({
      type: "OpenAI Compatible",
      baseUrl: "https://proxy.example/v1",
      apiKey: "key",
    });

    await expect(
      (client as any).fetch("https://proxy.example/v1/models", {
        method: "GET",
      }),
    ).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("allows Google SDK redirects to local HTTP targets in hosted mode", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: "http://127.0.0.1:11434/v1/models" },
        }),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { ProviderFactory } = await import("../lib/providers/base");
    const client = ProviderFactory.createGoogleClient({
      type: "Google",
      baseUrl: "https://gemini-proxy.example",
      apiKey: "key",
    });

    await expect(
      (client as any).apiClient.apiCall(
        "https://gemini-proxy.example/v1beta/models",
        {
          method: "GET",
        },
      ),
    ).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps local OpenAI-compatible provider SDK calls available in local mode", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "local");
    const fetchMock = vi.fn(async () => {
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { ProviderFactory } = await import("../lib/providers/base");
    const client = ProviderFactory.createOpenAIClient({
      type: "OpenAI Compatible",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "ollama",
    });

    await expect(
      (client as any).fetch("http://localhost:11434/v1/models", {
        method: "GET",
      }),
    ).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalled();
  });
});
