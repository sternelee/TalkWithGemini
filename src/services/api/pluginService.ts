import { Plugin } from "@/types";
import { useSettingsStore } from "@/store/core/settingsStore";
import { encryptSecret } from "../../lib/byok/client";
import { BYOK_CONTEXTS } from "../../lib/byok/shared";
import {
  getResponseErrorMessage,
  readJsonResponseOrThrow,
  signedApiFetch,
} from "../../lib/api/client";
import { normalizeMarketPlugins } from "../../lib/market/plugins";
import {
  MCP_REGISTRY_BASE_URL,
  normalizeMcpRegistryServers,
} from "../../lib/mcp/registry";
import { logDevError, logDevInfo, logDevWarn } from "../../lib/utils/devLogger";
import { CACHE_CONFIG } from "../../config/api";
import { MARKET_LIMITS } from "../../config/limits";

let pluginListRequest: Promise<Plugin[]> | null = null;
let mcpServerListRequest: Promise<Plugin[]> | null = null;
const mcpServerPageRequests = new Map<string, Promise<McpServerPage>>();
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
    throw new Error("MCP server URL must be a valid HTTPS URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("MCP server URL must use HTTPS.");
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
    logoUrl: "",
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
  const { marketPlugins, marketPluginsTimestamp } = useSettingsStore.getState();

  if (!marketPlugins || marketPlugins.length === 0 || !marketPluginsTimestamp) {
    return [];
  }

  if (Date.now() - marketPluginsTimestamp >= CACHE_CONFIG.plugins) {
    return [];
  }

  return normalizeMarketPlugins(marketPlugins);
};

export const getCachedMcpServers = (): Plugin[] => {
  const { marketMcpServers, marketMcpServersTimestamp } =
    useSettingsStore.getState();

  if (
    !marketMcpServers ||
    marketMcpServers.length === 0 ||
    !marketMcpServersTimestamp
  ) {
    return [];
  }

  if (Date.now() - marketMcpServersTimestamp >= CACHE_CONFIG.plugins) {
    return [];
  }

  return normalizeMarketPlugins(marketMcpServers);
};

export const fetchApiGuruList = async (
  forceRefresh: boolean = false,
): Promise<Plugin[]> => {
  const { marketPlugins, marketPluginsTimestamp, setMarketPlugins } =
    useSettingsStore.getState();
  const now = Date.now();
  const getFallbackPlugins = (error: unknown): Plugin[] => {
    logDevError("Error fetching plugin list:", error);
    // Return stale cache if available
    if (marketPlugins && marketPlugins.length > 0) {
      logDevWarn("Using stale cache due to fetch error");
      return normalizeMarketPlugins(marketPlugins);
    }
    return [];
  };

  const cachedPlugins = getCachedPlugins();
  if (!forceRefresh && cachedPlugins.length > 0) {
    logDevInfo("Using cached plugins data");
    return cachedPlugins;
  }

  // Check cache validity (skip if force refresh)
  if (
    !forceRefresh &&
    marketPlugins &&
    marketPlugins.length > 0 &&
    marketPluginsTimestamp
  ) {
    if (now - marketPluginsTimestamp < CACHE_CONFIG.plugins) {
      logDevInfo("Using cached plugins data");
      return normalizeMarketPlugins(marketPlugins);
    }
  }

  if (!forceRefresh && pluginListRequest) {
    logDevInfo("Reusing in-flight plugins request");
    try {
      return await pluginListRequest;
    } catch (error) {
      return getFallbackPlugins(error);
    }
  }

  const request = (async () => {
    logDevInfo("Fetching plugins from API...");
    const response = await signedApiFetch("/api/plugins/list");
    if (!response.ok) throw new Error("Failed to fetch plugins");

    const data = await readJsonResponseOrThrow<{ plugins?: Plugin[] }>(
      response,
      "Failed to fetch plugins",
    );
    const plugins: Plugin[] = normalizeMarketPlugins(data.plugins);

    setMarketPlugins(plugins);
    logDevInfo(`Cached ${plugins.length} plugins`);
    return plugins;
  })();

  pluginListRequest = request;

  try {
    return await request;
  } catch (error) {
    return getFallbackPlugins(error);
  } finally {
    if (pluginListRequest === request) {
      pluginListRequest = null;
    }
  }
};

export const fetchMcpServerList = async (
  forceRefresh: boolean = false,
): Promise<Plugin[]> => {
  const { marketMcpServers, marketMcpServersTimestamp, setMarketMcpServers } =
    useSettingsStore.getState();
  const now = Date.now();
  const getFallbackServers = (error: unknown): Plugin[] => {
    logDevError("Error fetching MCP server list:", error);
    if (marketMcpServers && marketMcpServers.length > 0) {
      logDevWarn("Using stale MCP cache due to fetch error");
      return normalizeMarketPlugins(marketMcpServers);
    }
    return [];
  };

  const cachedServers = getCachedMcpServers();
  if (!forceRefresh && cachedServers.length > 0) {
    logDevInfo("Using cached MCP server data");
    return cachedServers;
  }

  if (
    !forceRefresh &&
    marketMcpServers &&
    marketMcpServers.length > 0 &&
    marketMcpServersTimestamp
  ) {
    if (now - marketMcpServersTimestamp < CACHE_CONFIG.plugins) {
      logDevInfo("Using cached MCP server data");
      return normalizeMarketPlugins(marketMcpServers);
    }
  }

  if (!forceRefresh && mcpServerListRequest) {
    logDevInfo("Reusing in-flight MCP server request");
    try {
      return await mcpServerListRequest;
    } catch (error) {
      return getFallbackServers(error);
    }
  }

  const request = (async () => {
    logDevInfo("Fetching MCP servers from registry...");
    const page = await fetchMcpServerPageFromSources(
      { forceRefresh: true, limit: MARKET_LIMITS.maxPlugins },
      buildMcpServerPageUrl({ limit: MARKET_LIMITS.maxPlugins }),
    );
    const plugins = page.plugins;

    setMarketMcpServers(plugins);
    logDevInfo(`Cached ${plugins.length} MCP servers`);
    return plugins;
  })();

  mcpServerListRequest = request;

  try {
    return await request;
  } catch (error) {
    return getFallbackServers(error);
  } finally {
    if (mcpServerListRequest === request) {
      mcpServerListRequest = null;
    }
  }
};

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
): Promise<McpServerPage> {
  try {
    logDevInfo("Fetching MCP server page from registry...");
    return await fetchMcpRegistryServerPage(options);
  } catch (error) {
    logDevWarn("Falling back to MCP server API route");
    logDevError("Error fetching MCP registry page:", error);
    return fetchMcpServerPageFromApi(fallbackUrl);
  }
}

export const fetchMcpServerPage = async (
  options: McpServerPageOptions = {},
): Promise<McpServerPage> => {
  const { marketMcpServers, setMarketMcpServers } = useSettingsStore.getState();
  const requestUrl = buildMcpServerPageUrl(options);
  const shouldCacheFirstPage =
    !options.cursor?.trim() && !options.search?.trim();
  const getFallbackServers = (error: unknown): McpServerPage => {
    logDevError("Error fetching MCP server page:", error);
    if (shouldCacheFirstPage && marketMcpServers?.length > 0) {
      logDevWarn("Using stale MCP cache due to paged fetch error");
      return { plugins: normalizeMarketPlugins(marketMcpServers) };
    }
    return { plugins: [] };
  };

  if (!options.forceRefresh && mcpServerPageRequests.has(requestUrl)) {
    try {
      return await mcpServerPageRequests.get(requestUrl)!;
    } catch (error) {
      return getFallbackServers(error);
    }
  }

  const request = (async () => {
    const page = await fetchMcpServerPageFromSources(options, requestUrl);

    if (shouldCacheFirstPage) {
      setMarketMcpServers(page.plugins);
    }

    return page;
  })();

  if (!options.forceRefresh) {
    mcpServerPageRequests.set(requestUrl, request);
  }

  try {
    return await request;
  } catch (error) {
    return getFallbackServers(error);
  } finally {
    if (mcpServerPageRequests.get(requestUrl) === request) {
      mcpServerPageRequests.delete(requestUrl);
    }
  }
};

export const clearPluginsCache = (): void => {
  const { setMarketPlugins, setMarketMcpServers } = useSettingsStore.getState();
  setMarketPlugins([]);
  setMarketMcpServers([]);
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
