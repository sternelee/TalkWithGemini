import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMemoryStore } from "../store/core/memoryStore";
import type { MemoryRecord } from "../types";

const mocks = vi.hoisted(() => ({
  coreState: {} as Record<string, unknown>,
  settingsState: {} as Record<string, unknown>,
}));

vi.mock("@/store/core/settingsStore", () => ({
  getTaskModel: vi.fn(() => "openai:gpt-task"),
  useSettingsStore: {
    getState: () => mocks.settingsState,
  },
}));

vi.mock("@/store/core/coreSettingsStore", () => ({
  useCoreSettingsStore: {
    getState: () => mocks.coreState,
  },
}));

vi.mock("@/store/core/memoryStore", async () =>
  vi.importActual("../store/core/memoryStore"),
);

vi.mock("@/utils/pluginUtils", () => ({
  executePluginFunction: vi.fn(),
}));

vi.mock("@/lib/plugin/resolve", () => ({
  getEnabledPluginFunctions: vi.fn(() => []),
}));

vi.mock("@/lib/utils/model", () => ({
  parseModelString: vi.fn((model: string) => {
    const [providerId, modelName] = model.split(":");
    return { providerId, modelName };
  }),
}));

vi.mock("@/lib/settings/searchRag", () => ({
  getSearchCompatibility: vi.fn(() => ({ enabled: true, mode: "native" })),
  getSearchCompatibilityErrorMessage: vi.fn(() => "Search is unavailable"),
}));

vi.mock("@/lib/utils/chatInput", () => ({
  appendContextToChatInput: vi.fn(
    (message: string, context: string) => `${message}\n\n${context}`,
  ),
  clampChatInputText: vi.fn((message: string) => message),
}));

vi.mock("@/lib/chat/entities", async () =>
  vi.importActual("../lib/chat/entities"),
);
vi.mock("@/lib/chat/htmlVisualPrompt", async () =>
  vi.importActual("../lib/chat/htmlVisualPrompt"),
);
vi.mock("@/lib/chat/diagramPrompt", async () =>
  vi.importActual("../lib/chat/diagramPrompt"),
);
vi.mock("@/lib/utils/contextCompression", async () =>
  vi.importActual("../lib/utils/contextCompression"),
);

vi.mock("@/lib/utils/defaultModels", async () =>
  vi.importActual("../lib/utils/defaultModels"),
);
vi.mock("@/lib/defaultConfig/shared", async () =>
  vi.importActual("../lib/defaultConfig/shared"),
);
vi.mock("@/lib/providers/config", async () =>
  vi.importActual("../lib/providers/config"),
);
vi.mock("@/lib/settings/localSecretMigration", async () =>
  vi.importActual("../lib/settings/localSecretMigration"),
);

vi.mock("@/lib/byok/client", () => ({
  buildProviderRuntimeConfig: vi.fn(async (provider) => provider),
  fetchWithByokRetry: vi.fn((requestFactory) => requestFactory()),
}));

vi.mock("../lib/byok/client", () => ({
  buildProviderRuntimeConfig: vi.fn(async (provider) => provider),
  fetchWithByokRetry: vi.fn((requestFactory) => requestFactory()),
}));

vi.mock("../lib/api/client", async () => {
  const actual = await vi.importActual("../lib/api/client");
  return {
    ...actual,
    signedApiFetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, init),
    ),
  };
});

vi.mock("@/lib/utils/devLogger", () => ({
  logDevError: vi.fn(),
  logDevWarn: vi.fn(),
}));

const encoder = new TextEncoder();

function sseResponse(events: unknown[]) {
  const body = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream",
      },
    },
  );
}

function makeMemory(index: number): MemoryRecord {
  return {
    id: `mem_${index}`,
    type: index % 2 === 0 ? "project" : "preference",
    content: `Important memory ${index}`,
    createdAt: index + 1,
    updatedAt: index + 1,
    importance: 3,
    tags: [`tag-${index}`],
    source: "manual",
  };
}

describe("memory dream consolidation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useMemoryStore.setState(useMemoryStore.getInitialState(), true);
    mocks.settingsState = {
      modelMetadata: {},
      customModelMetadata: {},
      search: { provider: "google", configs: {} },
      installedPlugins: [],
      pluginConfigs: {},
      system: {
        compressionThreshold: 12,
        historyKeepCount: 4,
      },
    };
    mocks.coreState = {
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          type: "OpenAI",
          baseUrl: "https://api.openai.com",
          apiKey: "test-key",
          enabled: true,
          models: ["gpt-task"],
          modelsList: ["gpt-task"],
        },
      ],
    };
  });

  it("replaces 101 memories with a dream result capped at 50", async () => {
    useMemoryStore.setState({
      memories: Array.from({ length: 101 }, (_, index) => makeMemory(index)),
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      sseResponse([
        {
          type: "tool_call",
          toolCall: {
            id: "call_dream",
            name: "memory_dream",
            args: {
              memories: Array.from({ length: 50 }, (_, index) => ({
                type: "project",
                content: `Consolidated memory ${index}`,
                importance: 4,
                tags: ["dream"],
              })),
            },
            status: "pending",
          },
        },
        { type: "done" },
      ]),
    );

    const { performMemoryDream } = await import("../services/api/chatService");
    const result = await performMemoryDream();

    expect(result).toHaveLength(50);
    expect(useMemoryStore.getState().memories).toHaveLength(50);
    expect(useMemoryStore.getState().memories[0].source).toBe("dream");
  });

  it("preserves existing memories when dream output is invalid", async () => {
    useMemoryStore.setState({
      memories: Array.from({ length: 101 }, (_, index) => makeMemory(index)),
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      sseResponse([
        {
          type: "tool_call",
          toolCall: {
            id: "call_dream",
            name: "memory_dream",
            args: { memories: [] },
            status: "pending",
          },
        },
        { type: "done" },
      ]),
    );

    const { performMemoryDream } = await import("../services/api/chatService");
    const result = await performMemoryDream();

    expect(result).toBeNull();
    expect(useMemoryStore.getState().memories).toHaveLength(101);
    expect(useMemoryStore.getState().dreamStatus.lastError).toMatch(/invalid/i);
  });
});
