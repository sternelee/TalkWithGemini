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
    expect(messageInput).not.toContain("LayoutDashboard");
    expect(messageInput).not.toContain("system.enableHtmlVisualPrompt");
    expect(messageInput).not.toContain("updateSystemSettings");
    expect(messageInput).not.toContain("htmlVisualPromptEnabled");
    expect(messageInput).not.toContain("HTML Visual Prompt Button");
    expect(messageInput).toContain("PencilSparkles");
    expect(messageInput).not.toContain("PencilSparklesIcon");
    expect(messageInput).not.toContain("showMobileTools");
    expect(messageInput).not.toContain("mobileActiveToolCount");
    expect(messageInput).not.toContain("mobileToolsAriaLabel");
    expect(messageInput).not.toContain("MoreHorizontal");
    expect(messageInput).not.toContain("Mobile Tools Menu");
    expect(messageInput).not.toContain("handleAttachClick");
    expect(messageInput).toContain("glass-shell relative flex w-full flex-col");
    expect(messageInput).toContain("variant?: MessageInputVariant");
    expect(messageInput).toContain('variant = "default"');
    expect(messageInput).toContain("isHeroVariant");
    expect(messageInput).toContain('"min-h-[5em]"');
    expect(messageInput).toContain('"min-h-[2em]"');
    expect(messageInput).toContain('isHeroVariant ? "mb-0 md:mb-18" : ""');
    expect(messageInput).not.toContain('"min-h-[6em]"');
    expect(messageInput).not.toContain("min-h-[4em]");
    expect(messageInput).not.toContain("min-h-[3em]");
    expect(messageInput).not.toContain("min-h-28");
    expect(messageInput).not.toContain("md:min-h-32");
    expect(messageInput).not.toContain("min-h-12");
    expect(messageInput).toContain("installedSkills");
    expect(messageInput).toContain("updateSessionConfig");
    expect(messageInput).toContain("normalizeSkillIdRefs");
    expect(messageInput).toContain("pluginSourceGroups");
    expect(messageInput).toContain('plugin.source === "mcp"');
    expect(messageInput).toContain('t("mcpServers")');
    expect(messageInput).not.toContain("toggleSkillActive");
    expect(messageInput).not.toContain("formatSkillCategory");
    expect(messageInput).not.toContain("autoSelectSkills");
    expect(messageInput).not.toContain("manageSkills");
    expect(messageInput).not.toContain("setSkillAutoSelect");
    expect(messageInput).not.toContain("border border-green-500 bg-green-500");
    expect(messageInput).toContain("border border-cyan-500 bg-cyan-500");
    expect(messageInput).not.toContain("border border-blue-500 bg-blue-500");
    expect(messageInput).not.toContain("text-green-500 dark:text-green-400");
    expect(messageInput).toContain("text-blue-500 dark:text-blue-400");
    expect(messageInput).toContain(
      "text-cyan-500 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20",
    );
    expect(messageInput).toContain(
      "text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20",
    );
    expect(messageInput).toContain("handlePolishInput");
    expect(messageInput).toContain("reasoningOptions");
    expect(messageInput).toContain("reasoningMode");
    expect(messageInput).toContain("DropdownMenuRadioGroup");
    expect(messageInput).toContain('t("reasoningModeAuto")');
    expect(messageInput).toContain('t("reasoningModeHigh")');
    expect(messageInput).toContain("w-40 p-1.5 md:w-72");
    expect(messageInput).toContain(
      "h-auto min-h-8 rounded-md px-2 py-1.5 pr-8",
    );
    expect(messageInput).toContain("hover:bg-accent");
    expect(messageInput).toContain("data-[state=checked]:bg-accent");
    expect(messageInput).not.toContain(
      "data-[state=checked]:border-violet-300",
    );
    expect(messageInput).toContain("hidden text-[11px]");
    expect(messageInput).toContain("md:block");
    expect(messageInput).not.toContain(
      "setChatConfig({ useReasoning: !chatConfig.useReasoning })",
    );
    expect(messageInput).toContain("createChatDocumentAttachment");
    expect(messageInput).toContain("isParsingAttachments");
    expect(messageInput).toContain("isDragUploadActive");
    expect(messageInput).toContain("handleComposerDrop");
    expect(messageInput).toContain("handleComposerPaste");
    expect(messageInput).toContain("extractChatAttachmentFilesFromDrop");
    expect(messageInput).toContain("extractChatAttachmentFilesFromClipboard");
    expect(messageInput).toContain('t("dropFilesTitle")');
    expect(messageInput).toContain("failedToParseDocument");
    expect(messageInput).toContain(".pdf");
    expect(messageInput).not.toContain("reader.readAsText");
    expect(messageInput).not.toContain(
      "text-amber-500 hover:bg-amber-50 hover:text-amber-600",
    );
    expect(messageInput).not.toContain(
      "dark:text-amber-300 dark:hover:bg-amber-900/20",
    );
    expect(messageInput).toContain("<Library");
    expect(messageInput).toContain("text-purple-500 dark:text-purple-400");
    expect(messageInput).toContain('<span>{t("knowledgeBase")}</span>');
    expect(messageInput).toContain("open={showAttachMenu}");
    expect(messageInput).not.toContain("showAttachMenu && hasAttachmentMenu");
    expect(messageInput).toContain("textFallbackInputRef.current?.click()");
    expect(messageInput).not.toContain("const AttachmentPreviewCard");
    expect(messageInput.indexOf("{/* Reasoning Button")).toBeLessThan(
      messageInput.indexOf("{/* Search Button */}"),
    );
    expect(messageInput.indexOf("{/* Search Button */}")).toBeLessThan(
      messageInput.indexOf("{/* Model Selector */}"),
    );
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
