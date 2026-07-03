import { describe, expect, it, vi } from "vitest";
import { ATTACHMENT_LIMITS } from "../config/limits";
import {
  normalizeGeneratedImageAttachment,
  normalizeGeneratedImageAttachments,
} from "../lib/utils/generatedImages";
import { streamGeminiResponse } from "../lib/streaming/gemini";
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
});
