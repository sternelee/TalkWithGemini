import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en";
import zh from "../i18n/locales/zh";

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

  it("keeps the reasoning panel focused on expand and read controls", () => {
    const reasoningBlock = readFileSync(
      resolve(process.cwd(), "src/components/content/ReasoningBlock.tsx"),
      "utf8",
    );

    expect(reasoningBlock).toContain(
      "mb-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50/50",
    );
    expect(reasoningBlock).toContain(
      "w-full flex items-center gap-2 px-3 py-2 text-xs font-medium",
    );
    expect(reasoningBlock).toContain(
      "rounded bg-violet-100 p-1 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
    );
    expect(reasoningBlock).toContain("flex-1 text-left truncate");
    expect(reasoningBlock).toContain("bg-white/40 dark:bg-card/40");
    expect(reasoningBlock).not.toContain("mr-2 rounded p-1");
    expect(reasoningBlock).not.toContain("Languages");
    expect(reasoningBlock).not.toContain("Copy");
    expect(reasoningBlock).not.toContain("Undo2");
    expect(reasoningBlock).not.toContain("copyTextToClipboard");
    expect(reasoningBlock).not.toContain("createReasoningTranslationPrompt");
    expect(reasoningBlock).not.toContain("streamGenerateContent");
  });

  it("offers model message downloads as Markdown, PDF, or image", () => {
    const messageItem = readFileSync(
      resolve(process.cwd(), "src/components/chat/MessageItem.tsx"),
      "utf8",
    );
    const globals = readFileSync(
      resolve(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(messageItem).toContain("handleDownloadMarkdown");
    expect(messageItem).toContain("handleDownloadPdf");
    expect(messageItem).toContain("handleDownloadImage");
    expect(messageItem).toContain("message-pdf-print-root");
    expect(messageItem).toContain("message-image-export-root");
    expect(messageItem).toContain("window.print");
    expect(messageItem).toContain("afterprint");
    expect(messageItem).toContain("toPng");
    expect(messageItem).toContain("html-to-image");
    expect(messageItem).toContain("backgroundColor");
    expect(messageItem).toContain("getImageExportBackgroundColor");
    expect(messageItem).toContain("getMessageImageExportWidth");
    expect(messageItem).toContain("visibleMessageContentRef");
    expect(messageItem).toContain("width: imageExportJob.width");
    expect(messageItem).toContain("canvasWidth: imageExportJob.width");
    expect(messageItem).toContain("message-image-export-canvas");
    expect(messageItem).toContain(".markdown-diagram-header");
    expect(messageItem).toContain("forceExpandCodeBlocks");
    expect(messageItem).toContain("proxyMessageExportImages");
    expect(messageItem).toContain("https://serveproxy.com/?url=");
    expect(messageItem).toContain("encodeURIComponent");
    expect(messageItem).toContain("waitForMessageExportImages");
    expect(messageItem).toContain("DropdownMenuSub");
    expect(messageItem).toContain("DropdownMenuSubTrigger");
    expect(messageItem).toContain("DropdownMenuSubContent");
    expect(messageItem).toContain("Signature");
    expect(messageItem).toContain("FileImage");
    expect(messageItem).toContain('forcedTheme="light"');
    expect(messageItem).toContain('t("downloadMarkdown")');
    expect(messageItem).toContain('t("downloadPdf")');
    expect(messageItem).toContain('t("downloadImage")');
    expect(messageItem).toContain('t("downloadFormat")');
    expect(messageItem).toContain("handleDownloadPdf");
    expect(messageItem).toContain("md:hidden");

    const markdownRenderer = readFileSync(
      resolve(
        process.cwd(),
        "src/components/content/MarkdownRendererClient.tsx",
      ),
      "utf8",
    );
    expect(markdownRenderer).toContain("forcedTheme?: DiagramTheme");
    expect(markdownRenderer).toContain("forcedTheme || resolvedTheme");
    expect(markdownRenderer).toContain("forceExpandCodeBlocks?: boolean");
    expect(markdownRenderer).toContain(
      "!forceExpandCodeBlocks && (system.enableCodeCollapse ?? true)",
    );
    expect(markdownRenderer).toContain(
      "forceExpandCodeBlocks={forceExpandCodeBlocks}",
    );

    expect(globals).toContain("@page");
    expect(globals).toContain("size: A4");
    expect(globals).toContain(".message-pdf-print-root");
    expect(globals).toContain(".markdown-codeblock-header");
    expect(globals).toContain(
      ".message-export-content-root .markdown-diagram-header",
    );
    expect(globals).toContain(
      ".message-pdf-print-root .markdown-diagram-header",
    );
    expect(globals).toContain("max-height: none !important");
    expect(globals).toContain(".markdown-codeblock-fade");
    expect(globals).toContain(".markdown-console");
    expect(globals).toContain(".message-image-export-root");
    expect(globals).toContain(".message-image-export-canvas");
    expect(globals).toContain("padding: 24px");
    expect(globals).toContain(".message-export-content-root");
    expect(globals).toContain(".message-export-content-root .markdown-body");
    expect(globals).toContain("box-sizing: border-box");
    expect(globals).not.toContain("width: min(820px");
    expect(packageJson.dependencies?.["html-to-image"]).toBeDefined();
    expect(en.Message.downloadMarkdown).toBe("Markdown");
    expect(en.Message.downloadPdf).toBe("PDF");
    expect(en.Message.downloadImage).toBe("Image");
    expect(en.Message.downloadFormat).toBe("Download format");
    expect(zh.Message.downloadMarkdown).toBe("Markdown");
    expect(zh.Message.downloadPdf).toBe("PDF");
    expect(zh.Message.downloadImage).toBe("图片");
    expect(zh.Message.downloadFormat).toBe("下载格式");
  });
});
