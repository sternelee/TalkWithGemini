import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  clearRateLimitStoreForTesting,
  incrementRateLimitBucket,
} from "./rateLimitStore";

export const REQUEST_GUARD_ERROR_CODES = {
  csrf: "CSRF_ORIGIN_BLOCKED",
  rateLimited: "RATE_LIMITED",
} as const;

interface RateLimitRule {
  windowMs: number;
  maxRequests: number;
  methods?: readonly string[];
}

const DEFAULT_RATE_LIMIT: RateLimitRule = {
  windowMs: 60_000,
  maxRequests: 120,
};

const RATE_LIMIT_RULES: Array<[RegExp, RateLimitRule]> = [
  [/^\/api\/access\/verify$/, { windowMs: 60_000, maxRequests: 10 }],
  [/^\/api\/chat(?:\/|$)/, { windowMs: 60_000, maxRequests: 60 }],
  [/^\/api\/search$/, { windowMs: 60_000, maxRequests: 30 }],
  [/^\/api\/rag(?:\/|$)/, { windowMs: 60_000, maxRequests: 30 }],
  [/^\/api\/voice(?:\/|$)/, { windowMs: 60_000, maxRequests: 20 }],
  [/^\/api\/doc-parse(?:\/|$)/, { windowMs: 60_000, maxRequests: 10 }],
  [/^\/api\/plugins\/execute$/, { windowMs: 60_000, maxRequests: 30 }],
  [/^\/api\/plugins\/install$/, { windowMs: 60_000, maxRequests: 20 }],
  [
    /^\/api\/agents(?:\/|$)/,
    { windowMs: 60_000, maxRequests: 30, methods: ["GET"] },
  ],
  [
    /^\/api\/plugins\/list$/,
    { windowMs: 60_000, maxRequests: 15, methods: ["GET"] },
  ],
  [
    /^\/api\/providers\/models$/,
    { windowMs: 60_000, maxRequests: 30, methods: ["GET"] },
  ],
];

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function jsonError(
  status: number,
  payload: Record<string, unknown>,
): NextResponse {
  const response = NextResponse.json(
    { ...payload, statusCode: status },
    { status },
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function methodMatchesRule(method: string, rule: RateLimitRule): boolean {
  if (rule.methods) return rule.methods.includes(method);
  return mutatingMethods.has(method);
}

function getRateLimitRule(
  pathname: string,
  method: string,
): RateLimitRule | null {
  const methodName = method.toUpperCase();
  const pathRule = RATE_LIMIT_RULES.find(
    ([pattern, rule]) =>
      pattern.test(pathname) && methodMatchesRule(methodName, rule),
  )?.[1];
  if (pathRule) return pathRule;
  return mutatingMethods.has(methodName) ? DEFAULT_RATE_LIMIT : null;
}

function envBool(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function shouldTrustProxyHeaders(): boolean {
  return envBool("TRUST_PROXY_HEADERS");
}

export function getRateLimitClientIp(request: NextRequest): string {
  if (!shouldTrustProxyHeaders()) return "unknown";

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return (
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

function getRequestOrigin(request: NextRequest): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (shouldTrustProxyHeaders() && forwardedHost) {
    return `${forwardedProto || request.nextUrl.protocol.replace(":", "")}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

export function isMutatingRequest(request: NextRequest): boolean {
  return mutatingMethods.has(request.method.toUpperCase());
}

export function validateSameOriginRequest(
  request: NextRequest,
): NextResponse | null {
  if (!isMutatingRequest(request)) return null;

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite && secFetchSite !== "same-origin") {
    return jsonError(403, {
      error: "Cross-site API requests are blocked",
      code: REQUEST_GUARD_ERROR_CODES.csrf,
    });
  }

  const origin = request.headers.get("origin");
  if (!origin) return null;

  let parsedOrigin: URL;
  let expectedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
    expectedOrigin = new URL(getRequestOrigin(request));
  } catch {
    return jsonError(403, {
      error: "Invalid request origin",
      code: REQUEST_GUARD_ERROR_CODES.csrf,
    });
  }

  if (parsedOrigin.origin !== expectedOrigin.origin) {
    return jsonError(403, {
      error: "Cross-origin API requests are blocked",
      code: REQUEST_GUARD_ERROR_CODES.csrf,
    });
  }

  return null;
}

export async function enforceRateLimit(
  request: NextRequest,
  now = Date.now(),
): Promise<NextResponse | null> {
  const rule = getRateLimitRule(request.nextUrl.pathname, request.method);
  if (!rule) return null;

  const key = `${getRateLimitClientIp(request)}:${request.method}:${request.nextUrl.pathname}`;
  const current = await incrementRateLimitBucket(key, rule.windowMs, now);
  if (current.count <= rule.maxRequests) return null;

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((current.resetAt - now) / 1000),
  );
  const response = jsonError(429, {
    error: "Too many requests. Please try again later.",
    code: REQUEST_GUARD_ERROR_CODES.rateLimited,
    retryAfter: retryAfterSeconds,
  });
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

export async function applyRequestGuards(
  request: NextRequest,
): Promise<NextResponse | null> {
  return validateSameOriginRequest(request) || enforceRateLimit(request);
}

export function clearRequestRateLimitBuckets(): void {
  clearRateLimitStoreForTesting();
}
