import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  safeFetchJson: vi.fn(),
  safeFetchArrayBuffer: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/config/limits", async () => vi.importActual("../config/limits"));
vi.mock("@/config/defaults", async () => vi.importActual("../config/defaults"));
vi.mock("@/lib/api/middleware", async () =>
  vi.importActual("../lib/api/middleware"),
);
vi.mock("@/lib/api/schemas", async () => vi.importActual("../lib/api/schemas"));
vi.mock("@/lib/api/uploads", async () => vi.importActual("../lib/api/uploads"));
vi.mock("@/lib/byok/shared", async () => vi.importActual("../lib/byok/shared"));
vi.mock("@/lib/byok/server", async () => vi.importActual("../lib/byok/server"));
vi.mock("@/lib/defaultConfig/server", async () =>
  vi.importActual("../lib/defaultConfig/server"),
);
vi.mock("@/lib/defaultConfig/shared", async () =>
  vi.importActual("../lib/defaultConfig/shared"),
);
vi.mock("@/lib/providers/models", async () =>
  vi.importActual("../lib/providers/models"),
);
vi.mock("@/lib/providers/providerTypes", async () =>
  vi.importActual("../lib/providers/providerTypes"),
);
vi.mock("@/lib/search/results", async () =>
  vi.importActual("../lib/search/results"),
);
vi.mock("@/lib/security/searchPolicy", async () =>
  vi.importActual("../lib/security/searchPolicy"),
);
vi.mock("@/lib/security/urlPolicy", async () =>
  vi.importActual("../lib/security/urlPolicy"),
);
vi.mock("@/lib/settings/appConfig", async () =>
  vi.importActual("../lib/settings/appConfig"),
);

vi.mock("@/lib/security/safeFetch", async () => {
  const actual = await vi.importActual<any>("../lib/security/safeFetch");
  return {
    ...actual,
    safeFetchJson: mocks.safeFetchJson,
    safeFetchArrayBuffer: mocks.safeFetchArrayBuffer,
  };
});

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

const ENV_KEYS = [
  "ACCESS_PASSWORD",
  "BYOK_PRIVATE_KEY_PEM",
  "BYOK_ALLOW_EPHEMERAL_KEY",
  "DEPLOYMENT_MODE",
  "TRUST_PROXY_HEADERS",
  "RATE_LIMIT_STORE",
  "DOCUMENT_PARSE_JOB_STORE",
  "PLUGIN_REGISTRY_STORE",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "DEFAULT_PROVIDER_TYPE",
  "DEFAULT_PROVIDER_NAME",
  "DEFAULT_PROVIDER_BASE_URL",
  "DEFAULT_PROVIDER_API_KEY",
  "DEFAULT_PROVIDER_MODELS",
  "DEFAULT_MODEL_TITLE_GENERATION",
  "DEFAULT_MODEL_RELATED_QUESTIONS",
  "DEFAULT_MODEL_CONTEXT_COMPRESSION",
  "DEFAULT_MODEL_PROMPT_OPTIMIZATION",
  "DEFAULT_MODEL_RAG_QUERY",
  "DEFAULT_SEARCH_PROVIDER",
  "DEFAULT_SEARCH_API_KEY",
  "DEFAULT_SEARCH_BASE_URL",
  "DEFAULT_RAG_BASE_URL",
  "DEFAULT_RAG_TOKEN",
  "DEFAULT_RAG_TOP_K",
  "DEFAULT_RAG_CHUNK_SIZE",
  "DEFAULT_RAG_NAMESPACE",
  "DEFAULT_LLAMA_PARSE_API_KEY",
  "DEFAULT_ELEVENLABS_API_KEY",
  "DEFAULT_ELEVENLABS_STT_MODEL",
  "DEFAULT_ELEVENLABS_TTS_MODEL",
  "DEFAULT_ELEVENLABS_TTS_VOICE_ID",
  "DEFAULT_VOICE_PROVIDER",
  "DEFAULT_MIMO_API_KEY",
  "DEFAULT_MIMO_STT_MODEL",
  "DEFAULT_MIMO_TTS_MODEL",
  "DEFAULT_MIMO_TTS_VOICE_ID",
  "DEFAULT_SYSTEM_PROMPT",
  "DEFAULT_ENABLE_AUTO_TITLE",
  "DEFAULT_ENABLE_RELATED_QUESTIONS",
  "DEFAULT_ENABLE_AUTO_COMPRESSION",
  "DEFAULT_COMPRESSION_THRESHOLD",
  "DEFAULT_HISTORY_KEEP_COUNT",
  "DEFAULT_ENABLE_CODE_COLLAPSE",
] as const;

const LEGACY_PROVIDER_ENV_KEYS = [
  "GEMINI_API_KEY",
  "API_KEY",
  "OPENAI_API_KEY",
] as const;

const originalEnv = new Map<string, string | undefined>();

function clearDefaultEnv() {
  for (const key of [...ENV_KEYS, ...LEGACY_PROVIDER_ENV_KEYS]) {
    delete process.env[key];
  }
}

function setEnv(values: Record<string, string>) {
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
}

describe("server default configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.safeFetchJson.mockReset();
    mocks.safeFetchArrayBuffer.mockReset();

    originalEnv.clear();
    for (const key of [...ENV_KEYS, ...LEGACY_PROVIDER_ENV_KEYS]) {
      originalEnv.set(key, process.env[key]);
    }
    clearDefaultEnv();
  });

  afterEach(() => {
    clearDefaultEnv();
    for (const [key, value] of originalEnv.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("returns public defaults without API keys, tokens, or server base URLs", async () => {
    setEnv({
      DEFAULT_PROVIDER_TYPE: "OpenAI",
      DEFAULT_PROVIDER_NAME: "Hosted Default",
      DEFAULT_PROVIDER_BASE_URL: "https://llm.internal/v1",
      DEFAULT_PROVIDER_API_KEY: "provider-secret",
      DEFAULT_PROVIDER_MODELS: "gpt-4o, gpt-4o-mini, gpt-4o",
      DEFAULT_MODEL_TITLE_GENERATION: "gpt-4o-mini",
      DEFAULT_SEARCH_PROVIDER: "tavily",
      DEFAULT_SEARCH_API_KEY: "search-secret",
      DEFAULT_SEARCH_BASE_URL: "https://search.internal",
      DEFAULT_RAG_BASE_URL: "https://rag.internal",
      DEFAULT_RAG_TOKEN: "rag-secret",
      DEFAULT_RAG_TOP_K: "7",
      DEFAULT_RAG_CHUNK_SIZE: "768",
      DEFAULT_RAG_NAMESPACE: "tenant-a",
      DEFAULT_LLAMA_PARSE_API_KEY: "llama-secret",
      DEFAULT_ELEVENLABS_API_KEY: "eleven-secret",
      DEFAULT_ELEVENLABS_STT_MODEL: "scribe_v1",
      DEFAULT_ELEVENLABS_TTS_VOICE_ID: "SAz9YHcvj6GT2YYXdXww",
      DEFAULT_SYSTEM_PROMPT: "Use the hosted defaults.",
      DEFAULT_ENABLE_AUTO_TITLE: "false",
      DEFAULT_COMPRESSION_THRESHOLD: "12",
    });

    const { getPublicServerConfig } =
      await import("../lib/defaultConfig/server");
    const config = getPublicServerConfig();
    const serialized = JSON.stringify(config);

    expect(config.modelProvider).toMatchObject({
      available: true,
      id: "SERVER_DEFAULT",
      name: "Hosted Default",
      type: "OpenAI",
      models: ["gpt-4o", "gpt-4o-mini"],
      defaultModels: { titleGeneration: "gpt-4o-mini" },
    });
    expect(config.search.available).toBe(true);
    expect(config.rag).toMatchObject({
      vectorStoreAvailable: true,
      documentProcessingAvailable: true,
      topK: 7,
      chunkSize: 768,
      namespace: "tenant-a",
    });
    expect(config.voice).toMatchObject({
      elevenLabsAvailable: true,
      mimoAvailable: false,
      defaultSttAvailable: false,
      defaultTtsAvailable: false,
    });
    expect(config.voice.defaultProvider).toBeUndefined();
    expect(config.voice.sttModel).toBeUndefined();
    expect(config.voice.ttsModel).toBeUndefined();
    expect(config.voice.ttsVoiceId).toBeUndefined();
    expect(config.system).toMatchObject({
      systemPrompt: "Use the hosted defaults.",
      enableAutoTitle: false,
      compressionThreshold: 12,
    });

    for (const secret of [
      "provider-secret",
      "search-secret",
      "rag-secret",
      "llama-secret",
      "eleven-secret",
      "llm.internal",
      "search.internal",
      "rag.internal",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("does not publish a default voice provider unless it is explicitly configured", async () => {
    setEnv({
      DEFAULT_ELEVENLABS_API_KEY: "eleven-secret",
      DEFAULT_ELEVENLABS_STT_MODEL: "scribe_v2",
      DEFAULT_ELEVENLABS_TTS_MODEL: "eleven_flash_v2_5",
      DEFAULT_ELEVENLABS_TTS_VOICE_ID: "SAz9YHcvj6GT2YYXdXww",
      DEFAULT_MIMO_API_KEY: "mimo-secret",
      DEFAULT_MIMO_STT_MODEL: "mimo-v2.5-asr",
      DEFAULT_MIMO_TTS_MODEL: "mimo-v2.5-tts",
    });

    const { getPublicServerConfig } =
      await import("../lib/defaultConfig/server");
    const config = getPublicServerConfig();

    expect(config.voice).toMatchObject({
      elevenLabsAvailable: true,
      mimoAvailable: true,
      defaultSttAvailable: false,
      defaultTtsAvailable: false,
    });
    expect(config.voice.defaultProvider).toBeUndefined();
    expect(config.voice.sttModel).toBeUndefined();
    expect(config.voice.ttsModel).toBeUndefined();
  });

  it("publishes deployment health without exposing deployment secrets", async () => {
    setEnv({
      ACCESS_PASSWORD: "super-secret-password",
      BYOK_PRIVATE_KEY_PEM: "private-key-secret",
      BYOK_ALLOW_EPHEMERAL_KEY: "false",
      DEPLOYMENT_MODE: "hosted",
      TRUST_PROXY_HEADERS: "true",
      RATE_LIMIT_STORE: "upstash",
      DOCUMENT_PARSE_JOB_STORE: "upstash",
      PLUGIN_REGISTRY_STORE: "upstash",
      UPSTASH_REDIS_REST_URL: "https://redis.internal",
      UPSTASH_REDIS_REST_TOKEN: "redis-secret",
    });

    const { getPublicServerConfig } =
      await import("../lib/defaultConfig/server");
    const config = getPublicServerConfig();
    const serialized = JSON.stringify(config);

    expect(config.deployment).toEqual({
      mode: "hosted",
      accessPasswordEnabled: true,
      trustedProxyHeaders: true,
      byokStableKeyConfigured: true,
      byokEphemeralAllowed: false,
      rateLimitStore: "shared",
      documentParseJobStore: "shared",
      pluginRegistryStore: "shared",
    });
    for (const secret of [
      "super-secret-password",
      "private-key-secret",
      "redis-secret",
      "redis.internal",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("accepts JSON provider model arrays and publishes sanitized model metadata", async () => {
    setEnv({
      DEFAULT_PROVIDER_TYPE: "OpenAI",
      DEFAULT_PROVIDER_NAME: "Hosted Default",
      DEFAULT_PROVIDER_API_KEY: "provider-secret",
      DEFAULT_PROVIDER_MODELS: JSON.stringify([
        "gpt-4o-mini",
        {
          id: "gpt-4o",
          name: "GPT-4o Hosted",
          capabilities: {
            attachment: true,
            vision: true,
            audio: true,
            reasoning: false,
            tool_call: true,
          },
        },
        { id: "gpt-4o", name: "Duplicate" },
      ]),
    });

    const { getPublicServerConfig } =
      await import("../lib/defaultConfig/server");
    const config = getPublicServerConfig();
    const serialized = JSON.stringify(config);

    expect(config.modelProvider.models).toEqual(["gpt-4o-mini", "gpt-4o"]);
    expect(config.modelProvider.modelMetadata).toEqual({
      "gpt-4o": {
        id: "gpt-4o",
        name: "GPT-4o Hosted",
        attachment: true,
        reasoning: false,
        tool_call: true,
        modalities: { input: ["image", "audio", "text"] },
      },
    });
    expect(serialized).not.toContain("provider-secret");
  });

  it("falls back to comma-separated models when provider model JSON is invalid", async () => {
    setEnv({
      DEFAULT_PROVIDER_TYPE: "OpenAI",
      DEFAULT_PROVIDER_API_KEY: "provider-secret",
      DEFAULT_PROVIDER_MODELS: 'model-a, {"id": "not-json"',
    });

    const { getPublicServerConfig } =
      await import("../lib/defaultConfig/server");

    expect(getPublicServerConfig().modelProvider.models).toEqual([
      "model-a",
      '{"id": "not-json"',
    ]);
  });

  it("ignores legacy provider key fallbacks for server defaults", async () => {
    setEnv({
      DEFAULT_PROVIDER_TYPE: "Gemini",
      GEMINI_API_KEY: "gemini-fallback-secret",
      API_KEY: "api-fallback-secret",
      OPENAI_API_KEY: "openai-fallback-secret",
    });

    const { getDefaultProviderRuntimeConfig, getPublicServerConfig } =
      await import("../lib/defaultConfig/server");
    const runtimeConfig = getDefaultProviderRuntimeConfig();

    expect(runtimeConfig).toBeNull();

    const { GET } = await import("../app/api/config/route");
    const response = await GET();
    const publicConfig = getPublicServerConfig();
    const body = await response.json();
    const text = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(publicConfig.modelProvider.available).toBe(false);
    expect(body.modelProvider.available).toBe(false);
    expect(text).not.toContain("gemini-fallback-secret");
    expect(text).not.toContain("api-fallback-secret");
    expect(text).not.toContain("openai-fallback-secret");
  });

  it("uses server default provider credentials when fetching model lists", async () => {
    setEnv({
      DEFAULT_PROVIDER_TYPE: "OpenAI",
      DEFAULT_PROVIDER_API_KEY: "provider-secret",
      DEFAULT_PROVIDER_BASE_URL: "https://llm.internal/custom",
    });
    mocks.safeFetchJson.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      data: {
        data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }],
      },
    });

    const { POST } = await import("../app/api/providers/models/route");
    const response = await POST(
      new Request("https://neo.test/api/providers/models", {
        method: "POST",
        body: JSON.stringify({
          provider: { type: "OpenAI", source: "server-default" },
        }),
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(mocks.safeFetchJson).toHaveBeenCalledWith(
      "https://llm.internal/custom/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer provider-secret",
        }),
      }),
      expect.any(Object),
    );
    expect(JSON.stringify(await response.json())).not.toContain(
      "provider-secret",
    );
  });

  it("uses server default search credentials for provider default requests", async () => {
    setEnv({
      DEFAULT_SEARCH_PROVIDER: "tavily",
      DEFAULT_SEARCH_API_KEY: "search-secret",
      DEFAULT_SEARCH_BASE_URL: "https://search.internal",
    });
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
          provider: "default",
          query: "neo",
        }),
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(mocks.safeFetchJson).toHaveBeenCalledWith(
      "https://search.internal/search",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer search-secret",
        }),
      }),
      expect.any(Object),
    );
    expect(JSON.stringify(await response.json())).not.toContain(
      "search-secret",
    );
  });

  it("uses server default RAG credentials and namespace for default queries", async () => {
    setEnv({
      DEFAULT_RAG_BASE_URL: "https://rag.internal/api",
      DEFAULT_RAG_TOKEN: "rag-secret",
      DEFAULT_RAG_TOP_K: "3",
      DEFAULT_RAG_NAMESPACE: "hosted",
    });
    mocks.safeFetchJson.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      data: {
        result: [
          {
            score: 0.9,
            data: "Knowledge",
            metadata: { fileName: "doc.md" },
          },
        ],
      },
    });

    const { POST } = await import("../app/api/rag/query/route");
    const response = await POST(
      new Request("https://neo.test/api/rag/query", {
        method: "POST",
        body: JSON.stringify({
          text: "What is Neo?",
          useDefault: true,
        }),
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(mocks.safeFetchJson).toHaveBeenCalledWith(
      "https://rag.internal/api/query-data/hosted",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer rag-secret",
        }),
        body: expect.stringContaining('"topK":3'),
      }),
      expect.any(Object),
    );
    expect(JSON.stringify(await response.json())).not.toContain("rag-secret");
  });

  it("uses the server LlamaParse key when document parsing requests opt into defaults", async () => {
    setEnv({
      DEFAULT_LLAMA_PARSE_API_KEY: "llama-secret",
    });
    mocks.safeFetchJson.mockResolvedValue({
      response: new Response(null, { status: 418 }),
      data: {},
    });

    const formData = new FormData();
    formData.set(
      "file",
      new File(["hello"], "doc.txt", { type: "text/plain" }),
    );
    formData.set("useDefault", "true");

    const { POST } = await import("../app/api/doc-parse/route");
    const response = await POST(
      new Request("https://neo.test/api/doc-parse", {
        method: "POST",
        body: formData,
      }) as any,
    );

    expect(response.status).toBe(418);
    expect(mocks.safeFetchJson).toHaveBeenCalledWith(
      "https://api.cloud.llamaindex.ai/api/v2/parse/upload",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer llama-secret",
        }),
      }),
      expect.any(Object),
    );
    expect(JSON.stringify(await response.json())).not.toContain("llama-secret");
  });

  it("uses the server ElevenLabs key for default speech transcription", async () => {
    setEnv({
      DEFAULT_VOICE_PROVIDER: "elevenlabs",
      DEFAULT_ELEVENLABS_API_KEY: "eleven-secret",
      DEFAULT_ELEVENLABS_STT_MODEL: "scribe_v2",
    });
    mocks.safeFetchJson.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      data: { text: "hello" },
    });

    const formData = new FormData();
    formData.set(
      "audio",
      new File(["audio"], "speech.webm", { type: "audio/webm" }),
    );
    formData.set("provider", "default");

    const { POST } = await import("../app/api/voice/transcribe/route");
    const response = await POST(
      new Request("https://neo.test/api/voice/transcribe", {
        method: "POST",
        body: formData,
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(mocks.safeFetchJson).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/speech-to-text",
      expect.objectContaining({
        headers: expect.objectContaining({
          "xi-api-key": "eleven-secret",
        }),
      }),
      expect.any(Object),
    );
    expect(JSON.stringify(await response.json())).not.toContain(
      "eleven-secret",
    );
  });

  it("uses the server ElevenLabs key and default voice for speech synthesis", async () => {
    setEnv({
      DEFAULT_VOICE_PROVIDER: "elevenlabs",
      DEFAULT_ELEVENLABS_API_KEY: "eleven-secret",
      DEFAULT_ELEVENLABS_TTS_VOICE_ID: "SAz9YHcvj6GT2YYXdXww",
    });
    mocks.safeFetchArrayBuffer.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      arrayBuffer: new Uint8Array([1, 2, 3]),
    });

    const { POST } = await import("../app/api/voice/synthesize/route");
    const response = await POST(
      new Request("https://neo.test/api/voice/synthesize", {
        method: "POST",
        body: JSON.stringify({
          provider: "default",
          text: "hello",
        }),
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(mocks.safeFetchArrayBuffer).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/text-to-speech/SAz9YHcvj6GT2YYXdXww?output_format=mp3_44100_128",
      expect.objectContaining({
        headers: expect.objectContaining({
          "xi-api-key": "eleven-secret",
        }),
      }),
      expect.any(Object),
    );
    const requestInit = mocks.safeFetchArrayBuffer.mock.calls[0][1];
    expect(JSON.parse(requestInit.body)).toMatchObject({
      model_id: "eleven_flash_v2_5",
    });
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("disables default ElevenLabs TTS when its default model is empty", async () => {
    setEnv({
      DEFAULT_VOICE_PROVIDER: "elevenlabs",
      DEFAULT_ELEVENLABS_API_KEY: "eleven-secret",
      DEFAULT_ELEVENLABS_STT_MODEL: "scribe_v2",
      DEFAULT_ELEVENLABS_TTS_MODEL: "",
      DEFAULT_ELEVENLABS_TTS_VOICE_ID: "SAz9YHcvj6GT2YYXdXww",
    });

    const { getPublicServerConfig } =
      await import("../lib/defaultConfig/server");
    const config = getPublicServerConfig();

    expect(config.voice).toMatchObject({
      defaultProvider: "elevenlabs",
      elevenLabsAvailable: true,
      defaultSttAvailable: true,
      defaultTtsAvailable: false,
      sttModel: "scribe_v2",
    });
    expect(config.voice.ttsModel).toBeUndefined();
    expect(config.voice.ttsVoiceId).toBeUndefined();
  });

  it("rejects default ElevenLabs synthesis when its default model is empty", async () => {
    setEnv({
      DEFAULT_VOICE_PROVIDER: "elevenlabs",
      DEFAULT_ELEVENLABS_API_KEY: "eleven-secret",
      DEFAULT_ELEVENLABS_TTS_MODEL: "",
      DEFAULT_ELEVENLABS_TTS_VOICE_ID: "SAz9YHcvj6GT2YYXdXww",
    });
    mocks.safeFetchArrayBuffer.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      arrayBuffer: new Uint8Array([1, 2, 3]),
    });

    const { POST } = await import("../app/api/voice/synthesize/route");
    const response = await POST(
      new Request("https://neo.test/api/voice/synthesize", {
        method: "POST",
        body: JSON.stringify({
          provider: "default",
          text: "hello",
        }),
      }) as any,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Default speech synthesis is not configured",
    });
    expect(mocks.safeFetchArrayBuffer).not.toHaveBeenCalled();
  });

  it("publishes Mimo as the server default voice provider", async () => {
    setEnv({
      DEFAULT_VOICE_PROVIDER: "mimo",
      DEFAULT_MIMO_API_KEY: "mimo-secret",
      DEFAULT_MIMO_STT_MODEL: "mimo-v2.5-asr",
      DEFAULT_MIMO_TTS_MODEL: "mimo-v2.5-tts",
      DEFAULT_MIMO_TTS_VOICE_ID: "Chloe",
    });

    const { getPublicServerConfig } =
      await import("../lib/defaultConfig/server");
    const config = getPublicServerConfig();
    const serialized = JSON.stringify(config);

    expect(config.voice).toMatchObject({
      defaultProvider: "mimo",
      mimoAvailable: true,
      defaultSttAvailable: true,
      defaultTtsAvailable: true,
      mimoSttModel: "mimo-v2.5-asr",
      mimoTtsModel: "mimo-v2.5-tts",
      mimoTtsVoiceId: "Chloe",
    });
    expect(serialized).not.toContain("mimo-secret");
  });

  it("publishes Mimo default TTS without STT when the Mimo STT model is empty", async () => {
    setEnv({
      DEFAULT_VOICE_PROVIDER: "mimo",
      DEFAULT_MIMO_API_KEY: "mimo-secret",
      DEFAULT_MIMO_STT_MODEL: "",
      DEFAULT_MIMO_TTS_MODEL: "mimo-v2.5-tts",
      DEFAULT_MIMO_TTS_VOICE_ID: "Chloe",
    });

    const { getPublicServerConfig } =
      await import("../lib/defaultConfig/server");
    const config = getPublicServerConfig();

    expect(config.voice).toMatchObject({
      defaultProvider: "mimo",
      mimoAvailable: true,
      defaultSttAvailable: false,
      defaultTtsAvailable: true,
      mimoTtsModel: "mimo-v2.5-tts",
      mimoTtsVoiceId: "Chloe",
    });
    expect(config.voice.sttModel).toBeUndefined();
    expect(config.voice.mimoSttModel).toBeUndefined();
  });

  it("uses the server Mimo key for default speech transcription", async () => {
    setEnv({
      DEFAULT_VOICE_PROVIDER: "mimo",
      DEFAULT_MIMO_API_KEY: "mimo-secret",
      DEFAULT_MIMO_STT_MODEL: "mimo-v2.5-asr",
    });
    mocks.safeFetchJson.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      data: {
        choices: [{ message: { content: "hello from mimo" } }],
      },
    });

    const formData = new FormData();
    formData.set(
      "audio",
      new File(["audio"], "speech.wav", { type: "audio/wav" }),
    );
    formData.set("provider", "default");
    formData.set("language", "en");

    const { POST } = await import("../app/api/voice/transcribe/route");
    const response = await POST(
      new Request("https://neo.test/api/voice/transcribe", {
        method: "POST",
        body: formData,
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(mocks.safeFetchJson).toHaveBeenCalledWith(
      "https://api.xiaomimimo.com/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          "api-key": "mimo-secret",
        }),
      }),
      expect.any(Object),
    );

    const requestInit = mocks.safeFetchJson.mock.calls[0][1];
    const payload = JSON.parse(requestInit.body);
    expect(payload).toMatchObject({
      model: "mimo-v2.5-asr",
      asr_options: { language: "en" },
    });
    expect(payload.messages[0].content[0].input_audio.data).toContain(
      "data:audio/wav;base64,",
    );
    expect(await response.json()).toEqual({ text: "hello from mimo" });
  });

  it("uses the server Mimo key and default voice for speech synthesis", async () => {
    setEnv({
      DEFAULT_VOICE_PROVIDER: "mimo",
      DEFAULT_MIMO_API_KEY: "mimo-secret",
      DEFAULT_MIMO_TTS_MODEL: "mimo-v2.5-tts",
      DEFAULT_MIMO_TTS_VOICE_ID: "Chloe",
    });
    mocks.safeFetchJson.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      data: {
        choices: [{ message: { audio: { data: "AQID" } } }],
      },
    });

    const { POST } = await import("../app/api/voice/synthesize/route");
    const response = await POST(
      new Request("https://neo.test/api/voice/synthesize", {
        method: "POST",
        body: JSON.stringify({
          provider: "default",
          text: "hello",
        }),
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(mocks.safeFetchJson).toHaveBeenCalledWith(
      "https://api.xiaomimimo.com/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          "api-key": "mimo-secret",
        }),
      }),
      expect.any(Object),
    );

    const requestInit = mocks.safeFetchJson.mock.calls[0][1];
    const payload = JSON.parse(requestInit.body);
    expect(payload).toMatchObject({
      model: "mimo-v2.5-tts",
      audio: { format: "wav", voice: "Chloe" },
    });
    expect(payload.messages).toContainEqual({
      role: "assistant",
      content: "hello",
    });
    expect(response.headers.get("Content-Type")).toBe("audio/wav");
  });
});
