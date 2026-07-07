import type {
  DocumentParseProvider,
  ModelProvider,
  RAGConfig,
  SearchServiceConfig,
  VoiceSettings,
} from "../../types";
import {
  decryptLocalSecret,
  hasLocalSecret,
  LOCAL_SECRET_CONTEXTS,
} from "./localSecrets";

function trimSecret(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function hasProviderApiKey(
  provider: Pick<ModelProvider, "apiKey" | "apiKeySecret">,
): boolean {
  return Boolean(
    trimSecret(provider.apiKey) || hasLocalSecret(provider.apiKeySecret),
  );
}

export async function resolveProviderApiKey(
  provider: Pick<ModelProvider, "id" | "apiKey" | "apiKeySecret">,
): Promise<string | undefined> {
  const plain = trimSecret(provider.apiKey);
  if (plain) return plain;

  return decryptLocalSecret(
    provider.apiKeySecret,
    LOCAL_SECRET_CONTEXTS.providerApiKey(provider.id),
  );
}

export function hasSearchApiKey(
  config: SearchServiceConfig | undefined,
): boolean {
  return Boolean(
    trimSecret(config?.apiKey) || hasLocalSecret(config?.apiKeySecret),
  );
}

export async function resolveSearchApiKey(
  provider: string,
  config: SearchServiceConfig | undefined,
): Promise<string | undefined> {
  const plain = trimSecret(config?.apiKey);
  if (plain) return plain;

  return decryptLocalSecret(
    config?.apiKeySecret,
    LOCAL_SECRET_CONTEXTS.searchApiKey(provider),
  );
}

export function hasRagToken(rag: {
  token?: string;
  tokenSecret?: unknown;
}): boolean {
  return Boolean(trimSecret(rag.token) || hasLocalSecret(rag.tokenSecret));
}

export function hasRagVectorStore(rag: {
  url?: string;
  token?: string;
  tokenSecret?: unknown;
  useDefaultVectorStore?: boolean;
  serverVectorStoreAvailable?: boolean;
}): boolean {
  return Boolean(
    (trimSecret(rag.url) && hasRagToken(rag)) ||
    (rag.useDefaultVectorStore && rag.serverVectorStoreAvailable),
  );
}

export async function resolveRagToken(rag: {
  token?: string;
  tokenSecret?: RAGConfig["tokenSecret"];
}): Promise<string | undefined> {
  const plain = trimSecret(rag.token);
  if (plain) return plain;

  return decryptLocalSecret(rag.tokenSecret, LOCAL_SECRET_CONTEXTS.ragToken);
}

export function hasLlamaParseApiKey(
  rag: Pick<
    RAGConfig,
    | "llamaParseApiKey"
    | "llamaParseApiKeySecret"
    | "useDefaultDocumentProcessing"
    | "serverDocumentProcessingAvailable"
  >,
): boolean {
  return Boolean(
    trimSecret(rag.llamaParseApiKey) ||
    hasLocalSecret(rag.llamaParseApiKeySecret) ||
    (rag.useDefaultDocumentProcessing && rag.serverDocumentProcessingAvailable),
  );
}

export function hasMineruApiToken(
  rag: Pick<RAGConfig, "mineruApiToken" | "mineruApiTokenSecret">,
): boolean {
  return Boolean(
    trimSecret(rag.mineruApiToken) || hasLocalSecret(rag.mineruApiTokenSecret),
  );
}

export function hasDocumentParseCredential(
  rag: Pick<
    RAGConfig,
    | "documentParseProvider"
    | "mineruApiToken"
    | "mineruApiTokenSecret"
    | "llamaParseApiKey"
    | "llamaParseApiKeySecret"
    | "useDefaultDocumentProcessing"
    | "serverDocumentProcessingAvailable"
  >,
): boolean {
  const hasServerDefault = Boolean(
    rag.useDefaultDocumentProcessing && rag.serverDocumentProcessingAvailable,
  );

  if (rag.documentParseProvider === "llamaParse") {
    return Boolean(
      trimSecret(rag.llamaParseApiKey) ||
      hasLocalSecret(rag.llamaParseApiKeySecret) ||
      hasServerDefault,
    );
  }

  return Boolean(hasMineruApiToken(rag) || hasServerDefault);
}

export async function resolveMineruApiToken(
  rag: Pick<RAGConfig, "mineruApiToken" | "mineruApiTokenSecret">,
): Promise<string | undefined> {
  const plain = trimSecret(rag.mineruApiToken);
  if (plain) return plain;

  return decryptLocalSecret(
    rag.mineruApiTokenSecret,
    LOCAL_SECRET_CONTEXTS.mineruApiToken,
  );
}

export async function resolveLlamaParseApiKey(
  rag: Pick<RAGConfig, "llamaParseApiKey" | "llamaParseApiKeySecret">,
): Promise<string | undefined> {
  const plain = trimSecret(rag.llamaParseApiKey);
  if (plain) return plain;

  return decryptLocalSecret(
    rag.llamaParseApiKeySecret,
    LOCAL_SECRET_CONTEXTS.llamaParseApiKey,
  );
}

export async function resolveDocumentParseToken(
  provider: DocumentParseProvider,
  rag: Pick<
    RAGConfig,
    | "mineruApiToken"
    | "mineruApiTokenSecret"
    | "llamaParseApiKey"
    | "llamaParseApiKeySecret"
  >,
): Promise<string | undefined> {
  return provider === "mineru"
    ? resolveMineruApiToken(rag)
    : resolveLlamaParseApiKey(rag);
}

export function hasElevenLabsApiKey(
  voice: Pick<
    VoiceSettings,
    | "elevenLabsApiKey"
    | "elevenLabsApiKeySecret"
    | "sttProvider"
    | "ttsProvider"
  > & {
    serverElevenLabsAvailable?: boolean;
  },
): boolean {
  return Boolean(
    trimSecret(voice.elevenLabsApiKey) ||
    hasLocalSecret(voice.elevenLabsApiKeySecret) ||
    ((voice.sttProvider === "default" || voice.ttsProvider === "default") &&
      voice.serverElevenLabsAvailable),
  );
}

export async function resolveElevenLabsApiKey(
  voice: Pick<VoiceSettings, "elevenLabsApiKey" | "elevenLabsApiKeySecret">,
): Promise<string | undefined> {
  const plain = trimSecret(voice.elevenLabsApiKey);
  if (plain) return plain;

  return decryptLocalSecret(
    voice.elevenLabsApiKeySecret,
    LOCAL_SECRET_CONTEXTS.elevenLabsApiKey,
  );
}

export function hasMimoApiKey(
  voice: Pick<
    VoiceSettings,
    "mimoApiKey" | "mimoApiKeySecret" | "sttProvider" | "ttsProvider"
  > & {
    serverMimoAvailable?: boolean;
  },
): boolean {
  return Boolean(
    trimSecret(voice.mimoApiKey) ||
    hasLocalSecret(voice.mimoApiKeySecret) ||
    ((voice.sttProvider === "default" || voice.ttsProvider === "default") &&
      voice.serverMimoAvailable),
  );
}

export async function resolveMimoApiKey(
  voice: Pick<VoiceSettings, "mimoApiKey" | "mimoApiKeySecret">,
): Promise<string | undefined> {
  const plain = trimSecret(voice.mimoApiKey);
  if (plain) return plain;

  return decryptLocalSecret(
    voice.mimoApiKeySecret,
    LOCAL_SECRET_CONTEXTS.mimoApiKey,
  );
}

type LocalAuthSecretInput = {
  value?: string;
  localValueSecret?: unknown;
};

export function hasPluginAuthValue(
  auth: LocalAuthSecretInput | undefined,
): boolean {
  return Boolean(
    trimSecret(auth?.value) || hasLocalSecret(auth?.localValueSecret),
  );
}

export async function resolvePluginAuthValue(
  pluginId: string,
  auth: LocalAuthSecretInput | undefined,
): Promise<string | undefined> {
  const plain = trimSecret(auth?.value);
  if (plain) return plain;

  const localValueSecret = hasLocalSecret(auth?.localValueSecret)
    ? auth.localValueSecret
    : undefined;

  return decryptLocalSecret(
    localValueSecret,
    LOCAL_SECRET_CONTEXTS.pluginAuth(pluginId),
  );
}
