import { describe, expect, it } from "vitest";
import { getSourceBlockPresentation } from "../lib/search/sourceBlock";

describe("source block presentation", () => {
  it("renders safe image-only result blocks", () => {
    expect(
      getSourceBlockPresentation({
        sourceCount: 0,
        imageCount: 3,
      }),
    ).toMatchObject({
      shouldRender: true,
      hasSources: false,
      hasImages: true,
      label: "Images",
      remainingImagesCount: 0,
    });
  });

  it("hides empty non-searching result blocks", () => {
    expect(
      getSourceBlockPresentation({
        sourceCount: 0,
        imageCount: 0,
      }),
    ).toMatchObject({
      shouldRender: false,
      label: "Sources",
    });
  });

  it("labels mixed source/image blocks and counts remaining images", () => {
    expect(
      getSourceBlockPresentation({
        sourceCount: 2,
        imageCount: 7,
        visibleImagesCount: 4,
      }),
    ).toMatchObject({
      shouldRender: true,
      hasSources: true,
      hasImages: true,
      label: "Sources & Images",
      remainingImagesCount: 3,
    });
  });

  it("renders searching blocks even before results arrive", () => {
    expect(
      getSourceBlockPresentation({
        sourceCount: 0,
        imageCount: 0,
        isSearching: true,
      }),
    ).toMatchObject({
      shouldRender: true,
      label: "Searching...",
    });
  });
});
