import { LobeAgent } from "@/types";
import { useSettingsStore } from "@/store/core/settingsStore";
import { readJsonResponseOrThrow, signedApiFetch } from "@/lib/api/client";
import {
  normalizeAgentDetail,
  normalizeMarketAgents,
} from "@/lib/market/agents";
import {
  normalizeAgentMarketLocale,
  type AgentMarketLocale,
} from "@/lib/market/agentLocale";
import { logDevError, logDevInfo, logDevWarn } from "@/lib/utils/devLogger";
import { CACHE_CONFIG } from "@/config/api";
import {
  toMarketLoadError,
  type MarketLoadResult,
} from "@/lib/market/loadResult";

const CACHE_DURATION = CACHE_CONFIG.agents;

type AgentListResponse = {
  agents?: LobeAgent[];
  unavailable?: boolean;
};

const agentListRequests = new Map<
  AgentMarketLocale,
  Promise<MarketLoadResult<LobeAgent[]>>
>();

function getAgentCacheSnapshot(locale: AgentMarketLocale): {
  agents: LobeAgent[];
  fetchedAt: number;
  fresh: boolean;
} | null {
  const { marketAgents, marketAgentsTimestamp, marketAgentsLocale } =
    useSettingsStore.getState();

  if (
    !Array.isArray(marketAgents) ||
    !marketAgentsTimestamp ||
    marketAgentsLocale !== locale
  ) {
    return null;
  }

  return {
    agents: normalizeMarketAgents(marketAgents),
    fetchedAt: marketAgentsTimestamp,
    fresh: Date.now() - marketAgentsTimestamp < CACHE_DURATION,
  };
}

export const getCachedAgentsForLocale = (
  requestedLocale: string = "en",
): LobeAgent[] => {
  const locale = normalizeAgentMarketLocale(requestedLocale);
  const cache = getAgentCacheSnapshot(locale);
  return cache?.fresh ? cache.agents : [];
};

export const getAgentsResult = async (
  forceRefresh: boolean = false,
  requestedLocale: string = "en",
): Promise<MarketLoadResult<LobeAgent[]>> => {
  const locale = normalizeAgentMarketLocale(requestedLocale);
  const { setMarketAgents } = useSettingsStore.getState();
  const cache = getAgentCacheSnapshot(locale);

  if (!forceRefresh && cache?.fresh) {
    logDevInfo("Using cached agents data");
    return {
      data: cache.agents,
      status: "cache",
      source: `agents:${locale}:cache`,
      fetchedAt: cache.fetchedAt,
    };
  }

  const inFlightRequest = agentListRequests.get(locale);
  if (!forceRefresh && inFlightRequest) {
    logDevInfo("Reusing in-flight agents request");
    return inFlightRequest;
  }

  const request = (async () => {
    try {
      logDevInfo("Fetching agents from API...");
      const response = await signedApiFetch(`/api/agents?locale=${locale}`);
      if (!response.ok) throw new Error("Failed to fetch agents");

      const data = await readJsonResponseOrThrow<AgentListResponse>(
        response,
        "Failed to fetch agents",
      );
      if (data.unavailable) {
        const error = toMarketLoadError(
          new Error("Assistant registry is unavailable"),
          "Assistant registry is unavailable",
        );
        if (cache) {
          logDevWarn("Using stale cache because agent registry is unavailable");
          return {
            data: cache.agents,
            status: "stale",
            source: `agents:${locale}:cache`,
            fetchedAt: cache.fetchedAt,
            error,
          } satisfies MarketLoadResult<LobeAgent[]>;
        }
        return {
          data: [],
          status: "error",
          source: `agents:${locale}:api`,
          error,
        } satisfies MarketLoadResult<LobeAgent[]>;
      }

      const agents: LobeAgent[] = normalizeMarketAgents(data.agents);
      const fetchedAt = Date.now();
      setMarketAgents(agents, locale);
      logDevInfo(`Cached ${agents.length} agents`);
      return {
        data: agents,
        status: "fresh",
        source: `agents:${locale}:api`,
        fetchedAt,
      } satisfies MarketLoadResult<LobeAgent[]>;
    } catch (error) {
      logDevError("Error fetching agents:", error);
      const marketError = toMarketLoadError(error, "Failed to fetch agents");
      if (cache) {
        logDevWarn("Using stale cache due to fetch error");
        return {
          data: cache.agents,
          status: "stale",
          source: `agents:${locale}:cache`,
          fetchedAt: cache.fetchedAt,
          error: marketError,
        } satisfies MarketLoadResult<LobeAgent[]>;
      }
      return {
        data: [],
        status: "error",
        source: `agents:${locale}:api`,
        error: marketError,
      } satisfies MarketLoadResult<LobeAgent[]>;
    }
  })();

  agentListRequests.set(locale, request);

  try {
    return await request;
  } finally {
    if (agentListRequests.get(locale) === request) {
      agentListRequests.delete(locale);
    }
  }
};

export const getAgents = async (
  forceRefresh: boolean = false,
  requestedLocale: string = "en",
): Promise<LobeAgent[]> =>
  (await getAgentsResult(forceRefresh, requestedLocale)).data;

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
