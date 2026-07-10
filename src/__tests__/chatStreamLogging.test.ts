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

  it("converts current OpenAI Compatible image attachments before streaming", async () => {
    mocks.streamOpenAIChatCompletions.mockImplementation(async (request) => {
      request.onChunk({ type: "content", content: "ok" });
    });

    const { handleChatStream } = await import("../lib/api/chat-handler");
    const response = await handleChatStream({
      provider: {
        type: "OpenAI Compatible",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-secret",
      },
      modelName: "compat-vision",
      history: [],
      newMessage: "Describe this",
      attachments: [
        {
          id: "att_1",
          mimeType: "image/png",
          fileName: "image.png",
          data: "aW1hZ2U=",
        },
      ],
    });

    await response.text();

    const request = mocks.streamOpenAIChatCompletions.mock.calls[0]?.[0];
    expect(request.messages.at(-1)).toEqual({
      role: "user",
      content: [
        { type: "text", text: "Describe this" },
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,aW1hZ2U=" },
        },
      ],
    });
    expect(JSON.stringify(request.messages)).not.toContain('"mimeType"');
  });

  it("passes the request signal to provider streaming", async () => {
    const controller = new AbortController();
    mocks.streamOpenAIChatCompletions.mockResolvedValue(undefined);

    const { handleChatStream } = await import("../lib/api/chat-handler");
    const response = await handleChatStream({
      provider: {
        type: "OpenAI Compatible",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-secret",
      },
      modelName: "compat-model",
      history: [],
      newMessage: "Hello",
      signal: controller.signal,
    });

    await response.text();

    expect(mocks.streamOpenAIChatCompletions).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("closes an aborted provider stream without emitting error or done", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const controller = new AbortController();
    controller.abort();
    mocks.streamOpenAIChatCompletions.mockRejectedValue(
      new DOMException("Aborted", "AbortError"),
    );

    const { handleChatStream } = await import("../lib/api/chat-handler");
    const response = await handleChatStream({
      provider: {
        type: "OpenAI Compatible",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-secret",
      },
      modelName: "compat-model",
      history: [],
      newMessage: "Hello",
      signal: controller.signal,
    });

    await expect(response.text()).resolves.toBe("");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("passes AbortSignal to simple provider SDK requests", async () => {
    const controller = new AbortController();
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "ok" } }],
    });
    mocks.createOpenAIClient.mockReturnValue({
      chat: { completions: { create } },
    });

    const { handleSimpleGeneration } = await import("../lib/api/chat-handler");
    await handleSimpleGeneration(
      {
        type: "OpenAI Compatible",
        baseUrl: "https://api.example.com/v1",
        apiKey: "sk-secret",
      },
      "compat-model",
      "Hello",
      controller.signal,
    );

    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
