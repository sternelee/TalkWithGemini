import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  ModelMetadata,
  SearchProviderID,
  SearchServiceConfig,
  Plugin,
  PluginConfig,
  LobeAgent,
  VoiceSettings,
  SystemSettings,
  RAGConfig,
  DefaultModels,
} from "@/types";
import {
  AGNES_IMAGE_PLUGIN,
  AGNES_VIDEO_PLUGIN,
  JINA_READER_PLUGIN,
  WEATHER_PLUGIN,
  UNSPLASH_PLUGIN,
} from "@/config/plugins";
import { DEFAULT_SYSTEM_SETTINGS } from "@/config/defaults";
import { PublicServerConfig } from "@/lib/defaultConfig/shared";
import {
  STORAGE_KEYS,
  STORAGE_VERSION,
  getAppDbStorage,
} from "../storage/storageConfig";
import { CACHE_CONFIG } from "@/config/api";
import { useCoreSettingsStore } from "./coreSettingsStore";
import { normalizeProviderBaseUrl } from "@/lib/security/urlPolicy";
import {
  normalizeAgentOverrides,
  normalizeLocalAgent,
  normalizeLocalAgents,
  normalizeMarketAgents,
} from "@/lib/market/agents";
import type { AgentMarketLocale } from "@/lib/market/agentLocale";
import { MARKET_LIMITS } from "@/config/limits";
import {
  extractKnownProviderModelMetadata,
  normalizeModelMetadata,
  normalizeModelMetadataMap,
} from "@/lib/providers/metadata";
import { logDevError } from "../../lib/utils/devLogger";
import {
  normalizeRAGConfig,
  normalizeSearchConfig,
  normalizeSearchProvider,
  normalizeSearchSettings,
} from "../../lib/settings/searchRag";
import { getDefaultModelSelectValue } from "../../lib/utils/defaultModels";
import { readJsonResponseOrThrow } from "../../lib/api/client";
import {
  isPluginAuthRequired,
  normalizeActivePluginIds,
  normalizePluginConfig,
  normalizePluginConfigs,
} from "../../lib/plugin/config";
import { normalizeSystemSettings } from "../../lib/settings/appConfig";
import { clearBrowserAppData } from "../../lib/data/clearAppData";
import {
  createBrowserAppExportPayload,
  type AppExportPayload,
} from "../../lib/data/appExport";
import {
  hasRagToken,
  hasLlamaParseApiKey,
  hasPluginAuthValue,
} from "../../lib/security/localSecretResolvers";
import {
  migratePluginConfigLocalSecrets,
  migrateRAGLocalSecrets,
  migrateSearchLocalSecrets,
  migrateVoiceLocalSecrets,
  stripPluginConfigPlainSecrets,
  stripRAGPlainSecrets,
  stripSearchPlainSecrets,
  stripVoicePlainSecrets,
} from "../../lib/settings/localSecretMigration";

interface SettingsState {
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  serverConfig: PublicServerConfig | null;
  applyServerConfig: (config: PublicServerConfig) => void;

  // Market Cache
  marketPlugins: Plugin[];
  marketPluginsTimestamp: number;
  marketAgents: LobeAgent[];
  marketAgentsTimestamp: number;
  marketAgentsLocale: AgentMarketLocale | "";
  setMarketPlugins: (plugins: Plugin[]) => void;
  setMarketAgents: (
    agents: LobeAgent[],
    locale?: AgentMarketLocale | "",
  ) => void;

  // System Settings
  system: SystemSettings;
  updateSystemSettings: (settings: Partial<SystemSettings>) => void;

  // Model Metadata
  modelMetadata: Record<string, ModelMetadata>;
  modelMetadataTimestamp: number;
  customModelMetadata: Record<string, ModelMetadata>;
  setCustomModelMetadata: (id: string, meta: ModelMetadata) => void;
  fetchModelMetadata: (forceRefresh?: boolean) => Promise<void>;

  // Search Settings
  search: {
    provider: SearchProviderID;
    resultsLimit: number;
    configs: Record<string, SearchServiceConfig>;
  };
  setSearchProvider: (provider: SearchProviderID) => void;
  updateSearchConfig: (
    provider: string,
    config: Partial<SearchServiceConfig>,
  ) => void;
  setSearchResultsLimit: (limit: number) => void;

  // RAG Settings
  rag: RAGConfig;
  updateRAGConfig: (config: Partial<RAGConfig>) => void;

  // Voice Settings
  voice: VoiceSettings;
  updateVoiceSettings: (settings: Partial<VoiceSettings>) => void;

  // Plugin Management
  activePlugins: string[];
  installedPlugins: Plugin[];
  pluginConfigs: Record<string, PluginConfig>;
  addInstalledPlugin: (plugin: Plugin) => void;
  removeInstalledPlugin: (pluginId: string) => void;
  setActivePlugins: (pluginIds: string[]) => void;
  togglePluginActive: (pluginId: string) => void;
  updatePluginConfig: (pluginId: string, config: Partial<PluginConfig>) => void;
  togglePluginFunction: (pluginId: string, functionName: string) => void;
  ensureBuiltInPlugins: () => void;

  // Agent Management
  customAgents: LobeAgent[];
  usedAgents: LobeAgent[];
  agentOverrides: Record<string, Partial<LobeAgent>>;
  addCustomAgent: (agent: LobeAgent) => void;
  updateAgent: (
    identifier: string,
    updates: Partial<LobeAgent>,
    isCustom: boolean,
  ) => void;
  removeLocalAgent: (identifier: string) => void;
  recordUsedAgent: (agent: LobeAgent) => void;
  resetAgent: (identifier: string) => void;

  // Data Management
  exportAllData: () => Promise<AppExportPayload>;
  clearAllData: () => Promise<void>;
}

// 内置插件列表
const BUILT_IN_PLUGINS = [
  JINA_READER_PLUGIN,
  WEATHER_PLUGIN,
  UNSPLASH_PLUGIN,
  AGNES_IMAGE_PLUGIN,
  AGNES_VIDEO_PLUGIN,
] as const;
const BUILT_IN_PLUGINS_BY_ID = new Map(
  BUILT_IN_PLUGINS.map((plugin) => [plugin.id, plugin]),
);
const REMOVED_BUILT_IN_PLUGIN_IDS = new Set(["image-generation"]);

const removeRemovedBuiltInPlugins = (plugins: readonly Plugin[]): Plugin[] =>
  plugins.filter((plugin) => !REMOVED_BUILT_IN_PLUGIN_IDS.has(plugin.id));

const refreshBuiltInPluginDefinitions = (
  plugins: readonly Plugin[],
): Plugin[] =>
  plugins.map((plugin) => {
    const currentBuiltIn = BUILT_IN_PLUGINS_BY_ID.get(plugin.id);
    if (!currentBuiltIn || !plugin.builtIn) return plugin;
    const refreshedPlugin = {
      ...currentBuiltIn,
      added: plugin.added || currentBuiltIn.added,
    };
    return JSON.stringify(plugin) === JSON.stringify(refreshedPlugin)
      ? plugin
      : refreshedPlugin;
  });

// 插件配置初始化
const initPluginConfig = (): PluginConfig => ({
  disabledFunctions: [],
});

// 检查插件是否需要认证
// 检查插件是否可以自动激活
const canAutoActivatePlugin = (
  plugin: Plugin,
  config: PluginConfig | undefined,
): boolean => {
  const needsAuth = isPluginAuthRequired(plugin);
  return (
    !needsAuth ||
    hasPluginAuthValue(config?.auth) ||
    plugin.id === UNSPLASH_PLUGIN.id
  );
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      serverConfig: null,
      applyServerConfig: (config) =>
        set((state) => {
          const hadDefaultSearch =
            state.search.configs.default?.serverAvailable !== undefined;
          const shouldUseDefaultSearch =
            config.search.available &&
            !hadDefaultSearch &&
            state.search.provider === "firecrawl";

          const hasLocalRagVectorStore =
            Boolean(state.rag.url?.trim()) || hasRagToken(state.rag);
          const shouldUseDefaultVectorStore =
            config.rag.vectorStoreAvailable &&
            state.rag.useDefaultVectorStore === undefined &&
            !hasLocalRagVectorStore;
          const shouldUseDefaultDocumentProcessing =
            config.rag.documentProcessingAvailable &&
            state.rag.useDefaultDocumentProcessing === undefined &&
            !hasLlamaParseApiKey(state.rag);

          const hasServerVoiceConfig =
            state.voice.serverDefaultVoiceProvider !== undefined ||
            state.voice.serverElevenLabsAvailable !== undefined ||
            state.voice.serverMimoAvailable !== undefined;
          const shouldUseDefaultStt =
            Boolean(config.voice.defaultProvider) &&
            !hasServerVoiceConfig &&
            state.voice.sttProvider === "browser";
          const shouldUseDefaultTts =
            Boolean(config.voice.defaultProvider) &&
            !hasServerVoiceConfig &&
            state.voice.ttsProvider === "browser";

          const isSystemUnchanged =
            JSON.stringify(state.system) ===
            JSON.stringify(DEFAULT_SYSTEM_SETTINGS);
          const serverModelMetadata = normalizeModelMetadataMap(
            config.modelProvider.modelMetadata,
          );
          const nextCustomModelMetadata = { ...state.customModelMetadata };
          for (const [id, metadata] of Object.entries(serverModelMetadata)) {
            if (!nextCustomModelMetadata[id]) {
              nextCustomModelMetadata[id] = metadata;
            }
          }

          return {
            serverConfig: config,
            customModelMetadata: nextCustomModelMetadata,
            search: normalizeSearchSettings({
              ...state.search,
              provider: shouldUseDefaultSearch
                ? "default"
                : state.search.provider,
              configs: {
                ...state.search.configs,
                default: { serverAvailable: config.search.available },
              },
            }),
            rag: normalizeRAGConfig({
              ...state.rag,
              serverVectorStoreAvailable: config.rag.vectorStoreAvailable,
              serverDocumentProcessingAvailable:
                config.rag.documentProcessingAvailable,
              ...(shouldUseDefaultVectorStore
                ? {
                    enabled: true,
                    useDefaultVectorStore: true,
                    ...(config.rag.topK !== undefined
                      ? { topK: config.rag.topK }
                      : {}),
                    ...(config.rag.chunkSize !== undefined
                      ? { chunkSize: config.rag.chunkSize }
                      : {}),
                    ...(config.rag.namespace
                      ? { namespace: config.rag.namespace }
                      : {}),
                  }
                : {}),
              ...(shouldUseDefaultDocumentProcessing
                ? { useDefaultDocumentProcessing: true }
                : {}),
            }),
            voice: {
              ...state.voice,
              serverDefaultVoiceProvider: config.voice.defaultProvider,
              serverElevenLabsAvailable: config.voice.elevenLabsAvailable,
              serverMimoAvailable: config.voice.mimoAvailable,
              serverMimoSttModel: config.voice.mimoSttModel,
              serverMimoTtsModel: config.voice.mimoTtsModel,
              serverMimoTtsVoiceId: config.voice.mimoTtsVoiceId,
              ...(shouldUseDefaultStt
                ? {
                    sttProvider: "default" as const,
                    sttModel:
                      config.voice.sttModel ||
                      (config.voice.defaultProvider === "mimo"
                        ? config.voice.mimoSttModel || "mimo-v2.5-asr"
                        : "scribe_v2"),
                  }
                : {}),
              ...(shouldUseDefaultTts
                ? {
                    ttsProvider: "default" as const,
                    ...(config.voice.defaultProvider === "mimo"
                      ? {
                          mimoTtsVoiceId:
                            config.voice.mimoTtsVoiceId || "mimo_default",
                        }
                      : {}),
                    ...(config.voice.defaultProvider !== "mimo" &&
                    config.voice.ttsVoiceId
                      ? { ttsVoiceId: config.voice.ttsVoiceId }
                      : {}),
                  }
                : {}),
            },
            ...(config.system && isSystemUnchanged
              ? { system: normalizeSystemSettings(config.system) }
              : {}),
          };
        }),

      // Market Cache
      marketPlugins: [],
      marketPluginsTimestamp: 0,
      marketAgents: [],
      marketAgentsTimestamp: 0,
      marketAgentsLocale: "",
      setMarketPlugins: (plugins) =>
        set({
          marketPlugins: plugins,
          marketPluginsTimestamp: Date.now(),
        }),
      setMarketAgents: (agents, locale = "") =>
        set({
          marketAgents: normalizeMarketAgents(agents),
          marketAgentsTimestamp: Date.now(),
          marketAgentsLocale: locale,
        }),

      // System Settings
      system: DEFAULT_SYSTEM_SETTINGS,
      updateSystemSettings: (settings) =>
        set((state) => ({
          system: normalizeSystemSettings(
            { ...state.system, ...settings },
            DEFAULT_SYSTEM_SETTINGS,
          ),
        })),

      // Model Metadata
      modelMetadata: {},
      modelMetadataTimestamp: 0,
      customModelMetadata: {},
      setCustomModelMetadata: (id, meta) =>
        set((state) => {
          const metadata = normalizeModelMetadata(meta, id);
          if (!metadata) return state;

          return {
            customModelMetadata: {
              ...state.customModelMetadata,
              [metadata.id]: metadata,
            },
          };
        }),

      fetchModelMetadata: async (forceRefresh = false) => {
        const { modelMetadata, modelMetadataTimestamp } = get();
        const now = Date.now();
        if (
          !forceRefresh &&
          Object.keys(modelMetadata).length > 0 &&
          modelMetadataTimestamp &&
          now - modelMetadataTimestamp < CACHE_CONFIG.modelMetadata
        ) {
          return;
        }

        try {
          const response = await fetch(
            "https://basellm.github.io/llm-metadata/api/all.json",
          );
          if (!response.ok) throw new Error("Failed to fetch model metadata");

          const data = await readJsonResponseOrThrow(
            response,
            "Failed to fetch model metadata",
          );
          const newMetadata = extractKnownProviderModelMetadata(data);

          set({ modelMetadata: newMetadata, modelMetadataTimestamp: now });
        } catch (e) {
          logDevError("Error fetching model metadata:", e);
        }
      },

      // Search Settings
      search: {
        provider: "firecrawl",
        resultsLimit: 5,
        configs: {
          tavily: { apiKey: "" },
          firecrawl: { apiKey: "" },
          exa: { apiKey: "" },
          bocha: { apiKey: "" },
          searxng: { baseUrl: "http://localhost:8080" },
        },
      },
      setSearchProvider: (provider) =>
        set((state) => ({
          search: {
            ...state.search,
            provider: normalizeSearchProvider(provider),
          },
        })),
      updateSearchConfig: (provider, config) =>
        set((state) => {
          const normalizedConfig = normalizeSearchConfig(provider, {
            ...state.search.configs[provider],
            ...config,
          });
          if (!normalizedConfig) return state;

          return {
            search: {
              ...state.search,
              configs: {
                ...state.search.configs,
                [provider]: normalizedConfig,
              },
            },
          };
        }),
      setSearchResultsLimit: (limit) =>
        set((state) => ({
          search: normalizeSearchSettings({
            ...state.search,
            resultsLimit: limit,
          }),
        })),

      // RAG Settings
      rag: {
        enabled: false,
        url: "",
        token: "",
        topK: 10,
        chunkSize: 512,
        llamaParseApiKey: "",
      },
      updateRAGConfig: (config) =>
        set((state) => ({
          rag: normalizeRAGConfig({ ...state.rag, ...config }),
        })),

      // Voice Settings
      voice: {
        sttProvider: "browser",
        sttModel: "",
        sttLanguage: "auto",
        ttsProvider: "browser",
        ttsModel: "",
        ttsVoiceId: "bIHbv24MWmeRgasZH58o",
        mimoTtsVoiceId: "mimo_default",
        ttsLanguage: "auto",
        elevenLabsApiKey: "",
        mimoApiKey: "",
        autoTranscribe: true,
      },
      updateVoiceSettings: (settings) =>
        set((state) => ({ voice: { ...state.voice, ...settings } })),

      // Plugin Management
      activePlugins: [],
      installedPlugins: [...BUILT_IN_PLUGINS],
      pluginConfigs: {},

      addInstalledPlugin: (plugin) =>
        set((state) => {
          if (state.installedPlugins.some((p) => p.id === plugin.id)) {
            return state;
          }

          const installedPlugins = [...state.installedPlugins, plugin];
          const config = normalizePluginConfig(
            state.pluginConfigs[plugin.id] || initPluginConfig(),
            plugin.functions?.map((fn) => fn.name),
          );
          const shouldActivate = canAutoActivatePlugin(plugin, config);
          const pluginConfigs = normalizePluginConfigs(
            {
              ...state.pluginConfigs,
              [plugin.id]: config,
            },
            installedPlugins,
          );

          return {
            installedPlugins,
            activePlugins: normalizeActivePluginIds(
              shouldActivate
                ? [...state.activePlugins, plugin.id]
                : state.activePlugins,
              installedPlugins,
              pluginConfigs,
              { unauthenticatedAllowedPluginIds: [UNSPLASH_PLUGIN.id] },
            ),
            pluginConfigs,
          };
        }),

      removeInstalledPlugin: (pluginId) =>
        set((state) => {
          const plugin = state.installedPlugins.find((p) => p.id === pluginId);
          if (plugin?.builtIn) return state;

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [pluginId]: _removed, ...newConfigs } = state.pluginConfigs;
          return {
            installedPlugins: state.installedPlugins.filter(
              (p) => p.id !== pluginId,
            ),
            activePlugins: state.activePlugins.filter((id) => id !== pluginId),
            pluginConfigs: newConfigs,
          };
        }),

      setActivePlugins: (pluginIds) =>
        set((state) => ({
          activePlugins: normalizeActivePluginIds(
            pluginIds,
            state.installedPlugins,
            state.pluginConfigs,
            { unauthenticatedAllowedPluginIds: [UNSPLASH_PLUGIN.id] },
          ),
        })),

      togglePluginActive: (pluginId) =>
        set((state) => {
          const plugin = state.installedPlugins.find((p) => p.id === pluginId);
          if (!plugin) return state;

          const isActive = state.activePlugins.includes(pluginId);

          if (!isActive) {
            if (plugin && isPluginAuthRequired(plugin)) {
              const hasAuth = hasPluginAuthValue(
                state.pluginConfigs[pluginId]?.auth,
              );
              if (!hasAuth && pluginId !== UNSPLASH_PLUGIN.id) {
                return state;
              }
            }
          }

          return {
            activePlugins: normalizeActivePluginIds(
              isActive
                ? state.activePlugins.filter((id) => id !== pluginId)
                : [...state.activePlugins, pluginId],
              state.installedPlugins,
              state.pluginConfigs,
              { unauthenticatedAllowedPluginIds: [UNSPLASH_PLUGIN.id] },
            ),
          };
        }),

      updatePluginConfig: (pluginId, config) =>
        set((state) => {
          const plugin = state.installedPlugins.find((p) => p.id === pluginId);
          if (!plugin) return state;

          const pluginConfigs = normalizePluginConfigs(
            {
              ...state.pluginConfigs,
              [pluginId]: normalizePluginConfig(
                { ...state.pluginConfigs[pluginId], ...config },
                plugin.functions?.map((fn) => fn.name),
              ),
            },
            state.installedPlugins,
          );

          return {
            pluginConfigs,
            activePlugins: normalizeActivePluginIds(
              state.activePlugins,
              state.installedPlugins,
              pluginConfigs,
              { unauthenticatedAllowedPluginIds: [UNSPLASH_PLUGIN.id] },
            ),
          };
        }),

      togglePluginFunction: (pluginId, functionName) =>
        set((state) => {
          const plugin = state.installedPlugins.find((p) => p.id === pluginId);
          if (!plugin?.functions?.some((fn) => fn.name === functionName)) {
            return state;
          }

          const currentConfig =
            state.pluginConfigs[pluginId] || initPluginConfig();
          const currentDisabled = currentConfig.disabledFunctions || [];
          const newDisabled = currentDisabled.includes(functionName)
            ? currentDisabled.filter((f) => f !== functionName)
            : [...currentDisabled, functionName];

          return {
            pluginConfigs: {
              ...state.pluginConfigs,
              [pluginId]: normalizePluginConfig(
                { ...currentConfig, disabledFunctions: newDisabled },
                plugin.functions.map((fn) => fn.name),
              ),
            },
          };
        }),

      ensureBuiltInPlugins: () =>
        set((state) => {
          const retainedPlugins = refreshBuiltInPluginDefinitions(
            removeRemovedBuiltInPlugins(state.installedPlugins),
          );
          const missingPlugins = BUILT_IN_PLUGINS.filter(
            (plugin) => !retainedPlugins.some((p) => p.id === plugin.id),
          );
          const builtInDefinitionsChanged =
            retainedPlugins.length !== state.installedPlugins.length ||
            retainedPlugins.some(
              (plugin, index) => plugin !== state.installedPlugins[index],
            );

          if (missingPlugins.length === 0 && !builtInDefinitionsChanged) {
            return state;
          }

          const newConfigs = normalizePluginConfigs(
            state.pluginConfigs,
            retainedPlugins,
          );
          missingPlugins.forEach((plugin) => {
            if (!newConfigs[plugin.id]) {
              newConfigs[plugin.id] = initPluginConfig();
            }
          });
          const installedPlugins = [...retainedPlugins, ...missingPlugins];
          const pluginConfigs = normalizePluginConfigs(
            newConfigs,
            installedPlugins,
          );

          return {
            installedPlugins,
            pluginConfigs,
            activePlugins: normalizeActivePluginIds(
              state.activePlugins,
              installedPlugins,
              pluginConfigs,
              { unauthenticatedAllowedPluginIds: [UNSPLASH_PLUGIN.id] },
            ),
          };
        }),

      // Agent Management
      customAgents: [],
      usedAgents: [],
      agentOverrides: {},

      addCustomAgent: (agent) =>
        set((state) => {
          const normalizedAgent = normalizeLocalAgent({
            ...agent,
            isCustom: true,
          });
          if (!normalizedAgent) return state;

          return {
            customAgents: normalizeLocalAgents(
              [normalizedAgent, ...state.customAgents],
              MARKET_LIMITS.maxCustomAgents,
            ),
          };
        }),

      updateAgent: (identifier, updates, isCustom) =>
        set((state) => {
          if (isCustom) {
            let changed = false;
            const customAgents = state.customAgents.map((a) => {
              if (a.identifier !== identifier) return a;

              const normalizedAgent = normalizeLocalAgent({
                ...a,
                ...updates,
                meta: { ...a.meta, ...updates.meta },
                isCustom: true,
              });
              if (!normalizedAgent) return a;
              changed = true;
              return normalizedAgent;
            });

            if (!changed) return state;

            return {
              customAgents: normalizeLocalAgents(
                customAgents,
                MARKET_LIMITS.maxCustomAgents,
              ),
            } as Partial<SettingsState>;
          }

          const currentOverride = state.agentOverrides[identifier] || {};
          const newUsedAgents = state.usedAgents.map((a) =>
            a.identifier === identifier
              ? normalizeLocalAgent({
                  ...a,
                  ...updates,
                  meta: { ...a.meta, ...updates.meta },
                }) || a
              : a,
          );
          const normalizedOverride = normalizeLocalAgent({
            identifier,
            ...currentOverride,
            ...updates,
            meta: { ...currentOverride.meta, ...updates.meta },
          });

          return {
            agentOverrides: {
              ...state.agentOverrides,
              ...(normalizedOverride
                ? { [identifier]: normalizedOverride }
                : {}),
            },
            usedAgents: normalizeLocalAgents(
              newUsedAgents,
              MARKET_LIMITS.maxUsedAgents,
            ),
          } as Partial<SettingsState>;
        }),

      removeLocalAgent: (identifier) =>
        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [identifier]: _removed, ...newOverrides } =
            state.agentOverrides;
          return {
            customAgents: state.customAgents.filter(
              (a) => a.identifier !== identifier,
            ),
            usedAgents: state.usedAgents.filter(
              (a) => a.identifier !== identifier,
            ),
            agentOverrides: newOverrides,
          };
        }),

      recordUsedAgent: (agent) =>
        set((state) => {
          const normalizedAgent = normalizeLocalAgent(agent);
          if (!normalizedAgent) return state;

          if (
            state.customAgents.some(
              (a) => a.identifier === normalizedAgent.identifier,
            )
          ) {
            return state;
          }

          const others = state.usedAgents.filter(
            (a) => a.identifier !== normalizedAgent.identifier,
          );
          return {
            usedAgents: normalizeLocalAgents(
              [normalizedAgent, ...others],
              MARKET_LIMITS.maxUsedAgents,
            ),
          };
        }),

      resetAgent: (identifier) =>
        set((state) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [identifier]: _removed, ...newOverrides } =
            state.agentOverrides;
          return { agentOverrides: newOverrides };
        }),

      // Data Management
      exportAllData: async () => createBrowserAppExportPayload(),
      clearAllData: async () => {
        await clearBrowserAppData(get().rag);
        if (typeof window !== "undefined") {
          window.location.reload();
        }
      },
    }),
    {
      name: STORAGE_KEYS.SETTINGS,
      storage: createJSONStorage(getAppDbStorage),
      version: STORAGE_VERSION,
      migrate: async (persistedState) => {
        const state = persistedState as Partial<SettingsState>;
        const installedPlugins = removeRemovedBuiltInPlugins(
          state.installedPlugins || [...BUILT_IN_PLUGINS],
        );
        const pluginConfigs = await migratePluginConfigLocalSecrets(
          normalizePluginConfigs(state.pluginConfigs, installedPlugins),
        );
        const search = await migrateSearchLocalSecrets(state.search);
        const rag = await migrateRAGLocalSecrets(state.rag);
        const voice = await migrateVoiceLocalSecrets(state.voice);
        return {
          ...state,
          marketPlugins: state.marketPlugins || [],
          marketPluginsTimestamp: state.marketPluginsTimestamp || 0,
          marketAgents: normalizeMarketAgents(state.marketAgents),
          marketAgentsTimestamp: state.marketAgentsTimestamp || 0,
          marketAgentsLocale: state.marketAgentsLocale || "",
          system: normalizeSystemSettings(
            state.system,
            DEFAULT_SYSTEM_SETTINGS,
          ),
          modelMetadata: normalizeModelMetadataMap(state.modelMetadata),
          modelMetadataTimestamp: state.modelMetadataTimestamp || 0,
          customModelMetadata: normalizeModelMetadataMap(
            state.customModelMetadata,
          ),
          search,
          rag,
          voice,
          activePlugins: normalizeActivePluginIds(
            state.activePlugins,
            installedPlugins,
            pluginConfigs,
            { unauthenticatedAllowedPluginIds: [UNSPLASH_PLUGIN.id] },
          ),
          installedPlugins,
          pluginConfigs,
          customAgents: normalizeLocalAgents(
            state.customAgents,
            MARKET_LIMITS.maxCustomAgents,
          ),
          usedAgents: normalizeLocalAgents(
            state.usedAgents,
            MARKET_LIMITS.maxUsedAgents,
          ),
          agentOverrides: normalizeAgentOverrides(state.agentOverrides),
        } as SettingsState;
      },
      partialize: (state) => ({
        marketPlugins: state.marketPlugins,
        marketPluginsTimestamp: state.marketPluginsTimestamp,
        marketAgents: state.marketAgents,
        marketAgentsTimestamp: state.marketAgentsTimestamp,
        marketAgentsLocale: state.marketAgentsLocale,
        system: state.system,
        modelMetadata: state.modelMetadata,
        modelMetadataTimestamp: state.modelMetadataTimestamp,
        customModelMetadata: state.customModelMetadata,
        search: stripSearchPlainSecrets(state.search),
        rag: stripRAGPlainSecrets(state.rag),
        voice: stripVoicePlainSecrets(state.voice),
        activePlugins: state.activePlugins,
        installedPlugins: state.installedPlugins,
        pluginConfigs: stripPluginConfigPlainSecrets(state.pluginConfigs),
        customAgents: state.customAgents,
        usedAgents: state.usedAgents,
        agentOverrides: state.agentOverrides,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (typeof window === "undefined") return;
        if (error) {
          logDevError("Settings hydration failed:", error);
        } else if (state) {
          state.setHasHydrated(true);
        }
      },
    },
  ),
);

// Utility Functions
export const formatModelName = (
  id: string,
  metadata?: Record<string, ModelMetadata>,
  customMetadata?: Record<string, ModelMetadata>,
): string => {
  if (!id) return "";

  // Priority: custom metadata > fetched metadata > fallback formatting
  const name = customMetadata?.[id]?.name || metadata?.[id]?.name;
  if (name) return name;

  // Fallback: format the ID
  return id
    .replace(/[-_]/g, (match, offset, str) => {
      // Keep hyphen if surrounded by digits (e.g., 06-05)
      if (
        match === "-" &&
        offset > 0 &&
        offset < str.length - 1 &&
        /\d/.test(str[offset - 1]) &&
        /\d/.test(str[offset + 1])
      ) {
        return match;
      }
      return " ";
    })
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

export const getEffectiveBaseUrl = (baseUrl: string, type: string): string => {
  return normalizeProviderBaseUrl(baseUrl, type);
};

export const getTaskModel = (task: keyof DefaultModels): string => {
  const { defaultModels, providers } = useCoreSettingsStore.getState();
  return getDefaultModelSelectValue(defaultModels, task, providers);
};
