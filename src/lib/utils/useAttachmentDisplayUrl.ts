"use client";

import { useEffect, useState } from "react";
import type { Attachment } from "../../types";
import {
  ensureImageDisplayCache,
  getAttachmentOriginalDisplayUrl,
  resolveAttachmentDisplayBlobUrl,
} from "./imageDisplayCache";

interface UseAttachmentDisplayUrlOptions {
  enableCacheBackfill?: boolean;
  onCacheReady?: (attachment: Attachment) => void;
}

export function useAttachmentDisplayUrl(
  attachment: Attachment,
  options: UseAttachmentDisplayUrlOptions = {},
): string {
  const { enableCacheBackfill = false, onCacheReady } = options;
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const originalUrl = getAttachmentOriginalDisplayUrl(attachment);
  const isImage = attachment.mimeType.startsWith("image/");
  const cacheKey = [
    attachment.id,
    attachment.mimeType,
    attachment.data,
    attachment.url,
    attachment.displayCache?.opfsUrl,
    attachment.displayCache?.sourceFingerprint,
  ].join("\0");

  useEffect(() => {
    if (!isImage) return;

    let cancelled = false;
    let activeBlobUrl: string | null = null;

    const run = async () => {
      const displayAttachment = enableCacheBackfill
        ? await ensureImageDisplayCache(attachment)
        : attachment;

      if (cancelled) return;

      if (
        displayAttachment.displayCache?.opfsUrl &&
        displayAttachment.displayCache.opfsUrl !==
          attachment.displayCache?.opfsUrl
      ) {
        onCacheReady?.(displayAttachment);
      }

      const url = await resolveAttachmentDisplayBlobUrl(displayAttachment);
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }

      activeBlobUrl = url;
      setBlobUrl(url);
    };

    void run();

    return () => {
      cancelled = true;
      if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
        activeBlobUrl = null;
      }
    };
  }, [attachment, cacheKey, enableCacheBackfill, isImage, onCacheReady]);

  return isImage ? blobUrl || originalUrl || "" : originalUrl || "";
}
