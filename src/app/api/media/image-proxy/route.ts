import { NextRequest, NextResponse } from "next/server";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { MessageImageProxyRequestSchema } from "@/lib/api/schemas";
import { safeFetchArrayBuffer } from "@/lib/security/safeFetch";
import {
  getSafeUrlPolicy,
  validateOutboundUrl,
} from "@/lib/security/urlPolicy";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

const MESSAGE_IMAGE_PROXY_MAX_BYTES = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function POST(request: NextRequest) {
  try {
    const { url: sourceUrl } = MessageImageProxyRequestSchema.parse(
      await readJsonRequestBody(request),
    );
    const policy = getSafeUrlPolicy("image");
    const { url } = validateOutboundUrl(sourceUrl, policy);
    const { response, arrayBuffer } = await safeFetchArrayBuffer(
      url,
      {
        method: "GET",
        headers: { Accept: "image/*" },
        signal: request.signal,
      },
      {
        policy,
        timeoutMs: 20_000,
        maxResponseBytes: MESSAGE_IMAGE_PROXY_MAX_BYTES,
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "The upstream image could not be fetched" },
        { status: 502 },
      );
    }

    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (!contentType || !SUPPORTED_IMAGE_CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: "The upstream response is not a supported image" },
        { status: 415 },
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

    safeServerLogError("Message image proxy error:", error);
    return createApiErrorResponse(error, "Image proxy failed");
  }
}
