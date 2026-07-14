import { NextRequest, NextResponse } from "next/server";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { MessageImageProxyRequestSchema } from "@/lib/api/schemas";
import { ApiError } from "@/lib/errors";
import { safeFetch } from "@/lib/security/safeFetch";
import {
  getSafeUrlPolicy,
  validateOutboundUrl,
} from "@/lib/security/urlPolicy";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

const MESSAGE_IMAGE_PROXY_MAX_BYTES = 10 * 1024 * 1024;
const MESSAGE_IMAGE_PROXY_MAX_REQUEST_BYTES = 4 * 1024;
const SUPPORTED_IMAGE_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function createImageProxyError(error: string, status: number, code: string) {
  return NextResponse.json(
    { error, code, statusCode: status },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function hasBytesAt(
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function hasAsciiAt(bytes: Uint8Array, offset: number, expected: string) {
  return hasBytesAt(
    bytes,
    offset,
    Array.from(expected, (character) => character.charCodeAt(0)),
  );
}

function matchesImageSignature(
  bytes: Uint8Array,
  contentType: string,
): boolean {
  switch (contentType) {
    case "image/png":
      return hasBytesAt(
        bytes,
        0,
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      );
    case "image/jpeg":
      return hasBytesAt(bytes, 0, [0xff, 0xd8, 0xff]);
    case "image/gif":
      return hasAsciiAt(bytes, 0, "GIF87a") || hasAsciiAt(bytes, 0, "GIF89a");
    case "image/webp":
      return hasAsciiAt(bytes, 0, "RIFF") && hasAsciiAt(bytes, 8, "WEBP");
    case "image/avif":
      if (!hasAsciiAt(bytes, 4, "ftyp")) return false;
      for (
        let offset = 8;
        offset + 4 <= Math.min(bytes.length, 32);
        offset += 4
      ) {
        if (
          hasAsciiAt(bytes, offset, "avif") ||
          hasAsciiAt(bytes, offset, "avis")
        ) {
          return true;
        }
      }
      return false;
    default:
      return false;
  }
}

async function cancelResponseBody(response: Response) {
  await response.body?.cancel().catch(() => undefined);
}

export async function POST(request: NextRequest) {
  try {
    const { url: sourceUrl } = MessageImageProxyRequestSchema.parse(
      await readJsonRequestBody(request, MESSAGE_IMAGE_PROXY_MAX_REQUEST_BYTES),
    );
    const policy = getSafeUrlPolicy("image");
    const { url } = validateOutboundUrl(sourceUrl, policy);
    const response = await safeFetch(
      url,
      {
        method: "GET",
        headers: { Accept: "image/*" },
        signal: request.signal,
      },
      {
        policy,
        enforceResponseLimits: true,
        timeoutMs: 20_000,
        maxResponseBytes: MESSAGE_IMAGE_PROXY_MAX_BYTES,
      },
    );

    if (!response.ok) {
      await cancelResponseBody(response);
      return createImageProxyError(
        "The upstream image could not be fetched",
        502,
        "UPSTREAM_IMAGE_FETCH_FAILED",
      );
    }

    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (!contentType || !SUPPORTED_IMAGE_CONTENT_TYPES.has(contentType)) {
      await cancelResponseBody(response);
      return createImageProxyError(
        "The upstream response is not a supported image",
        415,
        "UNSUPPORTED_IMAGE_CONTENT_TYPE",
      );
    }

    const declaredContentLength = Number(
      response.headers.get("content-length") || "0",
    );
    if (
      Number.isFinite(declaredContentLength) &&
      declaredContentLength > MESSAGE_IMAGE_PROXY_MAX_BYTES
    ) {
      await cancelResponseBody(response);
      throw new ApiError(
        `Upstream response exceeded ${MESSAGE_IMAGE_PROXY_MAX_BYTES} bytes`,
        502,
        "RESPONSE_SIZE_LIMIT",
        { maxBytes: MESSAGE_IMAGE_PROXY_MAX_BYTES },
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    if (!matchesImageSignature(new Uint8Array(arrayBuffer), contentType)) {
      return createImageProxyError(
        "The upstream response does not match its declared image type",
        415,
        "IMAGE_CONTENT_MISMATCH",
      );
    }

    return new NextResponse(arrayBuffer, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(arrayBuffer.byteLength),
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (
      request.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return new Response(null, { status: 499 });
    }

    if (error instanceof ApiError && error.statusCode < 500) {
      return createApiErrorResponse(error, "Image proxy failed");
    }

    safeServerLogError("Message image proxy error:", error);
    return createApiErrorResponse(error, "Image proxy failed");
  }
}
