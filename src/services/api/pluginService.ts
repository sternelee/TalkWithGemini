import { Plugin } from "@/types";
import { useSettingsStore } from "@/store/core/settingsStore";
import { encryptSecret } from "@/lib/byok/client";
import { BYOK_CONTEXTS } from "@/lib/byok/shared";
import {
  getResponseErrorMessage,
  readJsonResponseOrThrow,
  signedApiFetch,
} from "@/lib/api/client";
import { normalizeMarketPlugins } from "@/lib/market/plugins";
import {
  MCP_REGISTRY_BASE_URL,
  normalizeMcpRegistryServers,
} from "@/lib/mcp/registry";
import { DEFAULT_MCP_SERVER_LOGO_URL } from "@/lib/mcp/defaults";
import { logDevError, logDevInfo, logDevWarn } from "@/lib/utils/devLogger";
import { CACHE_CONFIG } from "@/config/api";
import { MARKET_LIMITS } from "@/config/limits";
import {
  toMarketLoadError,
  type MarketLoadResult,
} from "@/lib/market/loadResult";

let pluginListRequest: Promise<MarketLoadResult<Plugin[]>> | null = null;
let mcpServerListRequest: Promise<MarketLoadResult<Plugin[]>> | null = null;
const mcpServerPageRequests = new Map<
  string,
  Promise<MarketLoadResult<McpServerPage>>
>();
const MCP_REGISTRY_UPSTREAM_LIMIT = 100;
const MCP_REGISTRY_MAX_UPSTREAM_PAGES_PER_REQUEST = 10;

export interface CustomMcpServerInstallInput {
  name: string;
  serverUrl: string;
  bearerToken?: string;
}

export interface McpServerPageOptions {
  forceRefresh?: boolean;
  cursor?: string;
  search?: string;
  limit?: number;
}

export interface McpServerPage {
  plugins: Plugin[];
  nextCursor?: string;
}

function getPluginCacheSnapshot(): {
  plugins: Plugin[];
  fetchedAt: number;
  fresh: boolean;
} | null {
  const { marketPlugins, marketPluginsTimestamp } = useSettingsStore.getState();
  if (!Array.isArray(marketPlugins) || !marketPluginsTimestamp) return null;

  return {
    plugins: normalizeMarketPlugins(marketPlugins),
    fetchedAt: marketPluginsTimestamp,
    fresh: Date.now() - marketPluginsTimestamp < CACHE_CONFIG.plugins,
  };
}

function getMcpCacheSnapshot(): {
  plugins: Plugin[];
  fetchedAt: number;
  fresh: boolean;
} | null {
  const { marketMcpServers, marketMcpServersTimestamp } =
    useSettingsStore.getState();
  if (!Array.isArray(marketMcpServers) || !marketMcpServersTimestamp) {
    return null;
  }

  return {
    plugins: normalizeMarketPlugins(marketMcpServers),
    fetchedAt: marketMcpServersTimestamp,
    fresh: Date.now() - marketMcpServersTimestamp < CACHE_CONFIG.plugins,
  };
}

function getMcpRegistryNextCursor(value: unknown): string {
  if (!value || typeof value !== "object") return "";

  const raw = value as Record<string, unknown>;
  const metadata =
    raw.metadata && typeof raw.metadata === "object"
      ? (raw.metadata as Record<string, unknown>)
      : {};
  const pagination =
    raw.pagination && typeof raw.pagination === "object"
      ? (raw.pagination as Record<string, unknown>)
      : {};

  const cursor =
    raw.nextCursor || metadata.nextCursor || pagination.nextCursor || "";
  return typeof cursor === "string" ? cursor : "";
}

function getMcpServerPageLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return 20;
  return Math.max(
    1,
    Math.min(Math.floor(limit || 20), MARKET_LIMITS.maxPlugins),
  );
}

function buildMcpRegistryServersUrl({
  cursor,
  search,
}: {
  cursor?: string;
  search?: string;
}): string {
  const url = new URL(`${MCP_REGISTRY_BASE_URL}/servers`);
  url.searchParams.set("limit", String(MCP_REGISTRY_UPSTREAM_LIMIT));
  url.searchParams.set("version", "latest");
  if (cursor) url.searchParams.set("cursor", cursor);
  if (search) url.searchParams.set("search", search);
  return url.toString();
}

function slugifyCustomMcpName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "server"
  );
}

function normalizeCustomMcpServerUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("MCP server URL is required.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("MCP server URL must be a valid HTTP or HTTPS URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("MCP server URL must use HTTP or HTTPS.");
  }

  return url.toString();
}

function createCustomMcpPlugin(input: CustomMcpServerInstallInput): Plugin {
  const serverUrl = normalizeCustomMcpServerUrl(input.serverUrl);
  const url = new URL(serverUrl);
  const title = input.name.trim() || url.hostname;
  const slug = slugifyCustomMcpName(title);
  const hasBearerToken = Boolean(input.bearerToken?.trim());
  const id = `custom-mcp-${slug}-${Date.now()}`;

  return {
    id,
    title,
    description: `Custom MCP server at ${url.origin}`,
    logoUrl: DEFAULT_MCP_SERVER_LOGO_URL,
    manifestUrl: "",
    source: "mcp",
    category: "MCP",
    categories: ["MCP"],
    added: new Date().toISOString(),
    functions: [],
    auth: hasBearerToken
      ? {
          type: "bearer",
          name: "Authorization",
          in: "header",
          required: true,
        }
      : { type: "none", required: false },
    mcp: {
      transport: "streamable-http",
      serverUrl,
      serverName: title,
      serverVersion: "custom",
      toolNameMap: {},
    },
  };
}

export const getCachedPlugins = (): Plugin[] => {
  const cache = getPluginCacheSnapshot();
  return cache?.fresh ? cache.plugins : [];
};

export const getCachedMcpServers = (): Plugin[] => {
  const cache = getMcpCacheSnapshot();
  return cache?.fresh ? cache.plugins : [];
};

export const fetchApiGuruListResult = async (
  forceRefresh: boolean = false,
): Promise<MarketLoadResult<Plugin[]>> => {
  const { setMarketPlugins } = useSettingsStore.getState();
  const cache = getPluginCacheSnapshot();

  if (!forceRefresh && cache?.fresh) {
    logDevInfo("Using cached plugins data");
    return {
      data: cache.plugins,
      status: "cache",
      source: "plugins:cache",
      fetchedAt: cache.fetchedAt,
    };
  }

  if (!forceRefresh && pluginListRequest) {
    logDevInfo("Reusing in-flight plugins request");
    return pluginListRequest;
  }

  const request = (async () => {
    try {
      logDevInfo("Fetching plugins from API...");
      const response = await signedApiFetch("/api/plugins/list");
      if (!response.ok) throw new Error("Failed to fetch plugins");

      const data = await readJsonResponseOrThrow<{ plugins?: Plugin[] }>(
        response,
        "Failed to fetch plugins",
      );
      const plugins: Plugin[] = normalizeMarketPlugins(data.plugins);
      const fetchedAt = Date.now();

      setMarketPlugins(plugins);
      logDevInfo(`Cached ${plugins.length} plugins`);
      return {
        data: plugins,
        status: "fresh",
        source: "plugins:api",
        fetchedAt,
      } satisfies MarketLoadResult<Plugin[]>;
    } catch (error) {
      logDevError("Error fetching plugin list:", error);
      const marketError = toMarketLoadError(error, "Failed to fetch plugins");
      if (cache) {
        logDevWarn("Using stale cache due to fetch error");
        return {
          data: cache.plugins,
          status: "stale",
          source: "plugins:cache",
          fetchedAt: cache.fetchedAt,
          error: marketError,
        } satisfies MarketLoadResult<Plugin[]>;
      }
      return {
        data: [],
        status: "error",
        source: "plugins:api",
        error: marketError,
      } satisfies MarketLoadResult<Plugin[]>;
    }
  })();

  pluginListRequest = request;

  try {
    return await request;
  } finally {
    if (pluginListRequest === request) {
      pluginListRequest = null;
    }
  }
};

export const fetchApiGuruList = async (
  forceRefresh: boolean = false,
): Promise<Plugin[]> => (await fetchApiGuruListResult(forceRefresh)).data;

export const fetchMcpServerListResult = async (
  forceRefresh: boolean = false,
): Promise<MarketLoadResult<Plugin[]>> => {
  const { setMarketMcpServers } = useSettingsStore.getState();
  const cache = getMcpCacheSnapshot();

  if (!forceRefresh && cache?.fresh) {
    logDevInfo("Using cached MCP server data");
    return {
      data: cache.plugins,
      status: "cache",
      source: "mcp:cache",
      fetchedAt: cache.fetchedAt,
    };
  }

  if (!forceRefresh && mcpServerListRequest) {
    logDevInfo("Reusing in-flight MCP server request");
    return mcpServerListRequest;
  }

  const request = (async () => {
    try {
      logDevInfo("Fetching MCP servers from registry...");
      const pageResult = await fetchMcpServerPageFromSources(
        { forceRefresh: true, limit: MARKET_LIMITS.maxPlugins },
        buildMcpServerPageUrl({ limit: MARKET_LIMITS.maxPlugins }),
      );
      const plugins = pageResult.data.plugins;

      setMarketMcpServers(plugins);
      logDevInfo(`Cached ${plugins.length} MCP servers`);
      return {
        ...pageResult,
        data: plugins,
      } satisfies MarketLoadResult<Plugin[]>;
    } catch (error) {
      logDevError("Error fetching MCP server list:", error);
      const marketError = toMarketLoadError(
        error,
        "Failed to fetch MCP servers",
      );
      if (cache) {
        logDevWarn("Using stale MCP cache due to fetch error");
        return {
          data: cache.plugins,
          status: "stale",
          source: "mcp:cache",
          fetchedAt: cache.fetchedAt,
          error: marketError,
        } satisfies MarketLoadResult<Plugin[]>;
      }
      return {
        data: [],
        status: "error",
        source: "mcp:api",
        error: marketError,
      } satisfies MarketLoadResult<Plugin[]>;
    }
  })();

  mcpServerListRequest = request;

  try {
    return await request;
  } finally {
    if (mcpServerListRequest === request) {
      mcpServerListRequest = null;
    }
  }
};

export const fetchMcpServerList = async (
  forceRefresh: boolean = false,
): Promise<Plugin[]> => (await fetchMcpServerListResult(forceRefresh)).data;

function buildMcpServerPageUrl(options: McpServerPageOptions): string {
  const params = new URLSearchParams();
  const cursor = options.cursor?.trim();
  const search = options.search?.trim();
  const limit = options.limit;

  if (cursor) params.set("cursor", cursor);
  if (search) params.set("search", search);
  if (Number.isFinite(limit) && limit && limit > 0) {
    params.set("limit", String(Math.floor(limit)));
  }

  const query = params.toString();
  return query ? `/api/mcp/servers?${query}` : "/api/mcp/servers";
}

async function fetchMcpRegistryServerPage(
  options: McpServerPageOptions = {},
): Promise<McpServerPage> {
  const pageLimit = getMcpServerPageLimit(options.limit);
  const search = options.search?.trim().slice(0, 120) || "";
  const plugins: Plugin[] = [];
  let cursor = options.cursor?.trim().slice(0, 512) || "";
  let nextCursor = "";

  for (
    let page = 0;
    page < MCP_REGISTRY_MAX_UPSTREAM_PAGES_PER_REQUEST &&
    plugins.length < pageLimit;
    page += 1
  ) {
    const response = await fetch(
      buildMcpRegistryServersUrl({ cursor, search }),
      {
        method: "GET",
      },
    );
    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "Failed to fetch MCP servers"),
      );
    }

    const data = await readJsonResponseOrThrow<unknown>(
      response,
      "Failed to fetch MCP servers",
    );
    plugins.push(
      ...normalizeMcpRegistryServers(data, {
        maxServers: pageLimit - plugins.length,
      }),
    );

    nextCursor = getMcpRegistryNextCursor(data);
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return {
    plugins,
    ...(nextCursor ? { nextCursor } : {}),
  };
}

async function fetchMcpServerPageFromApi(
  requestUrl: string,
): Promise<McpServerPage> {
  const response = await signedApiFetch(requestUrl);
  if (!response.ok) {
    throw new Error(
      await getResponseErrorMessage(response, "Failed to fetch MCP servers"),
    );
  }

  const data = await readJsonResponseOrThrow<{
    plugins?: Plugin[];
    nextCursor?: string;
  }>(response, "Failed to fetch MCP servers");
  const plugins = normalizeMarketPlugins(data.plugins);

  return {
    plugins,
    ...(data.nextCursor ? { nextCursor: data.nextCursor } : {}),
  };
}

async function fetchMcpServerPageFromSources(
  options: McpServerPageOptions,
  fallbackUrl: string,
): Promise<MarketLoadResult<McpServerPage>> {
  try {
    logDevInfo("Fetching MCP server page from API route...");
    return {
      data: await fetchMcpServerPageFromApi(fallbackUrl),
      status: "fresh",
      source: "mcp:api",
      fetchedAt: Date.now(),
    };
  } catch (error) {
    logDevWarn("Falling back to direct MCP registry fetch");
    logDevError("Error fetching MCP server page from API route:", error);
    return {
      data: await fetchMcpRegistryServerPage(options),
      status: "fallback",
      source: "mcp:registry-direct",
      fetchedAt: Date.now(),
      error: toMarketLoadError(error, "MCP API route is unavailable"),
    };
  }
}

export const fetchMcpServerPageResult = async (
  options: McpServerPageOptions = {},
): Promise<MarketLoadResult<McpServerPage>> => {
  const { setMarketMcpServers } = useSettingsStore.getState();
  const cache = getMcpCacheSnapshot();
  const requestUrl = buildMcpServerPageUrl(options);
  const shouldCacheFirstPage =
    !options.cursor?.trim() && !options.search?.trim();
  const getFallbackServers = (
    error: unknown,
  ): MarketLoadResult<McpServerPage> => {
    logDevError("Error fetching MCP server page:", error);
    const marketError = toMarketLoadError(error, "Failed to fetch MCP servers");
    if (shouldCacheFirstPage && cache) {
      logDevWarn("Using stale MCP cache due to paged fetch error");
      return {
        data: { plugins: cache.plugins },
        status: "stale",
        source: "mcp:cache",
        fetchedAt: cache.fetchedAt,
        error: marketError,
      };
    }
    return {
      data: { plugins: [] },
      status: "error",
      source: "mcp:api",
      error: marketError,
    };
  };

  if (!options.forceRefresh && mcpServerPageRequests.has(requestUrl)) {
    return mcpServerPageRequests.get(requestUrl)!;
  }

  if (!options.forceRefresh && shouldCacheFirstPage && cache?.fresh) {
    logDevInfo("Using cached MCP server page data");
    return {
      data: { plugins: cache.plugins },
      status: "cache",
      source: "mcp:cache",
      fetchedAt: cache.fetchedAt,
    };
  }

  const request = (async () => {
    try {
      const result = await fetchMcpServerPageFromSources(options, requestUrl);

      if (shouldCacheFirstPage) {
        setMarketMcpServers(result.data.plugins);
      }

      return result;
    } catch (error) {
      return getFallbackServers(error);
    }
  })();

  if (!options.forceRefresh) {
    mcpServerPageRequests.set(requestUrl, request);
  }

  try {
    return await request;
  } finally {
    if (mcpServerPageRequests.get(requestUrl) === request) {
      mcpServerPageRequests.delete(requestUrl);
    }
  }
};

export const fetchMcpServerPage = async (
  options: McpServerPageOptions = {},
): Promise<McpServerPage> => (await fetchMcpServerPageResult(options)).data;

export const clearPluginsCache = (): void => {
  useSettingsStore.setState({
    marketPlugins: [],
    marketPluginsTimestamp: 0,
    marketMcpServers: [],
    marketMcpServersTimestamp: 0,
  });
  logDevInfo("Plugins cache cleared");
};

export const installPlugin = async (plugin: Plugin): Promise<Plugin> => {
  try {
    const response = await signedApiFetch("/api/plugins/install", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plugin }),
    });

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(response, "Failed to install plugin"),
      );
    }

    const data = await readJsonResponseOrThrow<{ plugin: Plugin }>(
      response,
      "Failed to install plugin",
    );
    return data.plugin;
  } catch (error) {
    logDevError(`Failed to install plugin ${plugin.id}:`, error);
    throw error;
  }
};

export const installCustomPlugin = async (input: string): Promise<Plugin> => {
  try {
    const response = await signedApiFetch("/api/plugins/install", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ customInput: input }),
    });

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(
          response,
          "Failed to install custom plugin",
        ),
      );
    }

    const data = await readJsonResponseOrThrow<{ plugin: Plugin }>(
      response,
      "Failed to install custom plugin",
    );
    return data.plugin;
  } catch (error) {
    logDevError("Failed to install custom plugin:", error);
    throw error;
  }
};

export const installCustomMcpServer = async (
  input: CustomMcpServerInstallInput,
): Promise<Plugin> => {
  const plugin = createCustomMcpPlugin(input);
  const bearerToken = input.bearerToken?.trim();
  const valueSecret = bearerToken
    ? await encryptSecret(bearerToken, BYOK_CONTEXTS.pluginAuth(plugin.id))
    : undefined;
  const authConfig = valueSecret
    ? {
        type: "bearer" as const,
        key: "Authorization",
        addTo: "header" as const,
        valueSecret,
      }
    : undefined;

  try {
    const response = await signedApiFetch("/api/plugins/install", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plugin,
        ...(authConfig ? { authConfig } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(
        await getResponseErrorMessage(
          response,
          "Failed to install custom MCP server",
        ),
      );
    }

    const data = await readJsonResponseOrThrow<{ plugin: Plugin }>(
      response,
      "Failed to install custom MCP server",
    );
    return data.plugin;
  } catch (error) {
    logDevError(`Failed to install custom MCP server ${plugin.id}:`, error);
    throw error;
  }
};
