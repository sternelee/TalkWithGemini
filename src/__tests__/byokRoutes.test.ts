import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeFetchJson: vi.fn(),
  decryptSecretEnvelope: vi.fn(),
  decryptOptionalSecret: vi.fn(),
  resolveProviderRuntimeConfig: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/security/safeFetch", () => ({
  safeFetchJson: mocks.safeFetchJson,
}));

vi.mock("@/config/limits", async () => vi.importActual("../config/limits"));

vi.mock("@/lib/api/middleware", async () =>
  vi.importActual("../lib/api/middleware"),
);

vi.mock("@/lib/api/schemas", async () => vi.importActual("../lib/api/schemas"));

vi.mock("@/lib/api/uploads", async () => vi.importActual("../lib/api/uploads"));

vi.mock("@/lib/utils/safeServerLog", () => ({
  safeServerLogError: vi.fn(),
  safeServerLogWarn: vi.fn(),
}));

vi.mock("@/lib/providers/base", () => ({
  ProviderFactory: {
    createGeminiClient: vi.fn(),
    createOpenAIClient: vi.fn(),
  },
}));

vi.mock("@/lib/providers/models", async () =>
  vi.importActual("../lib/providers/models"),
);
vi.mock("@/lib/providers/providerTypes", async () =>
  vi.importActual("../lib/providers/providerTypes"),
);

vi.mock("@/lib/security/searchPolicy", async () =>
  vi.importActual("../lib/security/searchPolicy"),
);

vi.mock("@/lib/security/urlPolicy", async () =>
  vi.importActual("../lib/security/urlPolicy"),
);

vi.mock("@/lib/search/results", async () =>
  vi.importActual("../lib/search/results"),
);

vi.mock("@/lib/byok/shared", async () => vi.importActual("../lib/byok/shared"));

vi.mock("@/lib/defaultConfig/server", async () =>
  vi.importActual("../lib/defaultConfig/server"),
);

vi.mock("@/lib/defaultConfig/shared", async () =>
  vi.importActual("../lib/defaultConfig/shared"),
);

vi.mock("@/lib/byok/server", () => ({
  decryptSecretEnvelope: mocks.decryptSecretEnvelope,
  decryptOptionalSecret: mocks.decryptOptionalSecret,
  resolveProviderRuntimeConfig: mocks.resolveProviderRuntimeConfig,
}));

const apiKeySecret = {
  v: 1,
  kid: "test-key",
  alg: "RSA-OAEP-256+A256GCM",
  iv: "iv",
  wrappedKey: "wrapped",
  ciphertext: "ciphertext",
  context: "search:tavily",
} as const;

describe("BYOK route integration", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeFetchJson.mockReset();
    mocks.decryptSecretEnvelope.mockReset();
    mocks.decryptOptionalSecret.mockReset();
    mocks.resolveProviderRuntimeConfig.mockReset();
  });

  it("decrypts search credentials before calling the upstream API", async () => {
    mocks.decryptOptionalSecret.mockResolvedValue("tvly-secret");
    mocks.safeFetchJson.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      data: {
        results: [
          {
            title: "Result",
            url: "https://example.com/result",
            content: "Body",
          },
        ],
        images: [],
      },
    });

    const { POST } = await import("../app/api/search/route");
    const response = await POST(
      new Request("https://neo.test/api/search", {
        method: "POST",
        body: JSON.stringify({
          provider: "tavily",
          query: "neo",
          config: {
            apiKeySecret,
          },
        }),
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(mocks.decryptOptionalSecret).toHaveBeenCalledWith(
      apiKeySecret,
      "search:tavily",
    );
    expect(mocks.safeFetchJson).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer tvly-secret",
        }),
      }),
      expect.any(Object),
    );
    expect(JSON.stringify(await response.json())).not.toContain("tvly-secret");
  });

  it("rejects provider model requests that only have legacy environment keys", async () => {
    const originalGeminiKey = process.env.GEMINI_API_KEY;
    const originalApiKey = process.env.API_KEY;
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    process.env.GEMINI_API_KEY = "gemini-env-secret";
    process.env.API_KEY = "api-env-secret";
    process.env.OPENAI_API_KEY = "openai-env-secret";
    mocks.resolveProviderRuntimeConfig.mockResolvedValue({ type: "Gemini" });

    try {
      const { POST } = await import("../app/api/providers/models/route");
      const response = await POST(
        new Request("https://neo.test/api/providers/models", {
          method: "POST",
          body: JSON.stringify({
            provider: { type: "Gemini" },
          }),
        }) as any,
      );

      expect(response.status).toBe(401);
      expect(mocks.safeFetchJson).not.toHaveBeenCalled();
      const text = JSON.stringify(await response.json());
      expect(text).not.toContain("gemini-env-secret");
      expect(text).not.toContain("api-env-secret");
      expect(text).not.toContain("openai-env-secret");
    } finally {
      if (originalGeminiKey === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = originalGeminiKey;
      }
      if (originalApiKey === undefined) {
        delete process.env.API_KEY;
      } else {
        process.env.API_KEY = originalApiKey;
      }
      if (originalOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalOpenAiKey;
      }
    }
  });

  it("rejects plaintext document parse API keys in multipart requests", async () => {
    const { POST } = await import("../app/api/doc-parse/route");
    const formData = new FormData();
    formData.set(
      "file",
      new File(["hello"], "doc.txt", { type: "text/plain" }),
    );
    formData.set(
      "apiKeySecret",
      JSON.stringify({ ...apiKeySecret, context: "docs:llama-parse" }),
    );
    formData.set("apiKey", "llama-plaintext");

    const response = await POST(
      new Request("https://neo.test/api/doc-parse", {
        method: "POST",
        body: formData,
      }) as any,
    );

    expect(response.status).toBe(400);
    expect(mocks.decryptSecretEnvelope).not.toHaveBeenCalled();
    expect(mocks.safeFetchJson).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain(
      "llama-plaintext",
    );
  });

  it("rejects plaintext voice API keys in transcription multipart requests", async () => {
    const { POST } = await import("../app/api/voice/transcribe/route");
    const formData = new FormData();
    formData.set(
      "audio",
      new File(["audio"], "speech.webm", { type: "audio/webm" }),
    );
    formData.set("provider", "elevenlabs");
    formData.set(
      "apiKeySecret",
      JSON.stringify({ ...apiKeySecret, context: "voice:elevenlabs" }),
    );
    formData.set("apiKey", "voice-plaintext");

    const response = await POST(
      new Request("https://neo.test/api/voice/transcribe", {
        method: "POST",
        body: formData,
      }) as any,
    );

    expect(response.status).toBe(400);
    expect(mocks.decryptSecretEnvelope).not.toHaveBeenCalled();
    expect(mocks.safeFetchJson).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain(
      "voice-plaintext",
    );
  });
});
