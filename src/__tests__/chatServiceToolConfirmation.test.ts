import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLUGIN_EXECUTION_LIMITS } from "../config/limits";
import type { Plugin, ToolCall } from "../types";

const mocks = vi.hoisted(() => ({
  executePluginFunction: vi.fn(),
  settingsState: {} as Record<string, unknown>,
  memoryState: {} as Record<string, unknown>,
  coreState: {} as Record<string, unknown>,
}));

vi.mock("@/utils/pluginUtils", () => ({
  executePluginFunction: mocks.executePluginFunction,
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

vi.mock("@/store/core/memoryStore", () => ({
  useMemoryStore: {
    getState: () => mocks.memoryState,
  },
}));

vi.mock("@/lib/byok/client", () => ({
  buildProviderRuntimeConfig: vi.fn(async (provider) => provider),
  fetchWithByokRetry: vi.fn((requestFactory) => requestFactory()),
}));

vi.mock("../lib/byok/client", () => ({
  buildProviderRuntimeConfig: vi.fn(async (provider) => provider),
  fetchWithByokRetry: vi.fn((requestFactory) => requestFactory()),
}));

vi.mock("@/lib/plugin/resolve", () => ({
  getEnabledPluginFunctions: vi.fn((plugin: Plugin) => plugin.functions || []),
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

vi.mock("@/lib/chat/entities", () => ({
  normalizeSessionTitle: vi.fn((title?: string) => title || "New Chat"),
}));

vi.mock("@/lib/chat/htmlVisualPrompt", async () =>
  vi.importActual("../lib/chat/htmlVisualPrompt"),
);

vi.mock("@/lib/utils/contextCompression", () => ({
  createContextCompressionSummaryPrompt: vi.fn((text: string) => text),
  mergeCompressedContent: vi.fn((content: string) => content),
  normalizeCompressedContent: vi.fn((content: string) => content),
  textToBase64: vi.fn((text: string) => text),
}));

vi.mock("@/lib/utils/devLogger", () => ({
  logDevError: vi.fn(),
  logDevWarn: vi.fn(),
}));

vi.mock("../services/api/searchService", () => ({
  createSearchProvider: vi.fn(),
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

const writePlugin: Plugin = {
  id: "writer",
  title: "Writer",
  description: "Writes data",
  logoUrl: "",
  manifestUrl: "",
  baseUrl: "https://example.com",
  functions: [
    {
      name: "create_record",
      description: "Create a record",
      method: "POST",
      path: "/records",
      parameters: { type: "object", properties: {} },
    },
  ],
};

describe("chat service tool execution", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.executePluginFunction.mockReset();
    mocks.settingsState = {
      search: { provider: "google", configs: {} },
      installedPlugins: [writePlugin],
      pluginConfigs: {},
    };
    mocks.memoryState = {
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
    };
    mocks.coreState = {
      providers: [
        {
          id: "openai",
          enabled: true,
          type: "OpenAI",
          name: "OpenAI",
          apiKey: "test-key",
        },
      ],
    };
  });

  it("does not expose memory_search for ordinary prompts", async () => {
    mocks.memoryState = {
      settings: {
        enabled: true,
        searchEnabled: true,
        autoRecordEnabled: false,
        dreamEnabled: false,
        triggerCount: 100,
        targetCount: 50,
      },
      memories: [
        {
          id: "mem_1",
          type: "project",
          content: "Keep Mineru as the default document parser.",
          createdAt: 100,
          updatedAt: 100,
          lastUsedAt: 0,
          importance: 5,
          tags: ["mineru", "documents"],
          source: "manual",
        },
      ],
      markMemoriesUsed: vi.fn(),
    };

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.tools.map((tool: any) => tool.function.name)).not.toContain(
          "memory_search",
        );
        return sseResponse([
          { type: "content", content: "Use the configured parser." },
          { type: "done" },
        ]);
      });

    const { streamChatResponse } = await import("../services/api/chatService");
    const result = await streamChatResponse(
      "session-1",
      "openai:gpt-4",
      [],
      "Which parser should I use?",
      [],
      {},
      () => undefined,
    );

    expect(result).toBe("Use the configured parser.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("executes explicit memory_search as an internal tool before plugin tools", async () => {
    const markMemoriesUsed = vi.fn();
    mocks.memoryState = {
      settings: {
        enabled: true,
        searchEnabled: true,
        autoRecordEnabled: false,
        dreamEnabled: false,
        triggerCount: 100,
        targetCount: 50,
      },
      memories: [
        {
          id: "mem_1",
          type: "project",
          content: "Keep Mineru as the default document parser.",
          createdAt: 100,
          updatedAt: 100,
          lastUsedAt: 0,
          importance: 5,
          tags: ["mineru", "documents"],
          source: "manual",
        },
      ],
      markMemoriesUsed,
    };

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.tools.map((tool: any) => tool.function.name)).toContain(
          "memory_search",
        );
        return sseResponse([
          {
            type: "tool_call",
            toolCall: {
              id: "call_memory",
              name: "memory_search",
              args: { query: "document parser" },
              status: "pending",
            },
          },
          { type: "done" },
        ]);
      })
      .mockImplementationOnce(async () =>
        sseResponse([
          { type: "content", content: "Mineru stays the default." },
          { type: "done" },
        ]),
      );

    const updates: ToolCall[][] = [];

    const { streamChatResponse } = await import("../services/api/chatService");
    const result = await streamChatResponse(
      "session-1",
      "openai:gpt-4",
      [],
      "What do you remember about my document parser decision?",
      [],
      {},
      () => undefined,
      undefined,
      undefined,
      (toolCalls) => updates.push(toolCalls),
    );

    expect(result).toBe("Mineru stays the default.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.executePluginFunction).not.toHaveBeenCalled();
    expect(markMemoriesUsed).toHaveBeenCalledWith(["mem_1"]);
    expect(updates.flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "call_memory",
          status: "success",
          result: expect.objectContaining({
            memories: [
              expect.objectContaining({
                id: "mem_1",
                content: "Keep Mineru as the default document parser.",
              }),
            ],
          }),
        }),
      ]),
    );
  });

  it("executes side-effectful tool calls without runtime confirmation", async () => {
    mocks.executePluginFunction.mockResolvedValueOnce({ id: "record-1" });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () =>
        sseResponse([
          {
            type: "tool_call",
            toolCall: {
              id: "call_write",
              name: "create_record",
              args: { title: "Draft" },
              status: "pending",
            },
          },
          { type: "done" },
        ]),
      )
      .mockImplementationOnce(async () =>
        sseResponse([
          { type: "content", content: "Created record-1." },
          { type: "done" },
        ]),
      );
    const updates: ToolCall[][] = [];

    const { streamChatResponse } = await import("../services/api/chatService");
    const result = await streamChatResponse(
      "session-1",
      "openai:gpt-4",
      [],
      "Create a record",
      [],
      {},
      () => undefined,
      undefined,
      undefined,
      (toolCalls) => updates.push(toolCalls),
      undefined,
      undefined,
      undefined,
      ["writer"],
    );

    expect(result).toBe("Created record-1.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.executePluginFunction).toHaveBeenCalledWith(
      "create_record",
      { title: "Draft" },
      undefined,
      ["writer"],
      undefined,
    );
    expect(updates.flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "call_write",
          status: "success",
          result: { id: "record-1" },
        }),
      ]),
    );
    expect(updates.flat()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "awaiting_confirmation" }),
        expect.objectContaining({ status: "denied" }),
      ]),
    );
  });

  it("adds API-only HTML visual request instructions when system prompt enables them", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        sseResponse([
          { type: "content", content: "Rendered." },
          { type: "done" },
        ]),
      );
    const { buildHtmlVisualPromptInstruction } =
      await import("../lib/chat/htmlVisualPrompt");
    const { buildDiagramPromptInstruction } =
      await import("../lib/chat/diagramPrompt");
    const { streamChatResponse } = await import("../services/api/chatService");

    await streamChatResponse(
      "session-1",
      "openai:gpt-4",
      [],
      "Compare these options.",
      [],
      {},
      () => undefined,
      `${buildDiagramPromptInstruction({ enhanced: true })}\n\n${buildHtmlVisualPromptInstruction()}`,
    );

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(body.newMessage).toContain("Compare these options.");
    expect(body.newMessage).toContain("<format_instructions");
    expect(body.newMessage).toContain("raw HTML fragments directly");
    expect(body.newMessage).toContain(
      "Never place HTML visual fragments inside code fences",
    );
    expect(body.newMessage).toContain('data-diagram-rendering="true"');
    expect(body.newMessage).toContain("Mermaid");
    expect(body.newMessage).toContain("mindmap");
    expect(body.systemInstruction).toContain("<html-visual>");
    expect(body.systemInstruction).toContain("<diagram-rendering>");
    expect(body.systemInstruction).toContain("<diagram-visual-polish>");
  });

  it("injects resolved skills context into the final model request", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        sseResponse([
          { type: "content", content: "Translated." },
          { type: "done" },
        ]),
      );
    const { streamChatResponse } = await import("../services/api/chatService");

    await streamChatResponse(
      "session-1",
      "openai:gpt-4",
      [],
      "请翻译成英文",
      [],
      {},
      () => undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "[Skills]\nUse Translation & Localization.",
    );

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(body.newMessage).toContain("请翻译成英文");
    expect(body.newMessage).toContain("[Skills]");
    expect(body.newMessage).toContain("Translation & Localization");
    expect(body.systemInstruction).toBeUndefined();
  });

  it("uses the centralized high tool-round limit before stopping recursive calls", async () => {
    expect(PLUGIN_EXECUTION_LIMITS.maxToolRounds).toBe(20);
    mocks.executePluginFunction.mockResolvedValue({ ok: true });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      sseResponse([
        {
          type: "tool_call",
          toolCall: {
            id: `call_${Date.now()}`,
            name: "create_record",
            args: { title: "Loop" },
            status: "pending",
          },
        },
        { type: "done" },
      ]),
    );

    const { streamChatResponse } = await import("../services/api/chatService");
    const result = await streamChatResponse(
      "session-1",
      "openai:gpt-4",
      [],
      "Keep calling",
      [],
      {},
      () => undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ["writer"],
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(
      PLUGIN_EXECUTION_LIMITS.maxToolRounds + 1,
    );
    expect(result).toContain("20 tool-call rounds");
  });
});
