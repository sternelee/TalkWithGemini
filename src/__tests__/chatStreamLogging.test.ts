import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertProviderOutboundAllowed: vi.fn(),
  createOpenAIClient: vi.fn(),
  getEffectiveBaseUrl: vi.fn(),
  streamOpenAIChatCompletions: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("../lib/providers/base", () => ({
  ProviderFactory: {
    assertProviderOutboundAllowed: mocks.assertProviderOutboundAllowed,
    createOpenAIClient: mocks.createOpenAIClient,
    createGeminiClient: vi.fn(),
    getEffectiveBaseUrl: mocks.getEffectiveBaseUrl,
  },
}));

vi.mock("../lib/streaming/openai", () => ({
  streamOpenAIChatCompletions: mocks.streamOpenAIChatCompletions,
  streamOpenAIResponses: vi.fn(),
}));

vi.mock("../lib/streaming/gemini", () => ({
  streamGeminiResponse: vi.fn(),
}));

describe("chat stream logging", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    mocks.assertProviderOutboundAllowed.mockResolvedValue(undefined);
    mocks.createOpenAIClient.mockReturnValue({});
    mocks.getEffectiveBaseUrl.mockImplementation((baseUrl) => baseUrl);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    mocks.assertProviderOutboundAllowed.mockReset();
    mocks.createOpenAIClient.mockReset();
    mocks.getEffectiveBaseUrl.mockReset();
    mocks.streamOpenAIChatCompletions.mockReset();
  });

  it("logs redacted production details when chat streaming fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.streamOpenAIChatCompletions.mockRejectedValue(
      Object.assign(new Error("Provider rejected Bearer sk-secret"), {
        status: 400,
        code: "bad_request",
      }),
    );

    const { handleChatStream } = await import("../lib/api/chat-handler");
    const response = await handleChatStream({
      provider: {
        type: "OpenAI Compatible",
        baseUrl: "https://api.xiaomimimo.com/v1",
        apiKey: "sk-secret",
      },
      modelName: "mimo-v2.5-free",
      history: [],
      newMessage: "ping",
    });

    await expect(response.text()).resolves.toContain(
      "An internal error occurred",
    );

    const serializedLogs = JSON.stringify(consoleSpy.mock.calls);
    expect(serializedLogs).toContain("Chat stream error");
    expect(serializedLogs).toContain("OpenAI Compatible");
    expect(serializedLogs).toContain("mimo-v2.5-free");
    expect(serializedLogs).toContain("api.xiaomimimo.com");
    expect(serializedLogs).toContain("Bearer [redacted]");
    expect(serializedLogs).not.toContain("sk-secret");
    expect(mocks.createOpenAIClient).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "OpenAI Compatible",
        baseUrl: "https://api.xiaomimimo.com/v1",
      }),
    );
  });
});
