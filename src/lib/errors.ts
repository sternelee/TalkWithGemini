/**
 * 统一的错误处理类
 */

import { logDevError } from "./utils/devLogger";

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: any,
  ) {
    super(message);
    this.name = "ApiError";
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 400, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class PayloadTooLargeError extends ApiError {
  constructor(message: string = "Request body is too large") {
    super(message, 413, "PAYLOAD_TOO_LARGE");
    this.name = "PayloadTooLargeError";
  }
}

export class LengthRequiredError extends ApiError {
  constructor(message: string = "Content-Length header is required") {
    super(message, 411, "LENGTH_REQUIRED");
    this.name = "LengthRequiredError";
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = "API key not configured") {
    super(message, 401, "AUTH_ERROR");
    this.name = "AuthenticationError";
  }
}

export class ProviderError extends ApiError {
  constructor(
    message: string,
    public provider: string,
  ) {
    super(message, 502, "PROVIDER_ERROR", { provider });
    this.name = "ProviderError";
  }
}

export class IncompleteProviderStreamError extends ApiError {
  constructor(message: string) {
    super(message, 502, "INCOMPLETE_PROVIDER_STREAM");
    this.name = "IncompleteProviderStreamError";
  }
}

export class ResponseTimeoutError extends ApiError {
  constructor(
    readonly timeoutMs: number,
    label = "Upstream response",
  ) {
    super(`${label} timed out after ${timeoutMs}ms`, 504, "RESPONSE_TIMEOUT", {
      timeoutMs,
    });
    this.name = "ResponseTimeoutError";
  }
}

export class HostedProxyBlockedError extends ApiError {
  constructor(
    message: string = "Hosted deployments cannot proxy local network URLs",
  ) {
    super(message, 403, "HOSTED_PROXY_BLOCKED");
    this.name = "HostedProxyBlockedError";
  }
}

export interface PublicErrorPayload {
  error: string;
  code: string;
  statusCode: number;
  details?: unknown;
}

const SENSITIVE_QUERY_RE =
  /([?&][^=]*(?:key|token|secret|auth|password)[^=]*=)[^&\s]*/gi;
const SENSITIVE_JSON_RE =
  /("(?:apiKey|token|secret|password|authorization|wrappedKey|ciphertext|iv)"\s*:\s*)"[^"]*"/gi;

export function redactSensitiveText(value: string): string {
  return value
    .replace(SENSITIVE_QUERY_RE, "$1[redacted]")
    .replace(SENSITIVE_JSON_RE, '$1"[redacted]"')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
}

function findNestedApiError(error: unknown): ApiError | null {
  let current: unknown = error;
  const visited = new Set<unknown>();
  for (let depth = 0; depth < 6; depth += 1) {
    if (current instanceof ApiError) return current;
    if (
      !current ||
      (typeof current !== "object" && typeof current !== "function") ||
      visited.has(current)
    ) {
      return null;
    }
    visited.add(current);
    current = "cause" in current ? current.cause : null;
  }
  return null;
}

export function toPublicErrorPayload(error: unknown): PublicErrorPayload {
  const apiError = findNestedApiError(error);
  if (apiError) {
    return {
      error: redactSensitiveText(apiError.message),
      code: apiError.code || "API_ERROR",
      statusCode: apiError.statusCode,
      details: apiError.details,
    };
  }

  if (error instanceof Error && error.name === "APIConnectionTimeoutError") {
    return {
      error: "The upstream provider response deadline was exceeded.",
      code: "RESPONSE_TIMEOUT",
      statusCode: 504,
    };
  }

  if (
    error instanceof Error &&
    (error.name === "ZodError" || "issues" in error)
  ) {
    return {
      error: "Invalid request body",
      code: "VALIDATION_ERROR",
      statusCode: 400,
      details: "issues" in error ? error.issues : undefined,
    };
  }

  return {
    error: "An internal error occurred. Please try again.",
    code: "INTERNAL_ERROR",
    statusCode: 500,
  };
}

/**
 * 错误处理工具函数
 */
export function handleApiError(error: unknown): Response {
  logDevError("API Error:", error);
  const payload = toPublicErrorPayload(error);
  return Response.json(payload, { status: payload.statusCode });
}
