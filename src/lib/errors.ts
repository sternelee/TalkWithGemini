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

export function toPublicErrorPayload(error: unknown): PublicErrorPayload {
  if (error instanceof ApiError) {
    return {
      error: redactSensitiveText(error.message),
      code: error.code || "API_ERROR",
      statusCode: error.statusCode,
      details: error.details,
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
