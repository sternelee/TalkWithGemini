import type { LobeAgent } from "../assistant/types";
import type { ChatConfig } from "../chat/types";
import type { Plugin, PluginConfig } from "../plugin/types";
import type { ModelMetadata, ModelProvider } from "../providers/types";
import type { LocalEncryptedSecretEnvelope } from "../security/localSecrets";
import type { SearchProviderID, SearchServiceConfig } from "../search/types";
import type { SkillCatalog, SkillDataLocale, TextSkill } from "../skills/types";
import type { VoiceSettings } from "../voice/types";
export type {
  MemoryDreamStatus,
  MemoryRecord,
  MemorySettings,
  MemorySource,
  MemoryType,
} from "../memory/types";

export type DocumentParseProvider = "mineru" | "llamaParse";

export interface RAGConfig {
  enabled: boolean;
  url: string;
  token: string;
  tokenSecret?: LocalEncryptedSecretEnvelope;
  topK: number;
  chunkSize: number;
  documentParseProvider: DocumentParseProvider;
  mineruApiToken: string;
  mineruApiTokenSecret?: LocalEncryptedSecretEnvelope;
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
  memory: string;
}

export interface SystemSettings {
  systemPrompt: string;
  enableAutoTitle: boolean;
  enableRelatedQuestions: boolean;
  enableAutoCompression: boolean;
  compressionThreshold: number;
  historyKeepCount: number;
  enableCodeCollapse: boolean;
  enableHtmlVisualPrompt: boolean;
  fontSize: "small" | "medium" | "large";
}

export interface AppSettings {
  theme: "light" | "dark" | "system";
  language: "en" | "zh" | "ja" | "auto";
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
  installedSkills: TextSkill[];
  customSkills: TextSkill[];
  activeSkillIds: string[];
  skillAutoSelect: boolean;
  skillCatalogs: Partial<Record<SkillDataLocale, SkillCatalog>>;
  skillCatalogTimestamps: Partial<Record<SkillDataLocale, number>>;
  skillDefinitions: Record<string, TextSkill>;
  skillDefinitionTimestamps: Record<string, number>;
  customAgents: LobeAgent[];
  usedAgents: LobeAgent[];
  agentOverrides: Record<string, Partial<LobeAgent>>;
}

export type { ChatConfig };
