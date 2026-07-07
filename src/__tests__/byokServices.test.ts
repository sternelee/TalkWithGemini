import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelProvider } from "../types";

const mocks = vi.hoisted(() => ({
  coreGetState: vi.fn(),
  getTaskModel: vi.fn(),
  settingsGetState: vi.fn(),
}));

vi.mock("@/store/core/coreSettingsStore", () => ({
  useCoreSettingsStore: {
    getState: mocks.coreGetState,
  },
}));

vi.mock("@/store/core/settingsStore", () => ({
  getTaskModel: mocks.getTaskModel,
  useSettingsStore: {
    getState: mocks.settingsGetState,
  },
}));

vi.mock("@/store/core/memoryStore", () => ({
  useMemoryStore: {
    getState: () => ({
      settings: {
        enabled: false,
        searchEnabled: false,
        autoRecordEnabled: false,
        dreamEnabled: false,
        triggerCount: 100,
        targetCount: 50,
      },
      memories: [],
      markMemoriesUsed: vi.fn(),
    }),
  },
}));

vi.mock("@/utils/pluginUtils", () => ({
  executePluginFunction: vi.fn(),
}));

vi.mock("@/lib/plugin/resolve", () => ({
  getEnabledPluginFunctions: vi.fn(() => []),
}));

vi.mock("@/lib/utils/model", async () => vi.importActual("../lib/utils/model"));

vi.mock("@/lib/chat/entities", async () =>
  vi.importActual("../lib/chat/entities"),
);

vi.mock("@/lib/utils/chatInput", () => ({
  appendContextToChatInput: vi.fn((input) => input),
  clampChatInputText: vi.fn((value) => value),
}));

vi.mock("@/lib/settings/searchRag", () => ({
  getSearchCompatibility: vi.fn(() => ({ enabled: true, mode: "none" })),
  getSearchCompatibilityErrorMessage: vi.fn(() => "Search is unavailable"),
}));

vi.mock("@/lib/utils/contextCompression", () => ({
  createContextCompressionSummaryPrompt: vi.fn(() => ""),
  mergeCompressedContent: vi.fn((value) => value),
  normalizeCompressedContent: vi.fn((value) => value),
  textToBase64: vi.fn((value) => value),
}));

vi.mock("@/lib/utils/disposableAudio", () => ({
  createDisposableAudioFromBlob: vi.fn(),
}));

vi.mock("@/lib/utils/voiceModels", async () =>
  vi.importActual("../lib/utils/voiceModels"),
);

vi.mock("../lib/api/client", async () => {
  const actual = await vi.importActual("../lib/api/client");
  return {
    ...actual,
    signedApiFetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, init),
    ),
  };
});

const providerWithoutLocalKey: ModelProvider = {
  id: "env-provider",
  name: "Env Gemini",
  type: "Gemini",
  baseUrl: "https://generativelanguage.googleapis.com",
  apiKey: "",
  enabled: true,
  models: ["gemini-title", "audio-model"],
  modelsList: ["gemini-title", "audio-model"],
};

function getJsonRequestBody(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
  return JSON.parse(String(fetchMock.mock.calls[index]?.[1]?.body));
}

describe("BYOK service requests", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mocks.coreGetState.mockReturnValue({
      providers: [providerWithoutLocalKey],
    });
    mocks.getTaskModel.mockReturnValue("env-provider:gemini-title");
    mocks.settingsGetState.mockReturnValue({
      search: {
        provider: "google",
        configs: {},
        resultsLimit: 5,
      },
    });
  });

  it("allows chat helper calls to use server env fallback without sending apiKey", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ title: "Generated title" }));
    const { generateChatTitle } = await import("../services/api/chatService");

    await expect(
      generateChatTitle([
        {
          id: "msg-1",
          role: "user",
          content: "hello",
          timestamp: 0,
        },
      ]),
    ).resolves.toBe("Generated title");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat/generate-title",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.provider).toMatchObject({
      type: "Gemini",
      name: "Env Gemini",
    });
    expect(JSON.stringify(body)).not.toContain("apiKey");
  });

  it("allows auxiliary provider helpers to use server env fallback", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ output: "ok" }))
      .mockResolvedValueOnce(Response.json({ questions: ["next?"] }))
      .mockResolvedValueOnce(Response.json({ queries: ["rag query"] }))
      .mockResolvedValueOnce(Response.json({ images: [], message: "done" }));
    const {
      executeCode,
      generateImage,
      generateRAGSearchQueries,
      generateRelatedQuestions,
    } = await import("../services/api/chatService");

    await expect(
      executeCode("env-provider:gemini-title", "print('hi')"),
    ).resolves.toBe("ok");
    await expect(generateRelatedQuestions([])).resolves.toEqual(["next?"]);
    await expect(generateRAGSearchQueries("hello")).resolves.toEqual([
      "rag query",
    ]);
    await expect(
      generateImage("env-provider:gemini-title", "paint a quiet UI"),
    ).resolves.toMatchObject({ message: "done" });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (let index = 0; index < 4; index += 1) {
      expect(
        JSON.stringify(getJsonRequestBody(fetchMock, index)),
      ).not.toContain("apiKey");
    }
  });

  it("allows voice model STT to use server env fallback without sending apiKey", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ text: "Transcript" }));
    const { transcribeAudio } = await import("../services/api/voiceService");

    await expect(
      transcribeAudio(new Blob(["audio"], { type: "audio/webm" }), {
        sttProvider: "model",
        sttModel: "env-provider:audio-model",
        sttLanguage: "auto",
      } as any),
    ).resolves.toBe("Transcript");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/voice/transcribe",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    const modelProvider = JSON.parse(String(body.get("modelProvider")));
    expect(modelProvider).toMatchObject({
      type: "Gemini",
      name: "Env Gemini",
    });
    expect(JSON.stringify(modelProvider)).not.toContain("apiKey");
  });

  it("allows voice model TTS to use server env fallback without sending apiKey", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("audio", { status: 200 }));
    const { synthesizeSpeech } = await import("../services/api/voiceService");

    await expect(
      synthesizeSpeech("hello", {
        ttsProvider: "model",
        ttsModel: "env-provider:audio-model",
      } as any),
    ).resolves.toBeUndefined();

    const body = getJsonRequestBody(fetchMock);
    expect(body.modelProvider).toMatchObject({
      type: "Gemini",
      name: "Env Gemini",
    });
    expect(JSON.stringify(body)).not.toContain("apiKey");
  });
});
