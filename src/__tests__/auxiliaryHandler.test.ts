import { beforeEach, describe, expect, it, vi } from "vitest";
import { API_INPUT_LIMITS, AUXILIARY_OUTPUT_LIMITS } from "../config/limits";
import type { Message } from "../types";

const mocks = vi.hoisted(() => ({
  handleSimpleGeneration: vi.fn(),
}));

vi.mock("../lib/api/chat-handler", () => ({
  handleSimpleGeneration: mocks.handleSimpleGeneration,
}));

import {
  generateRAGQueries,
  generateRelatedQuestions,
  generateTitle,
} from "../lib/api/auxiliary-handler";

const provider = { type: "Gemini", apiKey: "test" } as const;

describe("auxiliary generation handlers", () => {
  beforeEach(() => {
    mocks.handleSimpleGeneration.mockReset();
  });

  it("clips long conversation content before title generation", async () => {
    mocks.handleSimpleGeneration.mockResolvedValueOnce("A short title");

    const longUserMessage =
      "u".repeat(API_INPUT_LIMITS.maxAuxiliaryPromptContextChars + 1) +
      "USER_TAIL";
    const longModelMessage =
      "m".repeat(API_INPUT_LIMITS.maxAuxiliaryPromptContextChars + 1) +
      "MODEL_TAIL";

    await generateTitle(provider, "gemini-test", [
      {
        id: "user_1",
        role: "user",
        content: longUserMessage,
        timestamp: 0,
      },
      {
        id: "model_1",
        role: "model",
        content: longModelMessage,
        timestamp: 0,
      },
    ]);

    const prompt = mocks.handleSimpleGeneration.mock.calls[0]?.[2] as string;
    expect(prompt).not.toContain("USER_TAIL");
    expect(prompt).not.toContain("MODEL_TAIL");
  });

  it("normalizes generated title output and fallback titles", async () => {
    mocks.handleSimpleGeneration
      .mockResolvedValueOnce('```text\n- "Clean title"\n```')
      .mockRejectedValueOnce(new Error("upstream failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const history: Message[] = [
      {
        id: "user_1",
        role: "user",
        content: "1. Fallback title\nwith details",
        timestamp: 0,
      },
    ];

    await expect(
      generateTitle(provider, "gemini-test", [...history]),
    ).resolves.toBe("Clean title");
    await expect(
      generateTitle(provider, "gemini-test", [...history]),
    ).resolves.toBe("Fallback title");

    errorSpy.mockRestore();
  });

  it("clips long related-question and RAG query prompts", async () => {
    mocks.handleSimpleGeneration
      .mockResolvedValueOnce('["Follow up?"]')
      .mockResolvedValueOnce("query one\nquery two");

    const longText =
      "x".repeat(API_INPUT_LIMITS.maxAuxiliaryPromptContextChars + 1) +
      "TEXT_TAIL";

    await generateRelatedQuestions(provider, "gemini-test", [
      {
        id: "user_1",
        role: "user",
        content: longText,
        timestamp: 0,
      },
      {
        id: "model_1",
        role: "model",
        content: longText,
        timestamp: 0,
      },
    ]);
    await generateRAGQueries(provider, "gemini-test", longText);

    const relatedPrompt = mocks.handleSimpleGeneration.mock
      .calls[0]?.[2] as string;
    const ragPrompt = mocks.handleSimpleGeneration.mock.calls[1]?.[2] as string;

    expect(relatedPrompt).not.toContain("TEXT_TAIL");
    expect(ragPrompt).not.toContain("TEXT_TAIL");
  });

  it("normalizes related-question JSON output consistently", async () => {
    mocks.handleSimpleGeneration.mockResolvedValueOnce(
      JSON.stringify([
        "1. Follow up?",
        "follow up?",
        "",
        "x".repeat(AUXILIARY_OUTPUT_LIMITS.maxRelatedQuestionChars + 20),
        "Another question?",
        "Extra question?",
        "Ignored question?",
      ]),
    );

    const questions = await generateRelatedQuestions(provider, "gemini-test", [
      {
        id: "user_1",
        role: "user",
        content: "hello",
        timestamp: 0,
      },
      {
        id: "model_1",
        role: "model",
        content: "world",
        timestamp: 0,
      },
    ]);

    expect(questions).toHaveLength(5);
    expect(questions[0]).toBe("Follow up?");
    expect(questions[1]).toHaveLength(
      AUXILIARY_OUTPUT_LIMITS.maxRelatedQuestionChars,
    );
    expect(new Set(questions.map((q) => q.toLowerCase())).size).toBe(
      questions.length,
    );
  });

  it("normalizes line-based RAG query output", async () => {
    mocks.handleSimpleGeneration.mockResolvedValueOnce(
      [
        "1. apples",
        "- Apples",
        `2) ${"q".repeat(AUXILIARY_OUTPUT_LIMITS.maxRagQueryChars + 20)}`,
        "bananas",
        "ignored",
      ].join("\n"),
    );

    const queries = await generateRAGQueries(provider, "gemini-test", "fruit");

    expect(queries).toHaveLength(AUXILIARY_OUTPUT_LIMITS.maxRagQueries);
    expect(queries[0]).toBe("apples");
    expect(queries[1]).toHaveLength(AUXILIARY_OUTPUT_LIMITS.maxRagQueryChars);
    expect(queries[2]).toBe("bananas");
  });
});
