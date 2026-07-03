import { BUILT_IN_PLUGINS } from "../../config/plugins";
import type { Plugin } from "../../types";
import { getDeploymentMode } from "../security/deployment";

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
    const response = await fetch(
      this.endpoint(`get/${encodeURIComponent(this.key(pluginId))}`),
      {
        headers: { Authorization: `Bearer ${this.token}` },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new Error(
        `Plugin registry store failed with status ${response.status}`,
      );
    }

    const data = (await response.json()) as { result?: string | null };
    if (!data.result) return undefined;
    return JSON.parse(data.result) as Plugin;
  }

  async set(plugin: Plugin): Promise<void> {
    const response = await fetch(this.endpoint("set"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([this.key(plugin.id), JSON.stringify(plugin)]),
      cache: "no-store",
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
  const memoryPlugin = getRegistry().get(pluginId);
  if (memoryPlugin) return memoryPlugin;

  const builtInPlugin = BUILT_IN_PLUGINS.find(
    (plugin) => plugin.id === pluginId,
  );
  if (builtInPlugin) return builtInPlugin;

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
