import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { boundHistoryForRequest } from "../lib/chat/requestContextBudget";
import type { Message } from "../types";

const message = (
  id: string,
  role: Message["role"],
  content: string,
): Message => ({ id, role, content, timestamp: 1 });

describe("complete request context budget", () => {
  it("keeps the latest complete turn and trims oldest history first", () => {
    const history = [
      message("old-user", "user", "o".repeat(3_000)),
      message("old-model", "model", "o".repeat(3_000)),
      message("new-user", "user", "latest question"),
      message("new-model", "model", "latest answer"),
    ];

    const bounded = boundHistoryForRequest(history, {
      newMessage: "current input",
      attachments: [],
      modelInputTokenLimit: 1_200,
      reservedOutputTokens: 200,
    });

    expect(bounded.map((item) => item.id)).toEqual(["new-user", "new-model"]);
  });

  it("budgets historical attachments and keeps an explicit omission marker", () => {
    const bounded = boundHistoryForRequest(
      [
        {
          ...message("user", "user", "See old file"),
          attachments: [
            {
              id: "large",
              fileName: "large.txt",
              mimeType: "text/plain",
              data: "x".repeat(5_000),
            },
          ],
        },
        message("model", "model", "Old answer"),
      ],
      {
        newMessage: "current input",
        attachments: [],
        modelInputTokenLimit: 1_200,
        reservedOutputTokens: 200,
      },
    );

    expect(bounded[0].attachments).toBeUndefined();
    expect(bounded[0].content).toContain("Historical attachment omitted");
  });

  it("truncates tool results while retaining name and argument summary", () => {
    const bounded = boundHistoryForRequest(
      [
        message("user", "user", "Run lookup"),
        {
          ...message("model", "model", "Lookup complete"),
          toolCalls: [
            {
              id: "tool-1",
              name: "lookup_records",
              args: { query: "important" },
              status: "success",
              result: "r".repeat(5_000),
            },
          ],
        },
      ],
      {
        newMessage: "current input",
        attachments: [],
        modelInputTokenLimit: 1_200,
        reservedOutputTokens: 200,
      },
    );

    const result = String(bounded[1].toolCalls?.[0]?.result);
    expect(result).toContain("Tool result truncated");
    expect(result).toContain("lookup_records");
    expect(result).toContain("important");
    expect(result.length).toBeLessThan(5_000);
  });

  it("applies the complete budget before every chat request round", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/services/api/chatService.ts"),
      "utf8",
    );

    expect(source).toContain("boundHistoryForRequest(requestHistory");
    expect(source).toContain("history: boundedRequestHistory");
    expect(source).toContain("selectedModelMetadata?.limit?.context");
  });

  it("rejects fixed request inputs that exceed the model context", () => {
    expect(() =>
      boundHistoryForRequest([], {
        newMessage: "x".repeat(4_001),
        attachments: [],
        systemInstruction: "system",
        tools: [],
        modelInputTokenLimit: 1_200,
        reservedOutputTokens: 200,
      }),
    ).toThrow(/exceed this model's input limit/i);
  });

  it("omits older tool calls instead of growing past a zero tool budget", () => {
    const bounded = boundHistoryForRequest(
      [
        message("user", "user", "Run tools"),
        {
          ...message("model", "model", "Done"),
          toolCalls: Array.from({ length: 20 }, (_, index) => ({
            id: `tool-${index}`,
            name: `tool_${index}`,
            args: { query: "q".repeat(1_000) },
            status: "success" as const,
            result: "r".repeat(1_000),
          })),
        },
      ],
      {
        newMessage: "current",
        attachments: [],
        modelInputTokenLimit: 1_200,
        reservedOutputTokens: 200,
      },
    );

    expect(JSON.stringify(bounded).length).toBeLessThan(4_000);
    expect(bounded.at(-1)?.content).toContain("tool calls omitted");
  });
});
