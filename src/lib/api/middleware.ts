/**
 * API 路由中间件
 */

import { NextRequest } from "next/server";
import { API_INPUT_LIMITS } from "@/config/limits";
import {
  ApiError,
  handleApiError,
  LengthRequiredError,
  PayloadTooLargeError,
  toPublicErrorPayload,
  ValidationError,
} from "../errors";
export { createApiErrorResponse } from "./responses";
import {
  createStreamResponse,
  createStreamHandler,
  createSSESender,
} from "../streaming/sse";
import { logDevError, logDevInfo } from "../utils/devLogger";

export type ApiHandler = (request: NextRequest, body: any) => Promise<Response>;

const jsonDecoder = new TextDecoder();

function isRequestAbort(error: unknown, request: Request): boolean {
  return (
    request.signal.aborted ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function createClientClosedResponse(): Response {
  return new Response(null, { status: 499 });
}

export async function readJsonRequestBody(
  request: Request,
  maxBytes = API_INPUT_LIMITS.maxJsonBodyBytes,
): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  const contentLengthBytes = contentLength ? Number(contentLength) : 0;

  if (
    contentLength &&
    Number.isFinite(contentLengthBytes) &&
    contentLengthBytes > maxBytes
  ) {
    throw new PayloadTooLargeError();
  }

  if (!request.body) {
    throw new ValidationError("Missing request body");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      receivedBytes += value.byteLength;
      if (receivedBytes > maxBytes) {
        throw new PayloadTooLargeError();
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }

  const body = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(jsonDecoder.decode(body));
  } catch {
    throw new ValidationError("Invalid JSON body");
  }
}

export function assertRequestContentLengthUnderLimit(
  request: Request,
  maxBytes: number,
): void {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return;

  const contentLengthBytes = Number(contentLength);
  if (!Number.isFinite(contentLengthBytes)) return;

  if (contentLengthBytes > maxBytes) {
    throw new PayloadTooLargeError();
  }
}

export function assertMultipartRequestContentLengthUnderLimit(
  request: Request,
  maxBytes: number,
): void {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) {
    throw new LengthRequiredError();
  }

  const contentLengthBytes = Number(contentLength);
  if (!Number.isFinite(contentLengthBytes) || contentLengthBytes <= 0) {
    throw new LengthRequiredError("Valid Content-Length header is required");
  }

  if (contentLengthBytes > maxBytes) {
    throw new PayloadTooLargeError();
  }
}

export function parseJsonFormValue(
  value: FormDataEntryValue | null,
  label = "form value",
): unknown {
  if (typeof value !== "string") return undefined;

  try {
    return JSON.parse(value);
  } catch {
    throw new ApiError(`Invalid ${label} JSON`, 400, "INVALID_SECRET_JSON");
  }
}

/**
 * 包装 API 处理器，添加错误处理和日志
 */
export function withApiHandler(handler: ApiHandler) {
  return async (request: NextRequest): Promise<Response> => {
    try {
      const body = await readJsonRequestBody(request);
      return await handler(request, body);
    } catch (error) {
      if (isRequestAbort(error, request)) return createClientClosedResponse();
      return handleApiError(error);
    }
  };
}

/**
 * 包装流式 API 处理器，错误以 SSE 格式返回
 */
export function withStreamApiHandler(handler: ApiHandler) {
  return async (request: NextRequest): Promise<Response> => {
    try {
      const body = await readJsonRequestBody(request);
      return await handler(request, body);
    } catch (error) {
      if (isRequestAbort(error, request)) return createClientClosedResponse();
      // 返回 SSE 格式的错误
      logDevError("Stream API Error:", error);

      const errorPayload = toPublicErrorPayload(error);
      if (
        errorPayload.statusCode === 401 &&
        errorPayload.code === "AUTH_ERROR"
      ) {
        return Response.json(errorPayload, { status: errorPayload.statusCode });
      }

      const stream = createStreamHandler(async (controller) => {
        const send = createSSESender(controller);
        send({
          type: "error",
          error: errorPayload.error,
          code: errorPayload.code,
          statusCode: errorPayload.statusCode,
        });
      });

      return createStreamResponse(stream);
    }
  };
}

/**
 * 验证请求体字段
 */
export function validateRequestBody(body: any, requiredFields: string[]) {
  for (const field of requiredFields) {
    if (!(field in body) || body[field] === undefined) {
      throw new ValidationError(`Missing required field: ${field}`);
    }
  }
}

/**
 * 日志中间件
 */
export function logRequest(endpoint: string, body: any) {
  if (process.env.NODE_ENV !== "development") return;

  logDevInfo(`[${endpoint}] Request:`, {
    timestamp: new Date().toISOString(),
    ...body,
  });
}
