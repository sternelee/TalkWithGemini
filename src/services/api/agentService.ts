import { LobeAgent } from "@/types";
import { useSettingsStore } from "@/store/core/settingsStore";
import { readJsonResponseOrThrow, signedApiFetch } from "../../lib/api/client";
import {
  normalizeAgentDetail,
  normalizeMarketAgents,
} from "../../lib/market/agents";
import {
  normalizeAgentMarketLocale,
  type AgentMarketLocale,
} from "../../lib/market/agentLocale";
import { logDevError, logDevInfo, logDevWarn } from "../../lib/utils/devLogger";
import { CACHE_CONFIG } from "../../config/api";

const CACHE_DURATION = CACHE_CONFIG.agents;

type AgentListResponse = {
  agents?: LobeAgent[];
  unavailable?: boolean;
};

const agentListRequests = new Map<AgentMarketLocale, Promise<LobeAgent[]>>();

export const getCachedAgentsForLocale = (
  requestedLocale: string = "en",
): LobeAgent[] => {
  const locale = normalizeAgentMarketLocale(requestedLocale);
  const { marketAgents, marketAgentsTimestamp, marketAgentsLocale } =
    useSettingsStore.getState();

  if (
    !marketAgents ||
    marketAgents.length === 0 ||
    !marketAgentsTimestamp ||
    marketAgentsLocale !== locale
  ) {
    return [];
  }

  if (Date.now() - marketAgentsTimestamp >= CACHE_DURATION) {
    return [];
  }

  return normalizeMarketAgents(marketAgents);
};

export const getAgents = async (
  forceRefresh: boolean = false,
  requestedLocale: string = "en",
): Promise<LobeAgent[]> => {
  const locale = normalizeAgentMarketLocale(requestedLocale);
  const {
    marketAgents,
    marketAgentsTimestamp,
    marketAgentsLocale,
    setMarketAgents,
  } = useSettingsStore.getState();
  const now = Date.now();
  const getStaleAgents = () =>
    marketAgentsLocale === locale && marketAgents && marketAgents.length > 0
      ? normalizeMarketAgents(marketAgents)
      : [];

  const cachedAgents = getCachedAgentsForLocale(locale);
  if (!forceRefresh && cachedAgents.length > 0) {
    logDevInfo("Using cached agents data");
    return cachedAgents;
  }

  // Check cache validity (skip if force refresh)
  if (
    !forceRefresh &&
    marketAgents &&
    marketAgents.length > 0 &&
    marketAgentsTimestamp &&
    marketAgentsLocale === locale
  ) {
    if (now - marketAgentsTimestamp < CACHE_DURATION) {
      logDevInfo("Using cached agents data");
      return normalizeMarketAgents(marketAgents);
    }
  }

  const inFlightRequest = agentListRequests.get(locale);
  if (!forceRefresh && inFlightRequest) {
    logDevInfo("Reusing in-flight agents request");
    try {
      return await inFlightRequest;
    } catch (error) {
      logDevError("Error fetching agents:", error);
      const staleAgents = getStaleAgents();
      if (staleAgents.length > 0) {
        logDevWarn("Using stale cache due to fetch error");
      }
      return staleAgents;
    }
  }

  const request = (async () => {
    logDevInfo("Fetching agents from API...");
    const response = await signedApiFetch(`/api/agents?locale=${locale}`);
    if (!response.ok) throw new Error("Failed to fetch agents");

    const data = await readJsonResponseOrThrow<AgentListResponse>(
      response,
      "Failed to fetch agents",
    );
    if (data.unavailable) {
      const staleAgents = getStaleAgents();
      if (staleAgents.length > 0) {
        logDevWarn("Using stale cache because agent registry is unavailable");
      }
      return staleAgents;
    }

    const agents: LobeAgent[] = normalizeMarketAgents(data.agents);

    setMarketAgents(agents, locale);
    logDevInfo(`Cached ${agents.length} agents`);
    return agents;
  })();

  agentListRequests.set(locale, request);

  try {
    return await request;
  } catch (error) {
    logDevError("Error fetching agents:", error);
    // Return stale cache if available
    const staleAgents = getStaleAgents();
    if (staleAgents.length > 0) {
      logDevWarn("Using stale cache due to fetch error");
    }
    return staleAgents;
  } finally {
    if (agentListRequests.get(locale) === request) {
      agentListRequests.delete(locale);
    }
  }
};

export const clearAgentsCache = (): void => {
  const { setMarketAgents } = useSettingsStore.getState();
  setMarketAgents([]);
  logDevInfo("Agents cache cleared");
};

export const getAgentDetail = async (
  identifier: string,
  requestedLocale: string = "en",
): Promise<any> => {
  const locale = normalizeAgentMarketLocale(requestedLocale);
  try {
    const response = await signedApiFetch(
      `/api/agents/${encodeURIComponent(identifier)}?locale=${locale}`,
    );
    if (!response.ok) throw new Error("Failed to fetch agent details");
    const data = await readJsonResponseOrThrow(
      response,
      "Failed to fetch agent details",
    );
    const agent = normalizeAgentDetail(data, identifier);
    if (!agent) throw new Error("Invalid agent detail response");
    return agent;
  } catch (error) {
    logDevError(`Error fetching detail for ${identifier}:`, error);
    throw error;
  }
};

export const getRandomAgents = (
  agents: LobeAgent[],
  count: number = 4,
): LobeAgent[] => {
  if (!agents || agents.length === 0) return [];
  const shuffled = [...agents].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};
