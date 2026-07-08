import { describe, expect, it, vi } from "vitest";
import { ATTACHMENT_LIMITS } from "../config/limits";
import {
  cacheGeneratedImageAttachments,
  normalizeGeneratedImageAttachment,
  normalizeGeneratedImageAttachments,
} from "../lib/utils/generatedImages";
import { streamGeminiResponse } from "../lib/streaming/gemini";
import { streamOpenAIResponses } from "../lib/streaming/openai";
import type { SSEMessage } from "../lib/streaming/sse";

async function* asyncChunks(chunks: unknown[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe("generated image attachment normalization", () => {
  it("normalizes generated image metadata and rejects invalid payloads", () => {
    const normalized = normalizeGeneratedImageAttachment({
      id: " image-1 ",
      mimeType: "text/html",
      data: " abc123 ",
      fileName: "../bad\u0000name.png",
    });

    expect(normalized).toMatchObject({
      id: "image-1",
      mimeType: "image/png",
      data: "abc123",
    });
    expect(normalized?.fileName).not.toMatch(/[\\/]/);

    expect(
      normalizeGeneratedImageAttachment({
        mimeType: "image/png",
        data: "",
        fileName: "empty.png",
      }),
    ).toBeNull();
    expect(
      normalizeGeneratedImageAttachment({
        mimeType: "image/png",
        data: "x".repeat(ATTACHMENT_LIMITS.maxBase64Chars + 1),
        fileName: "huge.png",
      }),
    ).toBeNull();
  });

  it("normalizes URL-only generated images and prefers inline data when both are present", () => {
    expect(
      normalizeGeneratedImageAttachment({
        id: " image-url ",
        mimeType: "image/webp",
        url: " https://cdn.example.com/generated.webp ",
        fileName: "remote.webp",
      }),
    ).toMatchObject({
      id: "image-url",
      mimeType: "image/webp",
      url: "https://cdn.example.com/generated.webp",
      fileName: "remote.webp",
    });

    const inlinePreferred = normalizeGeneratedImageAttachment({
      mimeType: "image/png",
      data: "aW1hZ2U=",
      url: "https://cdn.example.com/generated.png",
      fileName: "inline.png",
    });
    expect(inlinePreferred).toMatchObject({
      data: "aW1hZ2U=",
    });
    expect(inlinePreferred).not.toHaveProperty("url");

    expect(
      normalizeGeneratedImageAttachment({
        mimeType: "image/png",
        url: "http://example.com/generated.png",
        fileName: "plain-http.png",
      }),
    ).toBeNull();
    expect(
      normalizeGeneratedImageAttachment({
        mimeType: "image/png",
        url: "https://localhost/generated.png",
        fileName: "localhost.png",
      }),
    ).toBeNull();
    expect(
      normalizeGeneratedImageAttachment({
        mimeType: "image/png",
        url: `https://example.com/${"a".repeat(ATTACHMENT_LIMITS.maxUrlChars)}`,
        fileName: "too-long.png",
      }),
    ).toBeNull();
  });

  it("caps generated image attachment batches", () => {
    const attachments = normalizeGeneratedImageAttachments(
      Array.from({ length: ATTACHMENT_LIMITS.maxCount + 5 }, (_, index) => ({
        mimeType: "image/png",
        data: `image-${index}`,
        fileName: `generated-${index}.png`,
      })),
    );

    expect(attachments).toHaveLength(ATTACHMENT_LIMITS.maxCount);
  });

  it("adds OPFS display cache metadata to generated image attachments", async () => {
    const saveFile = vi.fn(async () => "opfs://images/generated/image.png");
    const [attachment] = normalizeGeneratedImageAttachments([
      {
        id: "img_1",
        mimeType: "image/png",
        data: "aW1hZ2U=",
        fileName: "generated.png",
      },
    ]);

    const cached = await cacheGeneratedImageAttachments([attachment], {
      saveFile,
      now: () => 456,
    });

    expect(cached[0]).toMatchObject({
      id: "img_1",
      data: "aW1hZ2U=",
      displayCache: {
        opfsUrl: "opfs://images/generated/image.png",
        sourceKind: "data",
        createdAt: 456,
      },
    });
    expect(saveFile).toHaveBeenCalledTimes(1);
  });

  it("leaves URL-only generated images uncached for direct display", async () => {
    const saveFile = vi.fn(async () => "opfs://images/generated/image.png");
    const [attachment] = normalizeGeneratedImageAttachments([
      {
        id: "img_url",
        mimeType: "image/png",
        url: "https://cdn.example.com/generated.png",
        fileName: "generated.png",
      },
    ]);

    const cached = await cacheGeneratedImageAttachments([attachment], {
      saveFile,
      now: () => 456,
    });

    expect(cached[0]).toMatchObject({
      id: "img_url",
      url: "https://cdn.example.com/generated.png",
    });
    expect(cached[0]).not.toHaveProperty("displayCache");
    expect(saveFile).not.toHaveBeenCalled();
  });

  it("normalizes Gemini inline images before emitting SSE messages", async () => {
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
                      {
                        inlineData: {
                          mimeType: "text/html",
                          data: "safe-image",
                        },
                      },
                      {
                        inlineData: {
                          mimeType: "image/png",
                          data: "x".repeat(
                            ATTACHMENT_LIMITS.maxBase64Chars + 1,
                          ),
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

    const imageMessages = messages.filter(
      (message): message is Extract<SSEMessage, { type: "image" }> =>
        message.type === "image",
    );

    expect(imageMessages).toHaveLength(1);
    expect(imageMessages[0].image).toMatchObject({
      mimeType: "image/png",
      data: "safe-image",
    });
  });

  it("emits OpenAI Responses image generation outputs as image chunks", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      responses: {
        create: vi.fn(async () =>
          asyncChunks([
            {
              type: "response.image_generation_call.completed",
              item: {
                id: "ig_1",
                result: "openai-image",
              },
            },
            { type: "response.completed", response: {} },
          ]),
        ),
      },
    };

    await streamOpenAIResponses({
      client: client as any,
      model: "gpt-5.1",
      input: [],
      tools: [{ type: "image_generation", model: "gpt-image-2" }],
      onChunk: (message) => messages.push(message),
    });

    const imageMessages = messages.filter(
      (message): message is Extract<SSEMessage, { type: "image" }> =>
        message.type === "image",
    );

    expect(imageMessages).toHaveLength(1);
    expect(imageMessages[0].image).toMatchObject({
      mimeType: "image/png",
      data: "openai-image",
    });
  });

  it("ignores OpenAI Responses partial image events until the completed image arrives", async () => {
    const messages: SSEMessage[] = [];
    const client = {
      responses: {
        create: vi.fn(async () =>
          asyncChunks([
            {
              type: "response.image_generation_call.partial_image",
              item_id: "ig_1",
              partial_image_b64: "preview-frame",
            },
            {
              type: "response.image_generation_call.completed",
              item: {
                id: "ig_1",
                result: "final-image",
              },
            },
            { type: "response.completed", response: {} },
          ]),
        ),
      },
    };

    await streamOpenAIResponses({
      client: client as any,
      model: "gpt-5.1",
      input: [],
      tools: [{ type: "image_generation", model: "gpt-image-2" }],
      onChunk: (message) => messages.push(message),
    });

    const imageMessages = messages.filter(
      (message): message is Extract<SSEMessage, { type: "image" }> =>
        message.type === "image",
    );

    expect(imageMessages).toHaveLength(1);
    expect(imageMessages[0].image).toMatchObject({
      id: "ig_1",
      data: "final-image",
    });
  });
});
