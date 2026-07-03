import type { LobeAgent } from "../assistant/types";
import type { ChatConfig } from "../chat/types";
import type { Plugin, PluginConfig } from "../plugin/types";
import type { ModelMetadata, ModelProvider } from "../providers/types";
import type { LocalEncryptedSecretEnvelope } from "../security/localSecrets";
import type { SearchProviderID, SearchServiceConfig } from "../search/types";
import type { VoiceSettings } from "../voice/types";

export interface RAGConfig {
  enabled: boolean;
  url: string;
  token: string;
  tokenSecret?: LocalEncryptedSecretEnvelope;
  topK: number;
  chunkSize: number;
  llamaParseApiKey: string;
  llamaParseApiKeySecret?: LocalEncryptedSecretEnvelope;
  namespace?: string;
  useDefaultVectorStore?: boolean;
  useDefaultDocumentProcessing?: boolean;
  serverVectorStoreAvailable?: boolean;
  serverDocumentProcessingAvailable?: boolean;
}

export interface DefaultModels {
  titleGeneration: string;
  relatedQuestions: string;
  contextCompression: string;
  promptOptimization: string;
  ragQuery: string;
}

export interface SystemSettings {
  systemPrompt: string;
  enableAutoTitle: boolean;
  enableRelatedQuestions: boolean;
  enableAutoCompression: boolean;
  compressionThreshold: number;
  historyKeepCount: number;
  enableCodeCollapse: boolean;
  fontSize: "small" | "medium" | "large";
}

export interface AppSettings {
  theme: "light" | "dark" | "system";
  language: "en" | "zh" | "auto";
  system: SystemSettings;
  providers: ModelProvider[];
  modelMetadata: Record<string, ModelMetadata>;
  defaultModels: DefaultModels;
  search: {
    provider: SearchProviderID;
    resultsLimit: number;
    configs: Record<string, SearchServiceConfig>;
  };
  rag: RAGConfig;
  voice: VoiceSettings;
  activePlugins: string[];
  installedPlugins: Plugin[];
  pluginConfigs: Record<string, PluginConfig>;
  customAgents: LobeAgent[];
  usedAgents: LobeAgent[];
  agentOverrides: Record<string, Partial<LobeAgent>>;
}

export type { ChatConfig };
