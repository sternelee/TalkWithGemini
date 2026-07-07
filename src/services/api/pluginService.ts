import { Plugin } from "@/types";
import { useSettingsStore } from "@/store/core/settingsStore";
import {
  getResponseErrorMessage,
  readJsonResponseOrThrow,
  signedApiFetch,
} from "../../lib/api/client";
import { normalizeMarketPlugins } from "../../lib/market/plugins";
import { logDevError, logDevInfo, logDevWarn } from "../../lib/utils/devLogger";
import { CACHE_CONFIG } from "../../config/api";

let pluginListRequest: Promise<Plugin[]> | null = null;

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

export const clearPluginsCache = (): void => {
  const { setMarketPlugins } = useSettingsStore.getState();
  setMarketPlugins([]);
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

    if (!response.ok) throw new Error("Failed to install plugin");

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
