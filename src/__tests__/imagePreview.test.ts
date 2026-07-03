import { describe, expect, it } from "vitest";
import { IMAGE_PREVIEW_LIMITS } from "../config/limits";
import { normalizeImagePreviewState } from "../lib/utils/imagePreview";

describe("image preview normalization", () => {
  it("filters unsafe images and remaps the requested start index", () => {
    const preview = normalizeImagePreviewState(
      [
        { url: "http://127.0.0.1/private.png", description: "unsafe" },
        { url: "https://example.com/a.png", description: "A" },
        { url: "https://example.com/b.png", description: "B" },
      ],
      2,
    );

    expect(preview).toEqual({
      images: [
        { url: "https://example.com/a.png", alt: undefined, description: "A" },
        { url: "https://example.com/b.png", alt: undefined, description: "B" },
      ],
      currentIndex: 1,
    });
  });

  it("deduplicates images and maps duplicate start indexes to the kept image", () => {
    const preview = normalizeImagePreviewState(
      [
        { url: "https://example.com/a.png", description: "A" },
        { url: "https://example.com/a.png", description: "Duplicate" },
      ],
      1,
    );

    expect(preview?.images).toHaveLength(1);
    expect(preview?.currentIndex).toBe(0);
  });

  it("caps preview image count and trims display text", () => {
    const preview = normalizeImagePreviewState(
      Array.from(
        { length: IMAGE_PREVIEW_LIMITS.maxImages + 5 },
        (_, index) => ({
          url: `https://example.com/${index}.png`,
          alt: "a".repeat(IMAGE_PREVIEW_LIMITS.maxAltChars + 10),
          description: "d".repeat(
            IMAGE_PREVIEW_LIMITS.maxDescriptionChars + 10,
          ),
        }),
      ),
      IMAGE_PREVIEW_LIMITS.maxImages + 2,
    );

    expect(preview?.images).toHaveLength(IMAGE_PREVIEW_LIMITS.maxImages);
    expect(preview?.currentIndex).toBe(IMAGE_PREVIEW_LIMITS.maxImages - 1);
    expect(preview?.images[0]?.alt).toHaveLength(
      IMAGE_PREVIEW_LIMITS.maxAltChars,
    );
    expect(preview?.images[0]?.description).toHaveLength(
      IMAGE_PREVIEW_LIMITS.maxDescriptionChars,
    );
  });

  it("returns null when no safe image remains", () => {
    expect(
      normalizeImagePreviewState([{ url: "https://localhost/private.png" }]),
    ).toBeNull();
  });
});
