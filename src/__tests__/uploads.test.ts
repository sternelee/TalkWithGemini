import { describe, expect, it } from "vitest";
import { getUploadBlobValidationError } from "../lib/api/uploads";

describe("upload validation", () => {
  it("rejects missing and non-blob upload values", () => {
    expect(
      getUploadBlobValidationError(null, {
        label: "Audio file",
        maxBytes: 1024,
      }),
    ).toBe("Audio file is required");

    expect(
      getUploadBlobValidationError("not a file", {
        label: "Audio file",
        maxBytes: 1024,
      }),
    ).toBe("Audio file is required");
  });

  it("rejects empty and oversized blobs", () => {
    expect(
      getUploadBlobValidationError(new Blob([]), {
        label: "Audio file",
        maxBytes: 1024,
      }),
    ).toBe("Audio file is empty");

    expect(
      getUploadBlobValidationError(new Blob(["x".repeat(1025)]), {
        label: "Audio file",
        maxBytes: 1024,
      }),
    ).toBe("Audio file is too large");
  });

  it("accepts non-empty blobs within the size limit", () => {
    expect(
      getUploadBlobValidationError(new Blob(["ok"]), {
        label: "Audio file",
        maxBytes: 1024,
      }),
    ).toBeNull();
  });

  it("validates document File uploads with the same blob limits", () => {
    expect(
      getUploadBlobValidationError(new File([], "empty.pdf"), {
        label: "Document file",
        maxBytes: 1024,
      }),
    ).toBe("Document file is empty");

    expect(
      getUploadBlobValidationError(new File(["content"], "doc.pdf"), {
        label: "Document file",
        maxBytes: 1024,
      }),
    ).toBeNull();
  });
});
