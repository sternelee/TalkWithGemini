import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONTEXT_COMPRESSION_LIMITS } from "../config/limits";
import type { Message, ModelProvider } from "../types";

const mocks = vi.hoisted(() => ({
  coreGetState: vi.fn(),
  getTaskModel: vi.fn(),
  settingsGetState: vi.fn(),
  signedApiFetch: vi.fn(),
}));

vi.mock("@/store/core/coreSettingsStore", () => ({
  useCoreSettingsStore: { getState: mocks.coreGetState },
}));

vi.mock("@/store/core/settingsStore", () => ({
  getTaskModel: mocks.getTaskModel,
  useSettingsStore: { getState: mocks.settingsGetState },
}));

vi.mock("@/store/core/memoryStore", () => ({
  useMemoryStore: { getState: vi.fn(() => ({ memories: [] })) },
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

vi.mock("@/lib/utils/contextCompression", async () =>
  vi.importActual("../lib/utils/contextCompression"),
);

vi.mock("../lib/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("../lib/api/client")>(
      "../lib/api/client",
    );
  return { ...actual, signedApiFetch: mocks.signedApiFetch };
});

vi.mock("../lib/byok/client", async () => {
  const actual =
    await vi.importActual<typeof import("../lib/byok/client")>(
      "../lib/byok/client",
    );
  return {
    ...actual,
    buildProviderRuntimeConfig: vi.fn(async (provider) => provider),
    fetchWithByokRetry: vi.fn(async (request) => request()),
  };
});

const provider: ModelProvider = {
  id: "provider",
  name: "Provider",
  type: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  enabled: true,
  models: ["model"],
  modelsList: ["model"],
};

function message(id: string, content = id): Message {
  return { id, role: "user", content, timestamp: 1 };
}

describe("background compression consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.coreGetState.mockReturnValue({ providers: [provider] });
    mocks.getTaskModel.mockReturnValue("provider:model");
    mocks.settingsGetState.mockReturnValue({
      system: { compressionThreshold: 1, historyKeepCount: 1 },
      modelMetadata: { model: { attachment: true } },
      customModelMetadata: {},
    });
  });

  it("advances the marker only through the last whole source message", async () => {
    const { performBackgroundCompression } =
      await import("../services/api/chatService");
    const messages = [
      message("preserved-first"),
      message("included", "a".repeat(90_000)),
      message("not-included", "b".repeat(90_000)),
      message("candidate-3"),
      message("candidate-4"),
      message("tail-1"),
      message("tail-2"),
    ];

    const result = await performBackgroundCompression(
      messages,
      undefined,
      "provider:model",
    );

    expect(result?.lastCompressedMessageId).toBe("included");
    expect(result?.compressedContent).toContain("a".repeat(100));
    expect(result?.compressedContent).not.toContain("b".repeat(100));
  });

  it("does not advance when the first candidate cannot be fully represented", async () => {
    const { performBackgroundCompression } =
      await import("../services/api/chatService");
    const messages = [
      message("preserved-first"),
      message(
        "oversized",
        "x".repeat(CONTEXT_COMPRESSION_LIMITS.maxSummarySourceChars + 1),
      ),
      message("candidate-2"),
      message("candidate-3"),
      message("candidate-4"),
      message("tail-1"),
      message("tail-2"),
    ];

    await expect(
      performBackgroundCompression(messages, undefined, "provider:model"),
    ).resolves.toBeNull();
  });

  it("propagates AbortError instead of storing the fallback summary", async () => {
    mocks.settingsGetState.mockReturnValue({
      system: { compressionThreshold: 1, historyKeepCount: 1 },
      modelMetadata: { model: { attachment: false } },
      customModelMetadata: {},
    });
    const abortError = new DOMException("Aborted", "AbortError");
    mocks.signedApiFetch.mockRejectedValue(abortError);
    const { performBackgroundCompression } =
      await import("../services/api/chatService");
    const messages = [
      message("preserved-first"),
      message("candidate-1"),
      message("candidate-2"),
      message("candidate-3"),
      message("candidate-4"),
      message("tail-1"),
      message("tail-2"),
    ];

    await expect(
      performBackgroundCompression(
        messages,
        undefined,
        "provider:model",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
