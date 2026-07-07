import { v7 as uuidv7 } from "uuid";
import type { Attachment } from "../../types";
import { ATTACHMENT_LIMITS } from "../../config/limits";
import { ensureImageDisplayCache } from "./imageDisplayCache";

const IMAGE_MIME_RE = /^image\/[a-z0-9.+-]+$/i;

function sanitizeGeneratedImageFileName(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const sanitized = raw
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ATTACHMENT_LIMITS.maxFileNameChars);

  return sanitized || "generated-image.png";
}

function normalizeGeneratedImageMimeType(value: unknown): string {
  const mimeType =
    typeof value === "string"
      ? value.trim().slice(0, ATTACHMENT_LIMITS.maxMimeTypeChars)
      : "";

  return IMAGE_MIME_RE.test(mimeType) ? mimeType : "image/png";
}

export function normalizeGeneratedImageAttachment(input: {
  id?: unknown;
  mimeType?: unknown;
  data?: unknown;
  fileName?: unknown;
}): Attachment | null {
  const data = typeof input.data === "string" ? input.data.trim() : "";
  if (!data || data.length > ATTACHMENT_LIMITS.maxBase64Chars) {
    return null;
  }

  const id =
    typeof input.id === "string" && input.id.trim()
      ? input.id.trim().slice(0, 120)
      : uuidv7();

  return {
    id,
    mimeType: normalizeGeneratedImageMimeType(input.mimeType),
    data,
    fileName: sanitizeGeneratedImageFileName(input.fileName),
  };
}

export function normalizeGeneratedImageAttachments(
  inputs: Array<{
    id?: unknown;
    mimeType?: unknown;
    data?: unknown;
    fileName?: unknown;
  }>,
): Attachment[] {
  const attachments: Attachment[] = [];

  for (const input of inputs) {
    const attachment = normalizeGeneratedImageAttachment(input);
    if (!attachment) continue;

    attachments.push(attachment);
    if (attachments.length >= ATTACHMENT_LIMITS.maxCount) break;
  }

  return attachments;
}

export async function cacheGeneratedImageAttachments(
  attachments: Attachment[],
  options: Parameters<typeof ensureImageDisplayCache>[1] = {},
): Promise<Attachment[]> {
  return Promise.all(
    attachments.map((attachment) =>
      ensureImageDisplayCache(attachment, {
        prefix: "images/generated",
        ...options,
      }),
    ),
  );
}
