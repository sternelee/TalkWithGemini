import "server-only";

import type {
  ServiceHealthItem,
  ServiceHealthServiceKey,
  ServiceHealthState,
  ServiceHealthStatus,
} from "@/types";
import {
  getDefaultElevenLabsSttModel,
  getDefaultElevenLabsTtsModel,
  getDefaultMimoSttModel,
  getDefaultMimoTtsModel,
  getDefaultVoiceProvider,
} from "../defaultConfig/server";
import { getDeploymentMode } from "../security/deployment";

type StoreEnvName =
  "RATE_LIMIT_STORE" | "DOCUMENT_PARSE_JOB_STORE" | "PLUGIN_REGISTRY_STORE";

const sharedStoreNames = new Set(["upstash", "redis", "kv"]);

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function envBool(name: string): boolean {
  return ["1", "true", "yes", "on"].includes(env(name).toLowerCase());
}

function item(
  service: ServiceHealthServiceKey,
  status: ServiceHealthState,
  code: string,
  message?: string,
): ServiceHealthItem {
  return { service, status, code, ...(message ? { message } : {}) };
}

function hasSharedStoreCredentials(): boolean {
  return Boolean(
    env("UPSTASH_REDIS_REST_URL") && env("UPSTASH_REDIS_REST_TOKEN"),
  );
}

function storeHealth(
  service: Extract<
    ServiceHealthServiceKey,
    "rateLimitStore" | "documentParseJobStore" | "pluginRegistry"
  >,
  storeEnvName: StoreEnvName,
  hosted: boolean,
): ServiceHealthItem {
  const configuredStore = env(storeEnvName).toLowerCase();
  const wantsSharedStore = sharedStoreNames.has(configuredStore);

  if (wantsSharedStore && hasSharedStoreCredentials()) {
    return item(service, "available", "SHARED_STORE_CONFIGURED");
  }

  if (hosted || wantsSharedStore) {
    return item(service, "policy_blocked", "SHARED_STORE_REQUIRED");
  }

  return item(service, "local_only", "MEMORY_STORE");
}

function byokHealth(): ServiceHealthItem {
  if (env("BYOK_PRIVATE_KEY_PEM")) {
    return item("byok", "available", "STABLE_KEY_CONFIGURED");
  }
  if (envBool("BYOK_ALLOW_EPHEMERAL_KEY")) {
    return item("byok", "local_only", "EPHEMERAL_KEY_ALLOWED");
  }
  return item("byok", "missing_key", "STABLE_KEY_MISSING");
}

function accessPasswordHealth(hosted: boolean): ServiceHealthItem {
  if (env("ACCESS_PASSWORD")) {
    return item("accessPassword", "available", "ACCESS_PASSWORD_CONFIGURED");
  }
  return item(
    "accessPassword",
    hosted ? "missing_key" : "local_only",
    hosted ? "ACCESS_PASSWORD_RECOMMENDED" : "ACCESS_PASSWORD_OPTIONAL",
  );
}

function defaultModelHealth(): ServiceHealthItem {
  if (env("DEFAULT_PROVIDER_API_KEY")) {
    return item("defaultModel", "available", "DEFAULT_MODEL_CONFIGURED");
  }
  return item("defaultModel", "missing_key", "DEFAULT_PROVIDER_KEY_MISSING");
}

function searchHealth(): ServiceHealthItem {
  const provider = env("DEFAULT_SEARCH_PROVIDER").toLowerCase();
  if (!provider) {
    return item("search", "unconfigured", "SEARCH_UNCONFIGURED");
  }
  if (provider === "searxng") {
    return env("DEFAULT_SEARCH_BASE_URL")
      ? item("search", "available", "SEARCH_CONFIGURED")
      : item("search", "missing_key", "SEARCH_BASE_URL_MISSING");
  }
  if (provider === "firecrawl") {
    return item("search", "available", "SEARCH_CONFIGURED");
  }
  return env("DEFAULT_SEARCH_API_KEY")
    ? item("search", "available", "SEARCH_CONFIGURED")
    : item("search", "missing_key", "SEARCH_API_KEY_MISSING");
}

function ragHealth(): ServiceHealthItem {
  const vectorStoreReady = Boolean(
    env("DEFAULT_RAG_BASE_URL") && env("DEFAULT_RAG_TOKEN"),
  );
  const parserReady = Boolean(env("DEFAULT_LLAMA_PARSE_API_KEY"));

  if (vectorStoreReady || parserReady) {
    return item("rag", "available", "RAG_CONFIGURED");
  }
  return item("rag", "unconfigured", "RAG_UNCONFIGURED");
}

function voiceHealth(): ServiceHealthItem {
  const configuredProvider = env("DEFAULT_VOICE_PROVIDER").toLowerCase();
  if (!configuredProvider) {
    return item("voice", "unconfigured", "VOICE_UNCONFIGURED");
  }
  if (configuredProvider !== "elevenlabs" && configuredProvider !== "mimo") {
    return item("voice", "unconfigured", "VOICE_UNCONFIGURED");
  }

  const defaultProvider = getDefaultVoiceProvider();
  if (!defaultProvider) {
    return item("voice", "missing_key", "VOICE_API_KEY_MISSING");
  }

  const hasDefaultCapability =
    defaultProvider === "mimo"
      ? Boolean(getDefaultMimoSttModel() || getDefaultMimoTtsModel())
      : Boolean(
          getDefaultElevenLabsSttModel() || getDefaultElevenLabsTtsModel(),
        );

  if (hasDefaultCapability) {
    return item("voice", "available", "VOICE_CONFIGURED");
  }

  return item("voice", "unconfigured", "VOICE_UNCONFIGURED");
}

export function getServiceHealthStatus(
  options: { now?: number } = {},
): ServiceHealthStatus {
  const deploymentMode = getDeploymentMode();
  const hosted = deploymentMode === "hosted";

  return {
    generatedAt: new Date(options.now ?? Date.now()).toISOString(),
    deploymentMode,
    services: {
      byok: byokHealth(),
      accessPassword: accessPasswordHealth(hosted),
      hostedMode: item(
        "hostedMode",
        hosted ? "available" : "local_only",
        hosted ? "HOSTED_MODE_ENABLED" : "LOCAL_MODE",
      ),
      rateLimitStore: storeHealth("rateLimitStore", "RATE_LIMIT_STORE", hosted),
      documentParseJobStore: storeHealth(
        "documentParseJobStore",
        "DOCUMENT_PARSE_JOB_STORE",
        hosted,
      ),
      pluginRegistry: storeHealth(
        "pluginRegistry",
        "PLUGIN_REGISTRY_STORE",
        hosted,
      ),
      defaultModel: defaultModelHealth(),
      search: searchHealth(),
      rag: ragHealth(),
      voice: voiceHealth(),
    },
  };
}
