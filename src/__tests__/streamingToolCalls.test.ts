import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PLUGIN_EXECUTION_LIMITS } from "../config/limits";
import { streamGeminiResponse } from "../lib/streaming/gemini";
import {
  streamOpenAIChatCompletions,
  streamOpenAIResponse,
  streamOpenAIResponses,
} from "../lib/streaming/openai";
import type { SSEMessage } from "../lib/streaming/sse";

async function* asyncChunks(chunks: unknown[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function toolCallMessages(messages: SSEMessage[]) {
  return messages.filter(
    (message): message is Extract<SSEMessage, { type: "tool_call" }> =>
      message.type === "tool_call",
  );
}

function reasoningMessages(messages: SSEMessage[]) {
  return messages.filter(
    (message): message is Extract<SSEMessage, { type: "reasoning" }> =>
      message.type === "reasoning",
  );
}

function searchMessages(messages: SSEMessage[]) {
  return messages.filter(
    (message): message is Extract<SSEMessage, { type: "search" }> =>
      message.type === "search",
  );
}

describe("streamed tool-call normalization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps OpenAI provider indexes to a dense bounded tool-call list", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      chat: {
        completions: {
          create: vi.fn(async (request: any) => {
            void request;
            return asyncChunks([
              {
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 1_000_000,
                          id: "call_large_index",
                          function: {
                            name: "lookup",
                            arguments: '{"q":"neo"}',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            ]);
          }),
        },
      },
    };

    await streamOpenAIResponse({
      client: client as any,
      model: "gpt-test",
      messages: [],
      onChunk: (message) => messages.push(message),
    });

    const calls = toolCallMessages(messages);
    expect(calls).toHaveLength(1);
    expect(calls[0].toolCall).toMatchObject({
      id: "call_large_index",
      name: "lookup",
      args: { q: "neo" },
      status: "pending",
    });
  });

  it("keeps the streamed tool-call ceiling high but bounded", async () => {
    expect(PLUGIN_EXECUTION_LIMITS.maxStreamedToolCalls).toBe(100);
    const messages: SSEMessage[] = [];
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () =>
            asyncChunks([
              {
                choices: [
                  {
                    delta: {
                      tool_calls: Array.from(
                        {
                          length:
                            PLUGIN_EXECUTION_LIMITS.maxStreamedToolCalls + 2,
                        },
                        (_, index) => ({
                          index,
                          id: `call_${index}`,
                          function: {
                            name: "lookup",
                            arguments: `{"q":"${index}"}`,
                          },
                        }),
                      ),
                    },
                  },
                ],
              },
            ]),
          ),
        },
      },
    };

    await streamOpenAIResponse({
      client: client as any,
      model: "gpt-test",
      messages: [],
      onChunk: (message) => messages.push(message),
    });

    expect(toolCallMessages(messages)).toHaveLength(
      PLUGIN_EXECUTION_LIMITS.maxStreamedToolCalls,
    );
  });

  it("emits oversized or invalid OpenAI tool arguments as completed errors", async () => {
    const messages: SSEMessage[] = [];
    const oversizedArgs = `{"q":"${"x".repeat(
      PLUGIN_EXECUTION_LIMITS.maxArgsJsonChars,
    )}"}`;
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () =>
            asyncChunks([
              {
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        {
                          index: 0,
                          id: "call_big",
                          function: {
                            name: "lookup",
                            arguments: oversizedArgs,
                          },
                        },
                        {
                          index: 1,
                          id: "call_bad_json",
                          function: {
                            name: "lookup",
                            arguments: '{"q":',
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            ]),
          ),
        },
      },
    };

    await streamOpenAIResponse({
      client: client as any,
      model: "gpt-test",
      messages: [],
      onChunk: (message) => messages.push(message),
    });

    const calls = toolCallMessages(messages);
    expect(calls).toHaveLength(2);
    expect(calls[0].toolCall).toMatchObject({
      id: "call_big",
      status: "error",
      isError: true,
    });
    expect(String(calls[0].toolCall.result)).toMatch(/too large/i);
    expect(calls[1].toolCall).toMatchObject({
      id: "call_bad_json",
      status: "error",
      isError: true,
    });
    expect(String(calls[1].toolCall.result)).toMatch(/valid JSON/i);
  });

  it("streams OpenAI Responses API text, usage, and function calls", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      responses: {
        create: vi.fn(async () =>
          asyncChunks([
            { type: "response.output_text.delta", delta: "Hello" },
            {
              type: "response.output_item.done",
              item: {
                type: "function_call",
                call_id: "call_lookup",
                name: "lookup",
                arguments: '{"q":"neo"}',
              },
            },
            {
              type: "response.completed",
              response: {
                usage: {
                  input_tokens: 3,
                  output_tokens: 5,
                  total_tokens: 8,
                },
              },
            },
          ]),
        ),
      },
    };

    await streamOpenAIResponses({
      client: client as any,
      model: "gpt-test",
      input: [],
      onChunk: (message) => messages.push(message),
    });

    expect(messages).toEqual(
      expect.arrayContaining([
        { type: "content", content: "Hello" },
        {
          type: "usage",
          usage: {
            prompt_tokens: 3,
            completion_tokens: 5,
            total_tokens: 8,
          },
        },
      ]),
    );
    expect(toolCallMessages(messages)[0].toolCall).toMatchObject({
      id: "call_lookup",
      name: "lookup",
      args: { q: "neo" },
      status: "pending",
    });
    expect(client.responses.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-test",
        stream: true,
      }),
    );
  });

  it("keeps chat completions available for OpenAI Compatible providers", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () =>
            asyncChunks([
              {
                choices: [
                  {
                    delta: { content: "Compat" },
                  },
                ],
              },
            ]),
          ),
        },
      },
    };

    await streamOpenAIChatCompletions({
      client: client as any,
      model: "compat-model",
      messages: [],
      tools: [],
      onChunk: (message) => messages.push(message),
    });

    expect(messages).toContainEqual({ type: "content", content: "Compat" });
    const request = (client.chat.completions.create as any).mock.calls[0][0];
    expect(request).not.toHaveProperty("tools");
  });

  it("uses a conservative OpenAI Compatible chat request shape", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () =>
            asyncChunks([
              {
                choices: [
                  {
                    delta: { content: "Compat" },
                  },
                ],
              },
            ]),
          ),
        },
      },
    };

    await streamOpenAIChatCompletions({
      client: client as any,
      model: "mimo-v2.5-free",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
        {
          role: "assistant",
          content: "Hi",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this" },
            {
              type: "image_url",
              image_url: { url: "https://example.com/image.png" },
            },
          ],
        },
      ],
      onChunk: (message) => messages.push(message),
    });

    const request = (client.chat.completions.create as any).mock.calls[0][0];
    expect(request).not.toHaveProperty("stream_options");
    expect(request.messages[0]).toEqual({
      role: "user",
      content: "Hello",
    });
    expect(request.messages[1]).toEqual({
      role: "assistant",
      content: "Hi",
    });
    expect(request.messages[2].content).toEqual(
      expect.arrayContaining([
        { type: "text", text: "Describe this" },
        expect.objectContaining({ type: "image_url" }),
      ]),
    );
  });

  it("suppresses OpenAI Compatible reasoning deltas when reasoning is disabled", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () =>
            asyncChunks([
              {
                choices: [
                  {
                    delta: {
                      reasoning_content: "Hidden chain. ",
                      content: "Answer",
                    },
                  },
                ],
              },
              {
                choices: [
                  {
                    delta: {
                      reasoning: "More hidden reasoning.",
                    },
                  },
                ],
              },
            ]),
          ),
        },
      },
    };

    await streamOpenAIChatCompletions({
      client: client as any,
      model: "compat-model",
      messages: [],
      useReasoning: false,
      onChunk: (message) => messages.push(message),
    });

    expect(reasoningMessages(messages)).toEqual([]);
    expect(messages).toContainEqual({ type: "content", content: "Answer" });
  });

  it("streams OpenAI Compatible reasoning deltas when reasoning is enabled", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      chat: {
        completions: {
          create: vi.fn(async () =>
            asyncChunks([
              {
                choices: [
                  {
                    delta: {
                      reasoning_content: "Consider freshness. ",
                      content: "Answer",
                    },
                  },
                ],
              },
              {
                choices: [
                  {
                    delta: {
                      reasoning: "Check sources.",
                    },
                  },
                ],
              },
            ]),
          ),
        },
      },
    };

    await streamOpenAIChatCompletions({
      client: client as any,
      model: "compat-model",
      messages: [],
      useReasoning: true,
      onChunk: (message) => messages.push(message),
    });

    expect(
      reasoningMessages(messages).map((message) => message.content),
    ).toEqual(["Consider freshness. ", "Check sources."]);
    expect(messages).toContainEqual({ type: "content", content: "Answer" });
  });

  it("suppresses OpenAI Responses reasoning events when reasoning is disabled", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      responses: {
        create: vi.fn(async () =>
          asyncChunks([
            {
              type: "response.reasoning_summary_text.delta",
              delta: "Hidden summary.",
            },
            {
              type: "response.output_item.done",
              item: {
                type: "reasoning",
                summary: [{ type: "summary_text", text: "Hidden item." }],
              },
            },
            {
              type: "response.output_text.delta",
              delta: "Visible answer",
            },
          ]),
        ),
      },
    };

    await streamOpenAIResponses({
      client: client as any,
      model: "gpt-test",
      input: [],
      useReasoning: false,
      onChunk: (message) => messages.push(message),
    });

    expect(reasoningMessages(messages)).toEqual([]);
    expect(messages).toContainEqual({
      type: "content",
      content: "Visible answer",
    });
  });

  it("requests OpenAI Responses reasoning summaries and native web search", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      responses: {
        create: vi.fn(async () =>
          asyncChunks([
            {
              type: "response.output_item.done",
              item: {
                type: "web_search_call",
                id: "ws_1",
                status: "completed",
                action: {
                  type: "search",
                  queries: ["neo chat"],
                  sources: [{ type: "url", url: "https://example.com/a" }],
                },
              },
            },
            {
              type: "response.output_item.done",
              item: {
                type: "reasoning",
                summary: [{ type: "summary_text", text: "Need current info." }],
              },
            },
            {
              type: "response.output_item.done",
              item: {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: "Result",
                    annotations: [
                      {
                        type: "url_citation",
                        title: "Example B",
                        url: "https://example.com/b",
                      },
                    ],
                  },
                ],
              },
            },
          ]),
        ),
      },
    };

    await streamOpenAIResponses({
      client: client as any,
      model: "gpt-test",
      input: [],
      useReasoning: true,
      enableWebSearch: true,
      onChunk: (message) => messages.push(message),
    });

    const request = (client.responses.create as any).mock.calls[0][0];
    expect(request.reasoning).toMatchObject({
      effort: "high",
      summary: "auto",
    });
    expect(request.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "web_search_preview" }),
      ]),
    );
    expect(request.include).toEqual(
      expect.arrayContaining([
        "web_search_call.results",
        "web_search_call.action.sources",
      ]),
    );
    expect(
      reasoningMessages(messages).map((message) => message.content),
    ).toEqual(["Need current info."]);
    expect(
      searchMessages(messages).flatMap(
        (message) => message.results?.sources || [],
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: "https://example.com/a" }),
        expect.objectContaining({ url: "https://example.com/b" }),
      ]),
    );
  });

  it("normalizes Gemini tool calls with unique IDs and argument errors", async () => {
    const messages: SSEMessage[] = [];
    vi.spyOn(Date, "now").mockReturnValue(123);
    const client = {
      models: {
        generateContentStream: vi.fn(async () =>
          asyncChunks([
            {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        functionCall: {
                          name: "lookup",
                          args: { q: "neo" },
                        },
                      },
                      {
                        functionCall: {
                          name: "lookup",
                          args: "not-an-object",
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ]),
        ),
      },
    };

    await streamGeminiResponse({
      client: client as any,
      model: "gemini-test",
      contents: [],
      onChunk: (message) => messages.push(message),
    });

    const calls = toolCallMessages(messages);
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.toolCall.id)).toEqual([
      "call_123_0",
      "call_123_1",
    ]);
    expect(calls[0].toolCall).toMatchObject({
      name: "lookup",
      args: { q: "neo" },
      status: "pending",
    });
    expect(calls[1].toolCall).toMatchObject({
      name: "lookup",
      status: "error",
      isError: true,
    });
    expect(String(calls[1].toolCall.result)).toMatch(/JSON object/i);
  });

  it("suppresses Gemini thought parts when reasoning is disabled", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      models: {
        generateContentStream: vi.fn(async () =>
          asyncChunks([
            {
              candidates: [
                {
                  content: {
                    parts: [
                      { thought: true, text: "Hidden thought. " },
                      { text: "Answer" },
                    ],
                  },
                },
              ],
            },
          ]),
        ),
      },
    };

    await streamGeminiResponse({
      client: client as any,
      model: "gemini-test",
      contents: [],
      useReasoning: false,
      onChunk: (message) => messages.push(message),
    });

    expect(reasoningMessages(messages)).toEqual([]);
    expect(messages).toContainEqual({ type: "content", content: "Answer" });
  });

  it("streams Gemini thought parts and grounding metadata as reasoning and search", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      models: {
        generateContentStream: vi.fn(async () =>
          asyncChunks([
            {
              candidates: [
                {
                  content: {
                    parts: [
                      { thought: true, text: "I should search. " },
                      { text: "Answer" },
                    ],
                  },
                  groundingMetadata: {
                    groundingChunks: [
                      {
                        web: { uri: "https://example.com/g", title: "Gemini" },
                      },
                    ],
                    groundingSupports: [
                      { segment: { text: "Grounded snippet" } },
                    ],
                  },
                },
              ],
            },
          ]),
        ),
      },
    };

    await streamGeminiResponse({
      client: client as any,
      model: "gemini-test",
      contents: [],
      useReasoning: true,
      onChunk: (message) => messages.push(message),
    });

    expect(
      reasoningMessages(messages).map((message) => message.content),
    ).toEqual(["I should search. "]);
    expect(messages).toContainEqual({ type: "content", content: "Answer" });
    expect(searchMessages(messages)[0].results?.sources).toEqual([
      expect.objectContaining({
        title: "Gemini",
        url: "https://example.com/g",
        content: "Grounded snippet",
      }),
    ]);
  });
});
