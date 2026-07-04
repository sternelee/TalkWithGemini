import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function countOccurrences(source: string, needle: string) {
  return source.split(needle).length - 1;
}

describe("skill invocation wiring", () => {
  it("passes skills context through every ChatApp response generation path", () => {
    const chatApp = readFileSync(
      resolve(process.cwd(), "src/components/app/ChatApp.tsx"),
      "utf8",
    );

    const streamCallCount = countOccurrences(chatApp, "streamChatResponse(");

    expect(streamCallCount).toBeGreaterThan(0);
    expect(countOccurrences(chatApp, "resolveSkillsForMessage({")).toBe(
      streamCallCount,
    );
    expect(countOccurrences(chatApp, "skillResolution.context")).toBe(
      streamCallCount,
    );
  });
});
