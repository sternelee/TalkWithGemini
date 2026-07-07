import { describe, expect, it } from "vitest";
import { ATTACHMENT_LIMITS, formatBytes } from "../config/limits";
import {
  getWorkspaceFileSelectionMessage,
  selectWorkspaceFilesForUpload,
} from "../lib/utils/workspaceFiles";

describe("workspace file upload selection", () => {
  it("accepts files within count and size limits", () => {
    const result = selectWorkspaceFilesForUpload(0, [
      { name: "brief.md", size: 1024 },
      { name: "notes.txt", size: 2048 },
    ]);

    expect(result.accepted.map((file) => file.name)).toEqual([
      "brief.md",
      "notes.txt",
    ]);
    expect(result.rejectedByCount).toHaveLength(0);
    expect(result.rejectedBySize).toHaveLength(0);
  });

  it("rejects oversized files before accepting", () => {
    const result = selectWorkspaceFilesForUpload(0, [
      {
        name: "huge.pdf",
        size: ATTACHMENT_LIMITS.maxFileBytes + 1,
      },
      { name: "ok.txt", size: 1024 },
    ]);

    expect(result.accepted.map((file) => file.name)).toEqual(["ok.txt"]);
    expect(result.rejectedBySize.map((file) => file.name)).toEqual([
      "huge.pdf",
    ]);
  });

  it("rejects files past the workspace preset count limit", () => {
    const result = selectWorkspaceFilesForUpload(
      ATTACHMENT_LIMITS.maxCount - 1,
      [
        { name: "one.txt", size: 1024 },
        { name: "two.txt", size: 1024 },
      ],
    );

    expect(result.accepted.map((file) => file.name)).toEqual(["one.txt"]);
    expect(result.rejectedByCount.map((file) => file.name)).toEqual([
      "two.txt",
    ]);
  });

  it("summarizes rejected files for UI feedback", () => {
    const message = getWorkspaceFileSelectionMessage({
      rejectedByCount: [{ name: "extra.txt", size: 10 }],
      rejectedBySize: [
        { name: "huge.pdf", size: ATTACHMENT_LIMITS.maxFileBytes + 1 },
      ],
    });

    expect(message).toMatch(/limited to 20/);
    expect(message).toContain(
      `${formatBytes(ATTACHMENT_LIMITS.maxFileBytes)} or smaller`,
    );
  });
});
