import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("MessageAttachmentView composition", () => {
  it("exposes readable document cards with localized open actions", () => {
    const attachmentView = readFileSync(
      resolve(process.cwd(), "src/components/chat/MessageAttachmentView.tsx"),
      "utf8",
    );
    const messageItem = readFileSync(
      resolve(process.cwd(), "src/components/chat/MessageItem.tsx"),
      "utf8",
    );
    const en = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/i18n/locales/en.json"), "utf8"),
    );
    const zh = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/i18n/locales/zh.json"), "utf8"),
    );

    expect(attachmentView).toContain("markdown-file-card");
    expect(attachmentView).toContain("isTextDocumentMimeType");
    expect(attachmentView).toContain("onDocumentClick");
    expect(attachmentView).toContain("openDocumentAttachmentAria");
    expect(attachmentView).not.toContain("markdown-file-type-badge");
    expect(attachmentView).not.toContain("isParsedMarkdown");
    expect(messageItem).toContain("decodeAttachmentText");
    expect(messageItem).toContain('readingMode === "attachment"');
    expect(messageItem).toContain("copyFileAria");
    expect(messageItem).toContain("markdown-file-type-badge");
    expect(en.Message.openDocumentAttachment).toBe("Open document");
    expect(en.Message.readingAttachment).toContain("{name}");
    expect(zh.Message.openDocumentAttachment).toBe("打开文档");
    expect(zh.Message.readingAttachment).toContain("{name}");
  });
});
