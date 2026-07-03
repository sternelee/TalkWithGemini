import { describe, expect, it } from "vitest";
import { HTML_PREVIEW_LIMITS } from "../config/limits";
import {
  createSandboxedHtmlPreviewSrcDoc,
  HTML_PREVIEW_CSP,
} from "../lib/utils/htmlPreview";

describe("HTML preview srcdoc hardening", () => {
  it("injects a restrictive CSP into existing head elements", () => {
    const srcDoc = createSandboxedHtmlPreviewSrcDoc(
      "<!doctype html><html><head><title>x</title></head><body><script>alert(1)</script></body></html>",
    );

    expect(srcDoc).toContain('http-equiv="Content-Security-Policy"');
    expect(srcDoc).toContain("default-src 'none'");
    expect(srcDoc.indexOf("Content-Security-Policy")).toBeLessThan(
      srcDoc.indexOf("<title>x</title>"),
    );
  });

  it("wraps HTML fragments with a CSP-bearing document shell", () => {
    const srcDoc = createSandboxedHtmlPreviewSrcDoc("<div>Hello</div>");

    expect(srcDoc.startsWith("<!doctype html>")).toBe(true);
    expect(srcDoc).toContain(`<body><div>Hello</div></body>`);
    expect(srcDoc).toContain(HTML_PREVIEW_CSP);
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
