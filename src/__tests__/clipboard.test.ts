import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "../lib/utils/clipboard";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function createFallbackDocument(execResult: boolean) {
  const textarea = {
    value: "",
    style: {},
    setAttribute: vi.fn(),
    select: vi.fn(),
    setSelectionRange: vi.fn(),
    remove: vi.fn(),
  };
  const body = {
    appendChild: vi.fn(),
  };

  return {
    textarea,
    document: {
      body,
      createElement: vi.fn(() => textarea),
      execCommand: vi.fn(() => execResult),
    },
  };
}

describe("copyTextToClipboard", () => {
  it("uses navigator.clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyTextToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to a textarea copy when clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    const { document, textarea } = createFallbackDocument(true);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("document", document);

    await expect(copyTextToClipboard("fallback")).resolves.toBe(true);
    expect(document.createElement).toHaveBeenCalledWith("textarea");
    expect(textarea.value).toBe("fallback");
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(textarea.remove).toHaveBeenCalled();
  });

  it("returns false when no copy mechanism is available", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", undefined);

    await expect(copyTextToClipboard("hello")).resolves.toBe(false);
  });

  it("does not copy empty text", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    await expect(copyTextToClipboard("")).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});
