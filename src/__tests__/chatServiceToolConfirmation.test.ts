import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLUGIN_EXECUTION_LIMITS } from "../config/limits";
import type {
  MessageOutputBlock,
  ModelMetadata,
  Plugin,
  ToolCall,
} from "../types";

const mocks = vi.hoisted(() => ({
  executePluginFunction: vi.fn(),
  settingsState: {} as Record<string, unknown>,
  memoryState: {} as Record<string, unknown>,
  coreState: {} as Record<string, unknown>,
  supportsImageGeneration: vi.fn<(metadata?: ModelMetadata) => boolean>(
    () => false,
  ),
  supportsTextOutput: vi.fn<(metadata?: ModelMetadata) => boolean>(() => true),
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

vi.mock("../lib/api/client", async () => {
  const actual = await vi.importActual("../lib/api/client");
  return {
    ...actual,
    signedApiFetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, init),
    ),
  };
});

vi.mock("@/lib/plugin/resolve", () => ({
  getEnabledPluginFunctions: vi.fn((plugin: Plugin) => plugin.functions || []),
}));

vi.mock("@/lib/utils/model", () => ({
  parseModelString: vi.fn((model: string) => {
    const [providerId, modelName] = model.split(":");
    return { providerId, modelName };
  }),
  supportsImageGeneration: mocks.supportsImageGeneration,
  supportsTextOutput: mocks.supportsTextOutput,
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

const imagePlugin: Plugin = {
  id: "openai-image-generation",
  title: "OpenAI-compatible Image Processing",
  description: "Process images",
  logoUrl: "",
  manifestUrl: "",
  baseUrl: "https://api.openai.com/v1",
  functions: [
    {
      name: "generate_image_with_images_api",
      description: "Generate or edit images",
      method: "POST",
      path: "/images/generations",
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
    mocks.supportsImageGeneration.mockReset();
    mocks.supportsImageGeneration.mockReturnValue(false);
    mocks.supportsTextOutput.mockReset();
    mocks.supportsTextOutput.mockReturnValue(true);
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

  it("does not render image plugin results as visible output image blocks", async () => {
    mocks.settingsState = {
      ...mocks.settingsState,
      installedPlugins: [imagePlugin],
    };
    mocks.executePluginFunction.mockResolvedValueOnce({
      imageBase64: "aW1hZ2U=",
      images: [
        {
          imageBase64: "aW1hZ2U=",
          mimeType: "image/png",
        },
      ],
      revisedPrompt: "Edited prompt",
      raw: {
        data: [{ b64_json: "aW1hZ2U=", revised_prompt: "Edited prompt" }],
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async () =>
        sseResponse([
          {
            type: "tool_call",
            toolCall: {
              id: "call_image",
              name: "generate_image_with_images_api",
              args: { prompt: "Edit this image" },
              status: "pending",
            },
          },
          { type: "done" },
        ]),
      )
      .mockImplementationOnce(async () =>
        sseResponse([
          { type: "content", content: "Edited." },
          { type: "done" },
        ]),
      );
    const outputSnapshots: MessageOutputBlock[][] = [];

    const { streamChatResponse } = await import("../services/api/chatService");
    const result = await streamChatResponse(
      "session-1",
      "openai:gpt-4",
      [],
      "Edit this image",
      [],
      {},
      (_content, _reasoning, outputBlocks) => {
        if (outputBlocks) outputSnapshots.push(outputBlocks);
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ["openai-image-generation"],
      undefined,
      (outputBlocks) => outputSnapshots.push(outputBlocks),
    );

    expect(result).toBe("Edited.");
    expect(
      outputSnapshots.some((blocks) =>
        blocks.some(
          (block) =>
            block.type === "tool_group" &&
            block.toolCalls.some(
              (toolCall) =>
                toolCall.id === "call_image" && toolCall.status === "success",
            ),
        ),
      ),
    ).toBe(true);
    expect(outputSnapshots.flat().some((block) => block.type === "image")).toBe(
      false,
    );
    const followUpBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit).body),
    );
    const toolResult = followUpBody.history?.[1]?.toolCalls?.[0]
      ?.result as Record<string, unknown>;
    expect(toolResult).toEqual({
      imageUrl: null,
      imageBase64: "[image omitted]",
      imageCount: 1,
      revisedPrompt: "Edited prompt",
    });
    expect(JSON.stringify(followUpBody.history)).not.toContain("aW1hZ2U=");
    expect(toolResult).not.toHaveProperty("raw");
    expect(toolResult).not.toHaveProperty("images");
  });

  it("emits one error output transition when tool execution fails", async () => {
    mocks.executePluginFunction.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(globalThis, "fetch")
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
          { type: "content", content: "The tool failed." },
          { type: "done" },
        ]),
      );
    const outputSnapshots: MessageOutputBlock[][] = [];

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
      undefined,
      undefined,
      undefined,
      undefined,
      ["writer"],
      undefined,
      (blocks) => outputSnapshots.push(blocks),
    );

    const statuses = outputSnapshots
      .map(
        (blocks) =>
          blocks
            .find((block) => block.type === "tool_group")
            ?.toolCalls.find((toolCall) => toolCall.id === "call_write")
            ?.status,
      )
      .filter(Boolean);

    expect(result).toBe("The tool failed.");
    expect(mocks.executePluginFunction).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual(["pending", "running", "error"]);
  });

  it("keeps streamed generated images in output blocks without duplicating them as attachments", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () =>
      sseResponse([
        {
          type: "image",
          image: {
            id: "img_generated",
            mimeType: "image/png",
            data: "aW1hZ2U=",
            fileName: "generated.png",
          },
        },
        { type: "done" },
      ]),
    );
    const chunks: MessageOutputBlock[][] = [];
    const onImage = vi.fn();

    const { streamChatResponse } = await import("../services/api/chatService");
    await streamChatResponse(
      "session-1",
      "openai:gpt-4",
      [],
      "Create an image",
      [],
      {},
      (_content, _reasoning, outputBlocks) => {
        if (outputBlocks) chunks.push(outputBlocks);
      },
      undefined,
      undefined,
      undefined,
      onImage,
    );

    expect(onImage).not.toHaveBeenCalled();
    expect(chunks.at(-1)).toEqual([
      expect.objectContaining({
        type: "image",
        image: expect.objectContaining({
          id: "img_generated",
          data: "aW1hZ2U=",
        }),
      }),
    ]);
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
    expect(body.newMessage).toContain(
      "Use light or pale backgrounds with dark, readable foreground text",
    );
    expect(body.newMessage).toContain(
      "Aim for at least a 4.5:1 foreground/background contrast ratio",
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

  it("routes OpenAI Compatible image-only models through the direct image endpoint", async () => {
    mocks.coreState = {
      providers: [
        {
          id: "krill",
          enabled: true,
          type: "OpenAI Compatible",
          name: "Krill",
          baseUrl: "https://api.krill-ai.com/v1",
          apiKey: "test-key",
          models: ["gpt-image-2"],
        },
      ],
    };
    mocks.settingsState = {
      ...mocks.settingsState,
      modelMetadata: {
        "gpt-image-2": {
          id: "gpt-image-2",
          modalities: { input: ["text", "image"], output: ["image"] },
        },
      },
    };
    mocks.supportsImageGeneration.mockImplementation(
      (metadata) =>
        Array.isArray(metadata?.modalities?.output) &&
        metadata.modalities.output.includes("image"),
    );
    mocks.supportsTextOutput.mockImplementation(
      (metadata) =>
        !Array.isArray(metadata?.modalities?.output) ||
        metadata.modalities.output.includes("text"),
    );

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        images: [{ id: "img_1", mimeType: "image/png", data: "aW1hZ2U=" }],
        message: "Generated image",
      }),
    );
    const outputSnapshots: MessageOutputBlock[][] = [];
    const { streamChatResponse } = await import("../services/api/chatService");

    await streamChatResponse(
      "session-1",
      "krill:gpt-image-2",
      [],
      "Draw a quiet dashboard.",
      [],
      {},
      (_content, _reasoning, outputBlocks) => {
        if (outputBlocks) outputSnapshots.push(outputBlocks);
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (outputBlocks) => outputSnapshots.push(outputBlocks),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/chat/generate-image");
    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    );
    expect(body.provider).toMatchObject({
      type: "OpenAI Compatible",
      baseUrl: "https://api.krill-ai.com/v1",
    });
    expect(body.modelName).toBe("gpt-image-2");
    expect(body.prompt).toContain("Draw a quiet dashboard.");
    expect(outputSnapshots[0]).toEqual([
      expect.objectContaining({
        type: "image_generation_status",
        status: "generating",
      }),
    ]);
    expect(outputSnapshots.at(-1)).toEqual([
      expect.objectContaining({
        type: "image",
        image: expect.objectContaining({ id: "img_1" }),
      }),
    ]);
  });

  it("removes the direct image loading block when image generation fails", async () => {
    mocks.coreState = {
      providers: [
        {
          id: "krill",
          enabled: true,
          type: "OpenAI Compatible",
          name: "Krill",
          baseUrl: "https://api.krill-ai.com/v1",
          apiKey: "test-key",
          models: ["gpt-image-2"],
        },
      ],
    };
    mocks.settingsState = {
      ...mocks.settingsState,
      modelMetadata: {
        "gpt-image-2": {
          id: "gpt-image-2",
          modalities: { input: ["text", "image"], output: ["image"] },
        },
      },
    };
    mocks.supportsImageGeneration.mockImplementation(
      (metadata) =>
        Array.isArray(metadata?.modalities?.output) &&
        metadata.modalities.output.includes("image"),
    );
    mocks.supportsTextOutput.mockImplementation(
      (metadata) =>
        !Array.isArray(metadata?.modalities?.output) ||
        metadata.modalities.output.includes("text"),
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ error: "provider failed" }, { status: 502 }),
    );
    const outputSnapshots: MessageOutputBlock[][] = [];
    const { streamChatResponse } = await import("../services/api/chatService");

    await expect(
      streamChatResponse(
        "session-1",
        "krill:gpt-image-2",
        [],
        "Draw a quiet dashboard.",
        [],
        {},
        (_content, _reasoning, outputBlocks) => {
          if (outputBlocks) outputSnapshots.push(outputBlocks);
        },
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        (outputBlocks) => outputSnapshots.push(outputBlocks),
      ),
    ).rejects.toThrow("provider failed");

    expect(outputSnapshots[0]).toEqual([
      expect.objectContaining({
        type: "image_generation_status",
        status: "generating",
      }),
    ]);
    expect(outputSnapshots.at(-1)).toEqual([]);
  });

  it("uses a text fallback model for external search decisions when the selected model is image-only", async () => {
    mocks.coreState = {
      defaultModels: { promptOptimization: "openai:gpt-4o-mini" },
      providers: [
        {
          id: "krill",
          enabled: true,
          type: "OpenAI Compatible",
          name: "Krill",
          apiKey: "test-key",
          models: ["gpt-image-2"],
        },
        {
          id: "openai",
          enabled: true,
          type: "OpenAI",
          name: "OpenAI",
          apiKey: "test-key",
          models: ["gpt-4o-mini"],
        },
      ],
    };
    mocks.settingsState = {
      ...mocks.settingsState,
      search: { provider: "tavily", configs: { tavily: { apiKey: "search" } } },
      modelMetadata: {
        "gpt-image-2": {
          id: "gpt-image-2",
          modalities: { input: ["text"], output: ["image"] },
        },
        "gpt-4o-mini": {
          id: "gpt-4o-mini",
          modalities: { input: ["text"], output: ["text"] },
        },
      },
    };
    mocks.supportsImageGeneration.mockImplementation(
      (metadata) =>
        Array.isArray(metadata?.modalities?.output) &&
        metadata.modalities.output.includes("image"),
    );
    mocks.supportsTextOutput.mockImplementation(
      (metadata) =>
        !Array.isArray(metadata?.modalities?.output) ||
        metadata.modalities.output.includes("text"),
    );

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.modelName).toBe("gpt-task");
        return sseResponse([
          { type: "content", content: '{"shouldSearch":false}' },
          { type: "done" },
        ]);
      })
      .mockImplementationOnce(async () =>
        Response.json({
          images: [{ id: "img_1", mimeType: "image/png", data: "aW1hZ2U=" }],
          message: "Generated image",
        }),
      );
    const { streamChatResponse } = await import("../services/api/chatService");

    await streamChatResponse(
      "session-1",
      "krill:gpt-image-2",
      [],
      "Draw current market mood.",
      [],
      { useSearch: true },
      () => undefined,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/chat/generate");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/chat/generate-image");
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
