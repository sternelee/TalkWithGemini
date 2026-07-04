import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLUGIN_EXECUTION_LIMITS } from "../config/limits";
import type { Plugin, ToolCall } from "../types";

const mocks = vi.hoisted(() => ({
  executePluginFunction: vi.fn(),
  settingsState: {} as Record<string, unknown>,
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
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      sseResponse([
        { type: "content", content: "Rendered." },
        { type: "done" },
      ]),
    );
    const { buildHtmlVisualPromptInstruction } = await import(
      "../lib/chat/htmlVisualPrompt"
    );
    const { buildDiagramPromptInstruction } = await import(
      "../lib/chat/diagramPrompt"
    );
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
