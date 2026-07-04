import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("MessageInput composition", () => {
  it("keeps attachment tray presentation outside the composer container", () => {
    const messageInput = readFileSync(
      resolve(process.cwd(), "src/components/chat/MessageInput.tsx"),
      "utf8",
    );
    const attachmentTray = readFileSync(
      resolve(
        process.cwd(),
        "src/components/chat/MessageInputAttachmentTray.tsx",
      ),
      "utf8",
    );

    expect(messageInput).toContain("MessageInputAttachmentTray");
    expect(messageInput).toContain("isKnowledgeAttachment");
    expect(messageInput).toContain("aria-pressed={hasKnowledgeAttachments}");
    expect(messageInput).toContain("LayoutDashboard");
    expect(messageInput).toContain("system.enableHtmlVisualPrompt");
    expect(messageInput).toContain("updateSystemSettings");
    expect(messageInput).toContain(
      "aria-pressed={system.enableHtmlVisualPrompt}",
    );
    expect(messageInput).toContain("text-brand hover:bg-brand-soft");
    expect(messageInput).toContain("PencilSparkles");
    expect(messageInput).not.toContain("PencilSparklesIcon");
    expect(messageInput).toContain("installedSkills");
    expect(messageInput).toContain("updateSessionConfig");
    expect(messageInput).toContain("normalizeSkillIdRefs");
    expect(messageInput).not.toContain("toggleSkillActive");
    expect(messageInput).not.toContain("formatSkillCategory");
    expect(messageInput).not.toContain("autoSelectSkills");
    expect(messageInput).not.toContain("manageSkills");
    expect(messageInput).not.toContain("setSkillAutoSelect");
    expect(messageInput).not.toContain("border border-green-500 bg-green-500");
    expect(messageInput).toContain("border border-blue-500 bg-blue-500");
    expect(messageInput).not.toContain("text-green-500 dark:text-green-400");
    expect(messageInput).toContain("text-blue-500 dark:text-blue-400");
    expect(messageInput).toContain("handlePolishInput");
    expect(messageInput).toContain("createChatDocumentAttachment");
    expect(messageInput).toContain("isParsingAttachments");
    expect(messageInput).toContain("failedToParseDocument");
    expect(messageInput).toContain(".pdf");
    expect(messageInput).not.toContain("reader.readAsText");
    expect(messageInput).not.toContain(
      "text-amber-500 hover:bg-amber-50 hover:text-amber-600",
    );
    expect(messageInput).not.toContain(
      "dark:text-amber-300 dark:hover:bg-amber-900/20",
    );
    expect(messageInput).not.toContain('<span>{t("knowledgeBase")}</span>');
    expect(messageInput).not.toContain("const AttachmentPreviewCard");
    expect(messageInput.indexOf("{/* Reasoning Button")).toBeLessThan(
      messageInput.indexOf("{/* Search Button */}"),
    );
    expect(messageInput.indexOf("{/* Search Button */}")).toBeLessThan(
      messageInput.indexOf("{/* HTML Visual Prompt Button */}"),
    );
    expect(
      messageInput.indexOf("{/* HTML Visual Prompt Button */}"),
    ).toBeLessThan(messageInput.indexOf("{/* Model Selector */}"));
    expect(messageInput.indexOf("{/* Model Selector */}")).toBeLessThan(
      messageInput.indexOf("{/* Text Polish Button */}"),
    );
    expect(messageInput.indexOf("{/* Text Polish Button */}")).toBeLessThan(
      messageInput.indexOf("{/* Actions */}"),
    );
    expect(attachmentTray).toContain("AttachmentPreviewCard");
    expect(attachmentTray).toContain("resolveObjectUrlWithLifecycle");
    expect(attachmentTray).toContain("markdown-file-card");
    expect(attachmentTray).toContain("markdown-file-card-icon");
    expect(attachmentTray).toContain("markdown-file-card-action");
    expect(attachmentTray).not.toContain("h-16 w-16");
  });
});
