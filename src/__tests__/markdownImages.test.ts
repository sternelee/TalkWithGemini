import { describe, expect, it } from "vitest";
import {
  collectMarkdownImageGallery,
  getMarkdownImageGalleryIndex,
} from "../lib/utils/markdownImages";

describe("markdown image gallery extraction", () => {
  it("collects safe inline markdown images in message order", () => {
    expect(
      collectMarkdownImageGallery(
        [
          "Before",
          "![First image](https://example.com/first.png)",
          "Middle ![Second image](data:image/png;base64,aGVsbG8=)",
          "![Unsafe](http://127.0.0.1/private.png)",
        ].join("\n"),
      ),
    ).toEqual([
      {
        url: "https://example.com/first.png",
        alt: "First image",
        description: "First image",
      },
      {
        url: "data:image/png;base64,aGVsbG8=",
        alt: "Second image",
        description: "Second image",
      },
    ]);
  });

  it("ignores plain links and escaped image markers", () => {
    expect(
      collectMarkdownImageGallery(
        [
          "[not an image](https://example.com/link.png)",
          "\\![escaped](https://example.com/escaped.png)",
          "![Actual](https://example.com/actual.png)",
        ].join("\n"),
      ),
    ).toEqual([
      {
        url: "https://example.com/actual.png",
        alt: "Actual",
        description: "Actual",
      },
    ]);
  });

  it("maps a clicked markdown image URL to its current message gallery index", () => {
    const gallery = [
      { url: "https://example.com/first.png", alt: "First" },
      { url: "https://example.com/second.png", alt: "Second" },
    ];

    expect(
      getMarkdownImageGalleryIndex(gallery, "https://example.com/second.png"),
    ).toBe(1);
    expect(
      getMarkdownImageGalleryIndex(gallery, "https://example.com/missing.png"),
    ).toBe(0);
  });
});
