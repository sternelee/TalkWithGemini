import { NextResponse } from "next/server";
import { toPublicErrorPayload, type PublicErrorPayload } from "../errors";

export interface ApiErrorPayload extends PublicErrorPayload {
  retryAfter?: number;
}

interface ApiSuccessResponseOptions {
  status?: number;
  headers?: HeadersInit;
  cacheControl?: string;
}

interface ApiErrorResponseOptions {
  fallbackError?: string;
  headers?: HeadersInit;
  retryAfter?: number;
}

function withDefaultCacheHeader(
  headers: HeadersInit | undefined,
  cacheControl = "no-store",
): Headers {
  const nextHeaders = new Headers(headers);
  if (!nextHeaders.has("Cache-Control")) {
    nextHeaders.set("Cache-Control", cacheControl);
  }
  return nextHeaders;
}

export function createApiSuccessResponse<T>(
  data: T,
  options: ApiSuccessResponseOptions = {},
): NextResponse<T> {
  return NextResponse.json(data, {
    status: options.status ?? 200,
    headers: withDefaultCacheHeader(options.headers, options.cacheControl),
  });
}

export function createApiErrorPayload(
  error: unknown,
  options: ApiErrorResponseOptions | string = {},
): ApiErrorPayload {
  const normalizedOptions =
    typeof options === "string" ? { fallbackError: options } : options;
  const payload = toPublicErrorPayload(error);
  const safePayload: ApiErrorPayload =
    payload.statusCode >= 500 && payload.code === "INTERNAL_ERROR"
      ? {
          error: normalizedOptions.fallbackError || payload.error,
          code: payload.code,
          statusCode: payload.statusCode,
        }
      : { ...payload };

  if (normalizedOptions.retryAfter !== undefined) {
    safePayload.retryAfter = normalizedOptions.retryAfter;
  }

  return safePayload;
}

export function createApiErrorResponse(
  error: unknown,
  options: ApiErrorResponseOptions | string = {},
): NextResponse<ApiErrorPayload> {
  const normalizedOptions =
    typeof options === "string" ? { fallbackError: options } : options;
  const payload = createApiErrorPayload(error, normalizedOptions);
  const headers = withDefaultCacheHeader(normalizedOptions.headers);

  if (payload.retryAfter !== undefined) {
    headers.set("Retry-After", String(payload.retryAfter));
  }

  return NextResponse.json(payload, {
    status: payload.statusCode,
    headers,
  });
}
