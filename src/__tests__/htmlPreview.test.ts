import { describe, expect, it } from "vitest";
import { HTML_PREVIEW_LIMITS } from "../config/limits";
import { createSandboxedHtmlPreviewSrcDoc } from "../lib/utils/htmlPreview";

describe("HTML preview srcdoc", () => {
  it("preserves scripts without injecting a restrictive CSP", () => {
    const srcDoc = createSandboxedHtmlPreviewSrcDoc(
      "<!doctype html><html><head><title>x</title></head><body><script>window.previewRan=true</script></body></html>",
    );

    expect(srcDoc).toContain("<script>window.previewRan=true</script>");
    expect(srcDoc).toContain("installPreviewStorage");
    expect(srcDoc).not.toContain("Content-Security-Policy");
    expect(srcDoc).not.toContain("script-src 'none'");
    expect(srcDoc.indexOf("installPreviewStorage")).toBeLessThan(
      srcDoc.indexOf("<title>x</title>"),
    );
  });

  it("wraps HTML fragments without adding a CSP-bearing document shell", () => {
    const srcDoc = createSandboxedHtmlPreviewSrcDoc("<div>Hello</div>");

    expect(srcDoc.startsWith("<!doctype html>")).toBe(true);
    expect(srcDoc).toContain("installPreviewStorage");
    expect(srcDoc).toContain(`<body><div>Hello</div></body>`);
    expect(srcDoc).not.toContain("Content-Security-Policy");
  });

  it("caps large previews and adds a visible truncation notice", () => {
    const srcDoc = createSandboxedHtmlPreviewSrcDoc(
      `<div>${"x".repeat(HTML_PREVIEW_LIMITS.maxSrcDocChars + 100)}</div>`,
    );

    expect(srcDoc.length).toBeLessThanOrEqual(
      HTML_PREVIEW_LIMITS.maxSrcDocChars,
    );
    expect(srcDoc).toContain("Preview truncated");
  });
});
