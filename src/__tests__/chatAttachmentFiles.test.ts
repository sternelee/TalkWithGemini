import { describe, expect, it } from "vitest";
import { ATTACHMENT_LIMITS } from "../config/limits";
import {
  getChatAttachmentFileSelectionMessage,
  selectChatAttachmentFiles,
} from "../lib/utils/chatAttachmentFiles";

describe("chat attachment file selection", () => {
  it("rejects oversized files before FileReader work begins", () => {
    const selection = selectChatAttachmentFiles(0, [
      { name: "small.txt", size: 100 },
      { name: "huge.txt", size: ATTACHMENT_LIMITS.maxFileBytes + 1 },
    ]);

    expect(selection.accepted.map((file) => file.name)).toEqual(["small.txt"]);
    expect(selection.rejectedBySize.map((file) => file.name)).toEqual([
      "huge.txt",
    ]);
  });

  it("rejects files that would exceed the attachment count limit", () => {
    const selection = selectChatAttachmentFiles(
      ATTACHMENT_LIMITS.maxCount - 1,
      [
        { name: "accepted.txt", size: 1 },
        { name: "extra.txt", size: 1 },
      ],
    );

    expect(selection.accepted.map((file) => file.name)).toEqual([
      "accepted.txt",
    ]);
    expect(selection.rejectedByCount.map((file) => file.name)).toEqual([
      "extra.txt",
    ]);
  });

  it("describes rejected files with user-facing messages", () => {
    const message = getChatAttachmentFileSelectionMessage({
      rejectedByCount: [{ name: "extra.txt", size: 1 }],
      rejectedBySize: [
        { name: "huge-a.txt", size: ATTACHMENT_LIMITS.maxFileBytes + 1 },
        { name: "huge-b.txt", size: ATTACHMENT_LIMITS.maxFileBytes + 2 },
      ],
    });

    expect(message).toContain("Attachment limit reached");
    expect(message).toContain("Skipped 2 file(s)");
  });
});
