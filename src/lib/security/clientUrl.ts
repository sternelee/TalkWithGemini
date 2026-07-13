import { isLocalhostName, isPrivateIpAddress } from "./urlPolicy";
import { getRemoteAttachmentUrlError } from "./remoteAttachment";
import { CLIENT_URL_LIMITS } from "@/config/limits";

const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|gif|webp);base64,/i;

function isSafeInlineImageDataUrl(value: string): boolean {
  return (
    value.length <= CLIENT_URL_LIMITS.maxInlineImageDataUrlChars &&
    SAFE_DATA_IMAGE_RE.test(value)
  );
}

function hasUnsafeHost(url: URL): boolean {
  return isLocalhostName(url.hostname) || isPrivateIpAddress(url.hostname);
}

export function getSafeExternalHref(href: string | undefined): string | null {
  const trimmed = href?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#")) return trimmed;

  try {
    const url = new URL(trimmed);
    if (!LINK_PROTOCOLS.has(url.protocol)) return null;
    if (url.username || url.password) return null;
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      hasUnsafeHost(url)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function getSafeWebHref(href: string | undefined): string | null {
  const safeHref = getSafeExternalHref(href);
  if (!safeHref) return null;

  try {
    const url = new URL(safeHref);
    return url.protocol === "http:" || url.protocol === "https:"
      ? safeHref
      : null;
  } catch {
    return null;
  }
}

export function getSafeFaviconProxyUrl(
  href: string | undefined,
): string | null {
  const safeHref = getSafeWebHref(href);
  if (!safeHref) return null;

  try {
    const { hostname } = new URL(safeHref);
    if (!hostname) return null;

    const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
    return `https://serveproxy.com/?url=${encodeURIComponent(faviconUrl)}`;
  } catch {
    return null;
  }
}

export function getSafeMarkdownImageSrc(
  src: string | undefined,
): string | null {
  const trimmed = src?.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data:image/")) {
    return isSafeInlineImageDataUrl(trimmed) ? trimmed : null;
  }
  if (trimmed.startsWith("blob:")) return trimmed;
  if (trimmed.startsWith("opfs://")) return trimmed;

  return getRemoteAttachmentUrlError(trimmed)
    ? null
    : new URL(trimmed).toString();
}

export function getSafeDisplayImageSrc(src: string | undefined): string | null {
  const trimmed = src?.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  if (trimmed.startsWith("blob:")) return trimmed;
  if (trimmed.startsWith("data:image/")) {
    return isSafeInlineImageDataUrl(trimmed) ? trimmed : null;
  }

  return getRemoteAttachmentUrlError(trimmed)
    ? null
    : new URL(trimmed).toString();
}
