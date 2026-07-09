import { useSettingsStore } from "@/store/core/settingsStore";
import { logDevInfo } from "../lib/utils/devLogger";
import { CACHE_CONFIG } from "../config/api";

export interface CacheStatus {
  hasCache: boolean;
  isExpired: boolean;
  age: number; // milliseconds
  ageFormatted: string;
}

/**
 * Get cache status for plugins
 */
export const getPluginsCacheStatus = (): CacheStatus => {
  const { marketPlugins, marketPluginsTimestamp } = useSettingsStore.getState();
  const now = Date.now();
  const age = marketPluginsTimestamp ? now - marketPluginsTimestamp : 0;
  const hasCache = marketPlugins && marketPlugins.length > 0;
  const isExpired = age > CACHE_CONFIG.plugins;

  return {
    hasCache,
    isExpired,
    age,
    ageFormatted: formatCacheAge(age),
  };
};

/**
 * Get cache status for agents
 */
export const getAgentsCacheStatus = (): CacheStatus => {
  const { marketAgents, marketAgentsTimestamp } = useSettingsStore.getState();
  const now = Date.now();
  const age = marketAgentsTimestamp ? now - marketAgentsTimestamp : 0;
  const hasCache = marketAgents && marketAgents.length > 0;
  const isExpired = age > CACHE_CONFIG.agents;

  return {
    hasCache,
    isExpired,
    age,
    ageFormatted: formatCacheAge(age),
  };
};

/**
 * Format cache age in human-readable format
 */
function formatCacheAge(milliseconds: number): string {
  if (milliseconds === 0) return "No cache";

  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return `${seconds} second${seconds !== 1 ? "s" : ""} ago`;
}

/**
 * Clear all market data cache
 */
export const clearAllMarketCache = (): void => {
  const { setMarketPlugins, setMarketMcpServers, setMarketAgents } =
    useSettingsStore.getState();
  setMarketPlugins([]);
  setMarketMcpServers([]);
  setMarketAgents([]);
  logDevInfo("All market cache cleared");
};
