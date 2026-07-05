export interface SourceBlockPresentation {
  hasSources: boolean;
  hasImages: boolean;
  shouldRender: boolean;
  label: string;
  remainingImagesCount: number;
}

export function getSourceBlockPresentation({
  sourceCount,
  imageCount,
  isSearching = false,
  error,
  visibleImagesCount = 4,
}: {
  sourceCount: number;
  imageCount: number;
  isSearching?: boolean;
  error?: string;
  visibleImagesCount?: number;
}): SourceBlockPresentation {
  const safeSourceCount = Math.max(0, Math.floor(sourceCount));
  const safeImageCount = Math.max(0, Math.floor(imageCount));
  const safeVisibleImageCount = Math.max(0, Math.floor(visibleImagesCount));
  const hasSources = safeSourceCount > 0;
  const hasImages = safeImageCount > 0;

  let label = "Sources";
  if (isSearching) {
    label = "Searching...";
  } else if (error) {
    label = "Search failed";
  } else if (hasSources && hasImages) {
    label = "Sources & Images";
  } else if (hasImages) {
    label = "Images";
  }

  return {
    hasSources,
    hasImages,
    shouldRender: Boolean(isSearching || error || hasSources || hasImages),
    label,
    remainingImagesCount: Math.max(0, safeImageCount - safeVisibleImageCount),
  };
}
