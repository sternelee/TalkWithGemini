import { describe, expect, it } from "vitest";
import { DOWNLOAD_LIMITS } from "../config/limits";
import { sanitizeDownloadFilename } from "../lib/utils/filename";

describe("download filename sanitization", () => {
  it("removes path separators, reserved characters, and control characters", () => {
    expect(
      sanitizeDownloadFilename("../bad/path:name\u0000?.json", "fallback.json"),
    ).toBe("bad_path_name_.json");
  });

  it("falls back for blank and reserved device names", () => {
    expect(sanitizeDownloadFilename("   ", "chat.json")).toBe("chat.json");
    expect(sanitizeDownloadFilename("CON.txt", "download.txt")).toBe(
      "download.txt",
    );
  });

  it("caps long names while preserving the extension", () => {
    const filename = sanitizeDownloadFilename(
      `${"a".repeat(DOWNLOAD_LIMITS.maxFileNameChars + 20)}.md`,
    );

    expect(filename).toHaveLength(DOWNLOAD_LIMITS.maxFileNameChars);
    expect(filename.endsWith(".md")).toBe(true);
  });
});
