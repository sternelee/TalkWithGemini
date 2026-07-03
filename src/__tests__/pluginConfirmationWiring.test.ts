import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("plugin confirmation UI wiring", () => {
  it("does not wire runtime tool confirmation into ChatApp streaming calls", () => {
    const chatApp = readFileSync(
      resolve(process.cwd(), "src/components/app/ChatApp.tsx"),
      "utf8",
    );

    expect(chatApp).not.toContain("pendingToolConfirmation");
    expect(chatApp).not.toContain("confirmToolCall");
    expect(chatApp).not.toContain("pluginConfirmTitle");
    expect(chatApp).toContain("streamChatResponse(");
  });
});
