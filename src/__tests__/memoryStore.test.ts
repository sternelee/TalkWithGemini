import { beforeEach, describe, expect, it } from "vitest";
import { useMemoryStore } from "../store/core/memoryStore";

describe("memory store", () => {
  beforeEach(() => {
    useMemoryStore.setState(useMemoryStore.getInitialState(), true);
  });

  it("defaults memory automation on with 100 to 50 dream limits", () => {
    expect(useMemoryStore.getState().settings).toMatchObject({
      enabled: true,
      searchEnabled: true,
      autoRecordEnabled: true,
      dreamEnabled: true,
      triggerCount: 100,
      targetCount: 50,
    });
  });

  it("adds, searches, updates, marks, and removes memories", () => {
    const saved = useMemoryStore.getState().addMemory({
      type: "project",
      content: "Use Mineru for document parser defaults.",
      tags: ["mineru", "docs"],
      source: "manual",
      importance: 5,
    });

    expect(saved?.content).toBe("Use Mineru for document parser defaults.");
    expect(
      useMemoryStore
        .getState()
        .searchMemories("document parser", 1)
        .map((memory) => memory.id),
    ).toEqual([saved?.id]);

    useMemoryStore.getState().updateMemory(saved!.id, {
      content: "Use Mineru for document parsing defaults.",
      tags: ["mineru"],
    });
    expect(useMemoryStore.getState().memories[0].content).toContain(
      "document parsing",
    );

    useMemoryStore.getState().markMemoriesUsed([saved!.id]);
    expect(useMemoryStore.getState().memories[0].lastUsedAt).toBeGreaterThan(0);

    useMemoryStore.getState().removeMemory(saved!.id);
    expect(useMemoryStore.getState().memories).toEqual([]);
  });
});
