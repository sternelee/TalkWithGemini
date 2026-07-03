import { describe, expect, it } from "vitest";
import {
  getSafeDisplayImageSrc,
  getSafeExternalHref,
  getSafeFaviconProxyUrl,
  getSafeMarkdownImageSrc,
  getSafeWebHref,
} from "../lib/security/clientUrl";
import { CLIENT_URL_LIMITS } from "../config/limits";

describe("client URL safety helpers", () => {
  it("allows ordinary external links and blocks active content URLs", () => {
    expect(getSafeExternalHref("https://example.com/a?q=1")).toBe(
      "https://example.com/a?q=1",
    );
    expect(getSafeExternalHref("mailto:user@example.com")).toBe(
      "mailto:user@example.com",
    );
    expect(getSafeExternalHref("javascript:alert(1)")).toBeNull();
    expect(
      getSafeExternalHref("data:text/html;base64,PGgxPkJvb208L2gxPg=="),
    ).toBeNull();
  });

  it("blocks links to local or private literal hosts", () => {
    expect(getSafeExternalHref("https://localhost/admin")).toBeNull();
    expect(getSafeExternalHref("https://192.168.1.2/admin")).toBeNull();
  });

  it("allows only safe web URLs for metadata links", () => {
    expect(getSafeWebHref("https://example.com/docs")).toBe(
      "https://example.com/docs",
    );
    expect(getSafeWebHref("mailto:user@example.com")).toBeNull();
    expect(getSafeWebHref("tel:+123456789")).toBeNull();
    expect(getSafeWebHref("https://localhost/docs")).toBeNull();
  });

  it("creates favicon proxy URLs only from safe public web URLs", () => {
    expect(getSafeFaviconProxyUrl("https://example.com/docs")).toBe(
      "https://serveproxy.com/?url=https%3A%2F%2Fwww.google.com%2Fs2%2Ffavicons%3Fsz%3D64%26domain%3Dexample.com",
    );
    expect(getSafeFaviconProxyUrl("#")).toBeNull();
    expect(getSafeFaviconProxyUrl("mailto:user@example.com")).toBeNull();
    expect(getSafeFaviconProxyUrl("https://127.0.0.1/admin")).toBeNull();
  });

  it("allows safe markdown image sources only", () => {
    expect(getSafeMarkdownImageSrc("https://example.com/image.png")).toBe(
      "https://example.com/image.png",
    );
    expect(getSafeMarkdownImageSrc("data:image/png;base64,aGVsbG8=")).toBe(
      "data:image/png;base64,aGVsbG8=",
    );
    expect(
      getSafeMarkdownImageSrc(
        "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+",
      ),
    ).toBeNull();
    expect(getSafeMarkdownImageSrc("http://example.com/image.png")).toBeNull();
    expect(getSafeMarkdownImageSrc("https://127.0.0.1/image.png")).toBeNull();
  });

  it("blocks oversized inline markdown image data URLs", () => {
    const oversizedDataUrl = `data:image/png;base64,${"a".repeat(
      CLIENT_URL_LIMITS.maxInlineImageDataUrlChars,
    )}`;

    expect(getSafeMarkdownImageSrc(oversizedDataUrl)).toBeNull();
  });

  it("filters display image sources before browser rendering", () => {
    expect(getSafeDisplayImageSrc("/avatars/default.png")).toBe(
      "/avatars/default.png",
    );
    expect(getSafeDisplayImageSrc("https://example.com/logo.webp")).toBe(
      "https://example.com/logo.webp",
    );
    expect(getSafeDisplayImageSrc("//example.com/logo.webp")).toBeNull();
    expect(getSafeDisplayImageSrc("http://example.com/logo.webp")).toBeNull();
    expect(getSafeDisplayImageSrc("https://10.0.0.5/logo.webp")).toBeNull();
    expect(
      getSafeDisplayImageSrc(
        "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+",
      ),
    ).toBeNull();
  });

  it("blocks oversized inline display image data URLs", () => {
    const oversizedDataUrl = `data:image/webp;base64,${"a".repeat(
      CLIENT_URL_LIMITS.maxInlineImageDataUrlChars,
    )}`;

    expect(getSafeDisplayImageSrc(oversizedDataUrl)).toBeNull();
  });
});
