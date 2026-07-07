import { BUILT_IN_PLUGINS } from "../../config/plugins";
import type { Plugin } from "../../types";
import { getDeploymentMode } from "../security/deployment";
import { safeFetchSharedStoreJson } from "../security/sharedStoreFetch";

declare global {
  var __neoChatServerPluginRegistry: Map<string, Plugin> | undefined;
}

interface ServerPluginRegistryStore {
  get(pluginId: string): Promise<Plugin | undefined>;
  set(plugin: Plugin): Promise<void>;
  clear?(): void;
}

function getRegistry(): Map<string, Plugin> {
  if (!globalThis.__neoChatServerPluginRegistry) {
    globalThis.__neoChatServerPluginRegistry = new Map();
  }
  return globalThis.__neoChatServerPluginRegistry;
}

function getBuiltInPlugin(pluginId: string): Plugin | undefined {
  return BUILT_IN_PLUGINS.find((plugin) => plugin.id === pluginId);
}

class UpstashServerPluginRegistryStore implements ServerPluginRegistryStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  private key(pluginId: string): string {
    return `neo:plugin:${pluginId}`;
  }

  private endpoint(path: string): string {
    return `${this.url.replace(/\/+$/, "")}/${path}`;
  }

  async get(pluginId: string): Promise<Plugin | undefined> {
    const { response, data } = await safeFetchSharedStoreJson<{
      result?: string | null;
    }>(this.endpoint(`get/${encodeURIComponent(this.key(pluginId))}`), {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) {
      throw new Error(
        `Plugin registry store failed with status ${response.status}`,
      );
    }

    if (!data.result) return undefined;
    return JSON.parse(data.result) as Plugin;
  }

  async set(plugin: Plugin): Promise<void> {
    const { response } = await safeFetchSharedStoreJson(this.endpoint("set"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([this.key(plugin.id), JSON.stringify(plugin)]),
    });
    if (!response.ok) {
      throw new Error(
        `Plugin registry store failed with status ${response.status}`,
      );
    }
  }
}

let configuredStore: ServerPluginRegistryStore | null = null;
const SHARED_PLUGIN_REGISTRY_ERROR =
  "PLUGIN_REGISTRY_STORE=upstash with UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN is required in hosted mode";

function env(name: string): string {
  return process.env[name]?.trim() || "";
}

function isSharedStoreName(store: string): boolean {
  return store === "upstash" || store === "redis" || store === "kv";
}

function canUseMemoryFallback(): boolean {
  return getDeploymentMode() === "local";
}

function createServerPluginRegistryStore(): ServerPluginRegistryStore {
  const store = env("PLUGIN_REGISTRY_STORE").toLowerCase();
  const upstashUrl = env("UPSTASH_REDIS_REST_URL");
  const upstashToken = env("UPSTASH_REDIS_REST_TOKEN");

  if (isSharedStoreName(store) && upstashUrl && upstashToken) {
    return new UpstashServerPluginRegistryStore(upstashUrl, upstashToken);
  }

  if (isSharedStoreName(store) || getDeploymentMode() === "hosted") {
    throw new Error(SHARED_PLUGIN_REGISTRY_ERROR);
  }

  return {
    async get(pluginId) {
      return getRegistry().get(pluginId);
    },
    async set(plugin) {
      getRegistry().set(plugin.id, plugin);
    },
    clear() {
      getRegistry().clear();
    },
  };
}

function getServerPluginRegistryStore(): ServerPluginRegistryStore {
  if (!configuredStore) configuredStore = createServerPluginRegistryStore();
  return configuredStore;
}

export async function registerServerPlugin(plugin: Plugin): Promise<void> {
  if (getBuiltInPlugin(plugin.id)) {
    throw new Error(`Plugin id ${plugin.id} is a reserved built-in plugin id`);
  }

  getRegistry().set(plugin.id, plugin);
  try {
    await getServerPluginRegistryStore().set(plugin);
  } catch (error) {
    if (!canUseMemoryFallback()) {
      getRegistry().delete(plugin.id);
      throw error;
    }
  }
}

export async function getServerPlugin(
  pluginId: string,
): Promise<Plugin | undefined> {
  const builtInPlugin = getBuiltInPlugin(pluginId);
  if (builtInPlugin) return builtInPlugin;

  const memoryPlugin = getRegistry().get(pluginId);
  if (memoryPlugin) return memoryPlugin;

  try {
    const storedPlugin = await getServerPluginRegistryStore().get(pluginId);
    if (storedPlugin) getRegistry().set(storedPlugin.id, storedPlugin);
    return storedPlugin;
  } catch (error) {
    if (!canUseMemoryFallback()) throw error;
    return undefined;
  }
}

export function clearServerPluginRegistryForTesting(): void {
  getRegistry().clear();
  configuredStore?.clear?.();
  configuredStore = null;
}
