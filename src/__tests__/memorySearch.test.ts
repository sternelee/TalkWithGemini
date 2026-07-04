import { describe, expect, it } from "vitest";
import {
  buildDirectMemoryPromptContext,
  normalizeMemoryRecord,
  parseMemoryRecordToolCall,
  searchMemoryRecords,
  shouldExposeMemorySearchTool,
} from "../lib/memory/entities";
import type { MemoryRecord } from "../lib/memory/types";

const records: MemoryRecord[] = [
  {
    id: "mem_project",
    type: "project",
    content: "For document parsing work, keep Mineru as the default parser.",
    createdAt: 100,
    updatedAt: 100,
    lastUsedAt: 0,
    importance: 4,
    tags: ["Mineru", "documents"],
    source: "manual",
  },
  {
    id: "mem_pref",
    type: "preference",
    content: "Use the pinned pnpm toolchain for this repository.",
    createdAt: 90,
    updatedAt: 90,
    lastUsedAt: 0,
    importance: 5,
    tags: ["pnpm"],
    source: "ai",
  },
  {
    id: "mem_voice",
    type: "fact",
    content: "Mimo voice requests use api.xiaomimimo.com.",
    createdAt: 80,
    updatedAt: 80,
    lastUsedAt: 0,
    importance: 3,
    tags: ["voice"],
    source: "ai",
  },
];

describe("memory records", () => {
  it("normalizes metadata and keeps user-facing content", () => {
    const record = normalizeMemoryRecord(
      {
        id: " custom ",
        type: "unknown",
        content: "  Always keep branch history intact.  ",
        createdAt: 0,
        updatedAt: 0,
        importance: 99,
        tags: [" Git ", "git", "", "history"],
        source: "manual",
      },
      500,
    );

    expect(record).toMatchObject({
      id: "custom",
      type: "fact",
      content: "Always keep branch history intact.",
      createdAt: 500,
      updatedAt: 500,
      importance: 5,
      tags: ["git", "history"],
      source: "manual",
    });
  });

  it("ranks local memory search by query relevance and importance", () => {
    expect(
      searchMemoryRecords(records, "Mineru document parser", 2).map(
        (record) => record.id,
      ),
    ).toEqual(["mem_project"]);
  });

  it("parses AI memory record tool calls and drops empty memories", () => {
    const parsed = parseMemoryRecordToolCall(
      {
        memories: [
          {
            type: "preference",
            content: "Use English-first docs unless bilingual output is asked.",
            importance: 4,
            tags: ["docs", "locale"],
          },
          { type: "fact", content: "   " },
        ],
      },
      { now: 700, source: "ai", sourceSessionId: "session-1" },
    );

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      type: "preference",
      content: "Use English-first docs unless bilingual output is asked.",
      importance: 4,
      tags: ["docs", "locale"],
      source: "ai",
      sourceSessionId: "session-1",
    });
  });

  it("builds bounded direct context from durable high-value memories", () => {
    const context = buildDirectMemoryPromptContext({
      memories: [
        ...records,
        {
          id: "mem_low",
          type: "fact",
          content: "A one-off note that should stay out of direct context.",
          createdAt: 70,
          updatedAt: 70,
          importance: 1,
          tags: ["transient"],
          source: "ai",
        },
      ],
      query: "Which parser should I use for documents?",
      alreadyInjectedMemoryIds: ["mem_pref"],
      maxChars: 500,
    });

    expect(context.injectedMemoryIds).toEqual(["mem_project"]);
    expect(context.text).toContain("<local-memory-context>");
    expect(context.text).toContain(
      "[project] For document parsing work, keep Mineru as the default parser.",
    );
    expect(context.text).not.toContain("Use the pinned pnpm toolchain");
    expect(context.text).not.toContain("one-off");
    expect(context.text.length).toBeLessThanOrEqual(500);
  });

  it("does not expose memory search for ordinary prompts", () => {
    expect(shouldExposeMemorySearchTool("Which parser should I use?")).toBe(
      false,
    );
  });

  it("exposes memory search for explicit memory or missing-context prompts", () => {
    expect(
      shouldExposeMemorySearchTool("你还记得我之前对文档解析工具的决定吗？"),
    ).toBe(true);
    expect(
      shouldExposeMemorySearchTool("Use the prior decision from earlier."),
    ).toBe(true);
  });
});
