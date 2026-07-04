import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("MessageItem composition", () => {
  it("keeps attachment/media rendering in a dedicated component", () => {
    const messageItem = readFileSync(
      resolve(process.cwd(), "src/components/chat/MessageItem.tsx"),
      "utf8",
    );
    const attachmentView = readFileSync(
      resolve(process.cwd(), "src/components/chat/MessageAttachmentView.tsx"),
      "utf8",
    );

    expect(messageItem).toContain("MessageAttachmentView");
    expect(messageItem).toContain(
      "const skillInvocations = message.skillInvocations || []",
    );
    expect(messageItem).toContain("portal");
    expect(messageItem).toContain("AddToKnowledgeModal");
    expect(messageItem).toContain("handleAddToKnowledge");
    expect(messageItem).toContain("canEditUserMessage");
    expect(messageItem).toContain("UserMessageEditor");
    expect(messageItem).toContain("PencilSparkles");
    expect(messageItem).toContain('t("polishUserMessageShort")');
    expect(messageItem).not.toContain("text-amber-500");
    expect(messageItem).not.toContain("hover:bg-amber-50");
    expect(messageItem).not.toContain("dark:text-amber-300");
    expect(messageItem).not.toContain("PencilSparklesIcon");
    expect(messageItem).not.toContain("const AttachmentView");
    expect(messageItem).not.toContain("activeSkillIds");
    expect(messageItem).not.toContain("onBranch");
    expect(messageItem).not.toContain("<Split");
    expect(attachmentView).toContain("AudioPlayer");
    expect(attachmentView).toContain("resolveObjectUrlWithLifecycle");
  });
});
