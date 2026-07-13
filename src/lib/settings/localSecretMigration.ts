import type {
  ModelProvider,
  PluginConfig,
  RAGConfig,
  SearchServiceConfig,
  VoiceSettings,
} from "@/types";
import {
  encryptLocalSecret,
  hasLocalSecret,
  LOCAL_SECRET_CONTEXTS,
  type LocalEncryptedSecretEnvelope,
} from "../security/localSecrets";
import { normalizeRAGConfig, normalizeSearchSettings } from "./searchRag";

export async function migrateLocalSecretField(
  plainSecret: string | undefined,
  existingSecret: unknown,
  context: string,
): Promise<LocalEncryptedSecretEnvelope | undefined> {
  const trimmed = plainSecret?.trim();
  if (trimmed) {
    return encryptLocalSecret(trimmed, context);
  }

  return hasLocalSecret(existingSecret) ? existingSecret : undefined;
}

export async function migrateProviderLocalSecret(
  provider: ModelProvider,
): Promise<ModelProvider> {
  const apiKeySecret = await migrateLocalSecretField(
    provider.apiKey,
    provider.apiKeySecret,
    LOCAL_SECRET_CONTEXTS.providerApiKey(provider.id),
  );

  return {
    ...provider,
    apiKey: "",
    ...(apiKeySecret ? { apiKeySecret } : {}),
  };
}

export function stripProviderPlainSecret(
  provider: ModelProvider,
): ModelProvider {
  return {
    ...provider,
    apiKey: "",
  };
}

export async function migrateSearchLocalSecrets(search: unknown) {
  const normalized = normalizeSearchSettings(search);
  const configs: Record<string, SearchServiceConfig> = {};

  for (const [provider, config] of Object.entries(normalized.configs)) {
    const apiKeySecret = await migrateLocalSecretField(
      config.apiKey,
      config.apiKeySecret,
      LOCAL_SECRET_CONTEXTS.searchApiKey(provider),
    );
    configs[provider] = {
      ...config,
      apiKey: "",
      ...(apiKeySecret ? { apiKeySecret } : {}),
    };
  }

  return { ...normalized, configs };
}

export async function migrateRAGLocalSecrets(rag: unknown): Promise<RAGConfig> {
  const normalized = normalizeRAGConfig(rag);
  const tokenSecret = await migrateLocalSecretField(
    normalized.token,
    normalized.tokenSecret,
    LOCAL_SECRET_CONTEXTS.ragToken,
  );
  const mineruApiTokenSecret = await migrateLocalSecretField(
    normalized.mineruApiToken,
    normalized.mineruApiTokenSecret,
    LOCAL_SECRET_CONTEXTS.mineruApiToken,
  );
  const llamaParseApiKeySecret = await migrateLocalSecretField(
    normalized.llamaParseApiKey,
    normalized.llamaParseApiKeySecret,
    LOCAL_SECRET_CONTEXTS.llamaParseApiKey,
  );

  return {
    ...normalized,
    token: "",
    mineruApiToken: "",
    llamaParseApiKey: "",
    ...(tokenSecret ? { tokenSecret } : {}),
    ...(mineruApiTokenSecret ? { mineruApiTokenSecret } : {}),
    ...(llamaParseApiKeySecret ? { llamaParseApiKeySecret } : {}),
  };
}

export async function migrateVoiceLocalSecrets(
  voice: Partial<VoiceSettings> | undefined,
): Promise<VoiceSettings> {
  const normalized: VoiceSettings = {
    sttProvider: "browser",
    sttModel: "",
    sttLanguage: "auto",
    ttsProvider: "browser",
    ttsModel: "",
    ttsVoiceId: "bIHbv24MWmeRgasZH58o",
    ttsLanguage: "auto",
    elevenLabsApiKey: "",
    mimoApiKey: "",
    mimoTtsVoiceId: "mimo_default",
    autoTranscribe: true,
    ...voice,
  };
  const elevenLabsApiKeySecret = await migrateLocalSecretField(
    normalized.elevenLabsApiKey,
    normalized.elevenLabsApiKeySecret,
    LOCAL_SECRET_CONTEXTS.elevenLabsApiKey,
  );
  const mimoApiKeySecret = await migrateLocalSecretField(
    normalized.mimoApiKey,
    normalized.mimoApiKeySecret,
    LOCAL_SECRET_CONTEXTS.mimoApiKey,
  );

  return {
    ...normalized,
    elevenLabsApiKey: "",
    mimoApiKey: "",
    ...(elevenLabsApiKeySecret ? { elevenLabsApiKeySecret } : {}),
    ...(mimoApiKeySecret ? { mimoApiKeySecret } : {}),
  };
}

export async function migratePluginConfigLocalSecrets(
  configs: Record<string, PluginConfig>,
): Promise<Record<string, PluginConfig>> {
  const migratedEntries = await Promise.all(
    Object.entries(configs).map(async ([pluginId, config]) => {
      if (!config.auth) return [pluginId, config] as const;

      const localValueSecret = await migrateLocalSecretField(
        config.auth.value,
        config.auth.localValueSecret,
        LOCAL_SECRET_CONTEXTS.pluginAuth(pluginId),
      );

      return [
        pluginId,
        {
          ...config,
          auth: {
            ...config.auth,
            value: "",
            ...(localValueSecret ? { localValueSecret } : {}),
          },
        },
      ] as const;
    }),
  );

  return Object.fromEntries(migratedEntries);
}

export function stripSearchPlainSecrets(search: {
  provider: string;
  resultsLimit: number;
  configs: Record<string, SearchServiceConfig>;
}) {
  return {
    ...search,
    configs: Object.fromEntries(
      Object.entries(search.configs).map(([provider, config]) => [
        provider,
        { ...config, apiKey: "" },
      ]),
    ) as Record<string, SearchServiceConfig>,
  };
}

export function stripRAGPlainSecrets(rag: RAGConfig): RAGConfig {
  return {
    ...rag,
    token: "",
    mineruApiToken: "",
    llamaParseApiKey: "",
  };
}

export function stripVoicePlainSecrets(voice: VoiceSettings): VoiceSettings {
  return {
    ...voice,
    elevenLabsApiKey: "",
    mimoApiKey: "",
  };
}

export function stripPluginConfigPlainSecrets(
  configs: Record<string, PluginConfig>,
): Record<string, PluginConfig> {
  return Object.fromEntries(
    Object.entries(configs).map(([pluginId, config]) => [
      pluginId,
      {
        ...config,
        ...(config.auth ? { auth: { ...config.auth, value: "" } } : {}),
      },
    ]),
  );
}
