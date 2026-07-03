import { getSafeMarkdownImageSrc } from "../security/clientUrl";
import type { PreviewImageInput } from "./imagePreview";

function readMarkdownImageUrl(content: string, start: number) {
  let index = start;
  if (content[index] === "<") {
    const end = content.indexOf(">", index + 1);
    if (end === -1) return null;
    return { rawUrl: content.slice(index + 1, end), end: end + 1 };
  }

  while (
    index < content.length &&
    content[index] !== ")" &&
    !/\s/.test(content[index])
  ) {
    index += 1;
  }

  if (index === start) return null;
  return { rawUrl: content.slice(start, index), end: index };
}

export function collectMarkdownImageGallery(
  content: string,
): PreviewImageInput[] {
  const images: PreviewImageInput[] = [];
  let index = 0;

  while (index < content.length) {
    const start = content.indexOf("![", index);
    if (start === -1) break;
    if (start > 0 && content[start - 1] === "\\") {
      index = start + 2;
      continue;
    }

    const altEnd = content.indexOf("]", start + 2);
    if (altEnd === -1 || content[altEnd + 1] !== "(") {
      index = start + 2;
      continue;
    }

    const url = readMarkdownImageUrl(content, altEnd + 2);
    if (!url) {
      index = altEnd + 2;
      continue;
    }

    const safeUrl = getSafeMarkdownImageSrc(url.rawUrl);
    if (safeUrl) {
      const alt = content.slice(start + 2, altEnd).trim() || undefined;
      images.push({
        url: safeUrl,
        alt,
        description: alt,
      });
    }

    index = url.end + 1;
  }

  return images;
}

export function getMarkdownImageGalleryIndex(
  gallery: PreviewImageInput[],
  previewSrc: string | null | undefined,
) {
  if (!previewSrc) return 0;
  const index = gallery.findIndex((image) => image.url === previewSrc);
  return index >= 0 ? index : 0;
}
