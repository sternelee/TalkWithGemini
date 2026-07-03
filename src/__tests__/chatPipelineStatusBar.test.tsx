import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ChatPipelineStatusBar", () => {
  it("is not rendered above the message input", () => {
    const chatApp = readFileSync(
      resolve(process.cwd(), "src/components/app/ChatApp.tsx"),
      "utf8",
    );

    expect(chatApp).not.toContain("ChatPipelineStatusBar");
    expect(chatApp).not.toContain("shouldShowPipelineStatus");
    expect(chatApp).not.toContain("pipelineStatuses");
  });
});
