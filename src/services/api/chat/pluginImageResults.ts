type PluginImageCandidate = {
  id?: unknown;
  mimeType?: unknown;
  data?: unknown;
  url?: unknown;
  fileName?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parsePluginImageBase64(
  value: unknown,
  fallbackMimeType: unknown,
): { data: string; mimeType: string } | null {
  if (typeof value !== "string" || !value.trim()) return null;

  const raw = value.trim();
  const dataUrlMatch = raw.match(/^data:([^;,]+)?;base64,(.*)$/);
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1] || "image/png",
      data: dataUrlMatch[2] || "",
    };
  }

  return {
    mimeType:
      typeof fallbackMimeType === "string" ? fallbackMimeType : "image/png",
    data: raw,
  };
}

function getPluginResultImageCandidates(
  resultData: unknown,
): PluginImageCandidate[] {
  if (!isRecord(resultData)) return [];

  const nestedImageRecords = Array.isArray(resultData.images)
    ? resultData.images.filter(isRecord)
    : [];
  const imageRecords =
    nestedImageRecords.length > 0 ? nestedImageRecords : [resultData];

  return imageRecords
    .map((item, index): PluginImageCandidate | null => {
      const parsedBase64 = parsePluginImageBase64(
        item.imageBase64,
        item.mimeType,
      );
      const imageUrl =
        typeof item.imageUrl === "string" && item.imageUrl.trim()
          ? item.imageUrl.trim()
          : "";
      if (!parsedBase64 && !imageUrl) return null;

      return {
        id: item.id,
        mimeType: parsedBase64?.mimeType || item.mimeType || "image/png",
        data: parsedBase64?.data,
        url: parsedBase64 ? undefined : imageUrl,
        fileName:
          typeof item.fileName === "string" && item.fileName.trim()
            ? item.fileName
            : imageRecords.length > 1
              ? `plugin-image-${index + 1}.png`
              : "plugin-image.png",
      };
    })
    .filter((item): item is PluginImageCandidate => Boolean(item));
}

export function compactPluginImageResultForHistory(
  resultData: unknown,
): unknown {
  if (!isRecord(resultData)) return resultData;

  const imageCandidates = getPluginResultImageCandidates(resultData);
  if (imageCandidates.length === 0) return resultData;

  const compacted = Object.fromEntries(
    Object.entries(resultData).filter(
      ([key]) => !["imageBase64", "imageUrl", "images", "raw"].includes(key),
    ),
  );
  const firstUrl = imageCandidates.find(
    (image) => typeof image.url === "string" && image.url.trim(),
  )?.url;
  const hasInlineImage = imageCandidates.some(
    (image) => typeof image.data === "string" && image.data.trim(),
  );

  return {
    ...compacted,
    imageUrl: typeof firstUrl === "string" ? firstUrl : null,
    imageBase64: hasInlineImage ? "[image omitted]" : null,
    imageCount: imageCandidates.length,
  };
}
