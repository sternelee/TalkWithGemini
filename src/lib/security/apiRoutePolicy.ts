export type ApiRouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRateLimitPolicy {
  windowMs: number;
  maxRequests: number;
}

interface ApiRoutePolicy {
  pattern: RegExp;
  requestProofMethods?: readonly ApiRouteMethod[];
  rateLimitMethods?: readonly ApiRouteMethod[];
  rateLimit?: ApiRateLimitPolicy;
}

export const MUTATING_API_METHODS = new Set<ApiRouteMethod>([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

export const DEFAULT_MUTATING_API_RATE_LIMIT: ApiRateLimitPolicy = {
  windowMs: 60_000,
  maxRequests: 120,
};

const ALL_METHODS: readonly ApiRouteMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
];
const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

const API_ROUTE_POLICIES: readonly ApiRoutePolicy[] = [
  {
    pattern: /^\/api\/access\/verify$/,
    rateLimitMethods: MUTATING_METHODS,
    rateLimit: { windowMs: 60_000, maxRequests: 10 },
  },
  {
    pattern: /^\/api\/chat(?:\/|$)/,
    requestProofMethods: ALL_METHODS,
    rateLimitMethods: MUTATING_METHODS,
    rateLimit: { windowMs: 60_000, maxRequests: 60 },
  },
  {
    pattern: /^\/api\/search$/,
    requestProofMethods: ALL_METHODS,
    rateLimitMethods: MUTATING_METHODS,
    rateLimit: { windowMs: 60_000, maxRequests: 30 },
  },
  {
    pattern: /^\/api\/rag(?:\/|$)/,
    requestProofMethods: ALL_METHODS,
    rateLimitMethods: MUTATING_METHODS,
    rateLimit: { windowMs: 60_000, maxRequests: 30 },
  },
  {
    pattern: /^\/api\/voice(?:\/|$)/,
    requestProofMethods: ALL_METHODS,
    rateLimitMethods: MUTATING_METHODS,
    rateLimit: { windowMs: 60_000, maxRequests: 20 },
  },
  {
    pattern: /^\/api\/doc-parse(?:\/|$)/,
    requestProofMethods: ALL_METHODS,
    rateLimitMethods: MUTATING_METHODS,
    rateLimit: { windowMs: 60_000, maxRequests: 10 },
  },
  {
    pattern: /^\/api\/plugins\/execute$/,
    requestProofMethods: ["POST"],
    rateLimitMethods: ["POST"],
    rateLimit: { windowMs: 60_000, maxRequests: 30 },
  },
  {
    pattern: /^\/api\/plugins\/install$/,
    requestProofMethods: ["POST"],
    rateLimitMethods: ["POST"],
    rateLimit: { windowMs: 60_000, maxRequests: 20 },
  },
  {
    pattern: /^\/api\/plugins\/list$/,
    requestProofMethods: ["GET"],
    rateLimitMethods: ["GET"],
    rateLimit: { windowMs: 60_000, maxRequests: 15 },
  },
  {
    pattern: /^\/api\/providers\/models$/,
    requestProofMethods: ["POST"],
    rateLimitMethods: ["POST"],
    rateLimit: { windowMs: 60_000, maxRequests: 30 },
  },
  {
    pattern: /^\/api\/mcp\/servers$/,
    requestProofMethods: ["GET"],
    rateLimitMethods: ["GET"],
    rateLimit: { windowMs: 60_000, maxRequests: 30 },
  },
  {
    pattern: /^\/api\/agents(?:\/|$)/,
    rateLimitMethods: ["GET"],
    rateLimit: { windowMs: 60_000, maxRequests: 30 },
  },
];

function normalizeApiRouteMethod(method: string): ApiRouteMethod | null {
  const normalized = method.toUpperCase();
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(normalized)
    ? (normalized as ApiRouteMethod)
    : null;
}

function methodMatches(
  methods: readonly ApiRouteMethod[] | undefined,
  method: string,
): boolean {
  const normalized = normalizeApiRouteMethod(method);
  return Boolean(normalized && methods?.includes(normalized));
}

export function isApiProofProtectedRoute(
  pathname: string,
  method: string,
): boolean {
  return API_ROUTE_POLICIES.some(
    (policy) =>
      policy.pattern.test(pathname) &&
      methodMatches(policy.requestProofMethods, method),
  );
}

export function isMutatingApiRouteMethod(method: string): boolean {
  const normalized = normalizeApiRouteMethod(method);
  return Boolean(normalized && MUTATING_API_METHODS.has(normalized));
}

export function getApiRateLimitPolicy(
  pathname: string,
  method: string,
): ApiRateLimitPolicy | null {
  const match = API_ROUTE_POLICIES.find(
    (policy) =>
      policy.pattern.test(pathname) &&
      methodMatches(policy.rateLimitMethods, method),
  );
  if (match?.rateLimit) return match.rateLimit;

  return isMutatingApiRouteMethod(method)
    ? DEFAULT_MUTATING_API_RATE_LIMIT
    : null;
}
