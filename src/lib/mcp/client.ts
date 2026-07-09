import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { PLUGIN_EXECUTION_LIMITS } from "../../config/limits";
import { assertOutboundUrlAllowed } from "../security/safeFetch";
import { getSafeUrlPolicy, validateOutboundUrl } from "../security/urlPolicy";

export interface McpAuthConfig {
  type?: "bearer" | "apiKey" | "none" | "oauth2";
  value?: string;
  key?: string;
  addTo?: "header" | "query";
}

export interface McpClientRequestOptions {
  serverUrl: string;
  authConfig?: McpAuthConfig;
  staticHeaders?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface CreateSafeMcpFetchOptions {
  maxResponseBytes?: number;
  timeoutMs?: number;
}

export interface McpTool {
  name?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  [key: string]: unknown;
}

const MCP_CLIENT_INFO = {
  name: "talk-with-gemini",
  version: "1.0.0",
};
const MCP_REQUEST_TIMEOUT_MS = 30_000;
const MCP_MAX_RESPONSE_BYTES = PLUGIN_EXECUTION_LIMITS.maxRequestBodyChars;
const MCP_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const CROSS_ORIGIN_REDIRECT_SENSITIVE_HEADERS = [
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-api-key",
  "x-goog-api-key",
];

function resolveMcpServerUrl(
  serverUrl: string,
  authConfig?: McpAuthConfig,
): URL {
  const { url } = validateOutboundUrl(serverUrl, getSafeUrlPolicy("mcp"));
  const authValue = authConfig?.value?.trim();

  if (
    authValue &&
    authConfig?.type === "apiKey" &&
    authConfig.addTo === "query" &&
    authConfig.key
  ) {
    url.searchParams.set(authConfig.key, authValue);
  }

  return url;
}

function normalizeStaticHeaders(
  staticHeaders?: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(staticHeaders || {})) {
    const headerName = name.trim();
    const headerValue = value.trim();
    if (!headerName || !headerValue) continue;
    headers[headerName] = headerValue;
  }
  return headers;
}

function buildRequestInit(
  authConfig?: McpAuthConfig,
  staticHeaders?: Record<string, string>,
): RequestInit {
  const authValue = authConfig?.value?.trim();
  const headers: Record<string, string> = normalizeStaticHeaders(staticHeaders);

  if (!authValue || authConfig?.addTo === "query") {
    return { headers };
  }

  if (authConfig?.type === "bearer" || authConfig?.type === "oauth2") {
    headers.Authorization = `Bearer ${authValue}`;
  } else if (authConfig?.type === "apiKey") {
    headers[authConfig.key || "X-API-Key"] = authValue;
  }

  return { headers };
}

function getResponseContentLength(response: Response): number | null {
  const rawLength = response.headers.get("content-length");
  if (!rawLength) return null;

  const parsed = Number(rawLength);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function getChunkBytes(chunk: unknown): number {
  if (chunk instanceof Uint8Array) return chunk.byteLength;
  if (typeof chunk === "string") return new TextEncoder().encode(chunk).length;
  if (chunk instanceof ArrayBuffer) return chunk.byteLength;
  if (ArrayBuffer.isView(chunk)) return chunk.byteLength;
  return 0;
}

function limitMcpResponseBody(
  response: Response,
  maxResponseBytes: number,
): Response {
  const contentLength = getResponseContentLength(response);
  if (contentLength !== null && contentLength > maxResponseBytes) {
    throw new Error(`MCP response is too large (${contentLength} bytes)`);
  }

  if (!response.body || maxResponseBytes <= 0) {
    return response;
  }

  let totalBytes = 0;
  const limitedBody = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        totalBytes += getChunkBytes(chunk);
        if (totalBytes > maxResponseBytes) {
          throw new Error(`MCP response is too large (${totalBytes} bytes)`);
        }
        controller.enqueue(chunk);
      },
    }),
  );

  return new Response(limitedBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function stripCrossOriginRedirectHeaders(
  init: RequestInit,
  fromUrl: URL,
  toUrl: URL,
): RequestInit {
  if (fromUrl.origin === toUrl.origin) return init;

  const headers = new Headers(init.headers);
  for (const header of CROSS_ORIGIN_REDIRECT_SENSITIVE_HEADERS) {
    headers.delete(header);
  }

  return {
    ...init,
    headers,
  };
}

function normalizeRedirectRequestInit(
  init: RequestInit,
  status: number,
): RequestInit {
  const method = String(init.method || "GET").toUpperCase();
  if (
    status !== 303 &&
    !((status === 301 || status === 302) && method === "POST")
  ) {
    return init;
  }

  const headers = new Headers(init.headers);
  headers.delete("content-length");

  return {
    ...init,
    method: "GET",
    body: undefined,
    headers,
  };
}

export function createSafeMcpFetch(
  options: CreateSafeMcpFetchOptions = {},
): typeof fetch {
  const maxResponseBytes = Math.max(
    1,
    options.maxResponseBytes || MCP_MAX_RESPONSE_BYTES,
  );
  const timeoutMs = options.timeoutMs || MCP_REQUEST_TIMEOUT_MS;

  return async (input, init) => {
    const policy = getSafeUrlPolicy("mcp");
    const initialTarget =
      typeof input === "string" || input instanceof URL ? input : input.url;
    let { url } = validateOutboundUrl(initialTarget, policy);
    let requestInput: RequestInfo | URL = input;
    let requestInit: RequestInit = { ...init };

    for (
      let redirectCount = 0;
      redirectCount <= MCP_MAX_REDIRECTS;
      redirectCount += 1
    ) {
      await assertOutboundUrlAllowed(url, { policy, timeoutMs });

      const response = await fetch(requestInput, {
        ...requestInit,
        redirect: "manual",
      });

      if (!REDIRECT_STATUSES.has(response.status)) {
        return limitMcpResponseBody(response, maxResponseBytes);
      }

      const location = response.headers.get("location");
      if (!location) {
        return limitMcpResponseBody(response, maxResponseBytes);
      }

      if (redirectCount === MCP_MAX_REDIRECTS) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(
          `Too many MCP redirects after ${MCP_MAX_REDIRECTS} hops`,
        );
      }

      await response.body?.cancel().catch(() => undefined);
      const redirectUrl = new URL(location, url);
      const validatedRedirect = validateOutboundUrl(redirectUrl, policy);
      await assertOutboundUrlAllowed(validatedRedirect.url, {
        policy,
        timeoutMs,
      });
      requestInit = normalizeRedirectRequestInit(
        stripCrossOriginRedirectHeaders(
          requestInit,
          url,
          validatedRedirect.url,
        ),
        response.status,
      );
      url = validatedRedirect.url;
      requestInput = url;
    }

    throw new Error(`Too many MCP redirects after ${MCP_MAX_REDIRECTS} hops`);
  };
}

const safeMcpFetch = createSafeMcpFetch();

const validateMcpFetchTarget: typeof fetch = (input, init) => {
  const target =
    typeof input === "string" || input instanceof URL ? input : input.url;
  validateOutboundUrl(target, getSafeUrlPolicy("mcp"));
  return safeMcpFetch(input, init);
};

async function withMcpClient<T>(
  options: McpClientRequestOptions,
  operation: (client: Client, requestOptions: RequestOptions) => Promise<T>,
): Promise<T> {
  const transport = new StreamableHTTPClientTransport(
    resolveMcpServerUrl(options.serverUrl, options.authConfig),
    {
      requestInit: buildRequestInit(options.authConfig, options.staticHeaders),
      fetch: validateMcpFetchTarget,
    },
  );
  const client = new Client(MCP_CLIENT_INFO, { capabilities: {} });
  const requestOptions: RequestOptions = {
    timeout: options.timeoutMs || MCP_REQUEST_TIMEOUT_MS,
    signal: options.signal,
  };

  try {
    await client.connect(transport, requestOptions);
    return await operation(client, requestOptions);
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function listMcpTools(
  options: McpClientRequestOptions,
): Promise<McpTool[]> {
  const result = await withMcpClient(options, (client, requestOptions) =>
    client.listTools(undefined, requestOptions),
  );
  return Array.isArray(result.tools) ? (result.tools as McpTool[]) : [];
}

export async function callMcpTool(
  options: McpClientRequestOptions & {
    toolName: string;
    args: Record<string, unknown>;
  },
): Promise<unknown> {
  return withMcpClient(options, (client, requestOptions) =>
    client.callTool(
      {
        name: options.toolName,
        arguments: options.args,
      },
      undefined,
      requestOptions,
    ),
  );
}
