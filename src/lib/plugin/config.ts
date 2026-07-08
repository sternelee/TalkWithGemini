import type { Plugin, PluginConfig } from "../../types";
import { MARKET_LIMITS, PLUGIN_CONFIG_LIMITS } from "../../config/limits";
import { isLocalEncryptedSecretEnvelope } from "../security/localSecrets";
import { hasPluginAuthValue } from "../security/localSecretResolvers";
import { getSafeUrlPolicy, validateOutboundUrl } from "../security/urlPolicy";

const AUTH_TYPES = new Set(["bearer", "apiKey", "none"]);
const AUTH_LOCATIONS = new Set(["header", "query"]);

function trimString(value: unknown, maxChars: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxChars) : "";
}

function normalizePluginBaseUrl(value: unknown): string | undefined {
  const raw = trimString(value, PLUGIN_CONFIG_LIMITS.maxBaseUrlChars);
  if (!raw) return undefined;

  try {
    const { url } = validateOutboundUrl(raw, getSafeUrlPolicy("plugin"));
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

function normalizeFunctionRefs(
  value: unknown,
  allowedFunctionNames?: Set<string>,
): string[] {
  if (!Array.isArray(value)) return [];

  const refs: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const ref = trimString(item, PLUGIN_CONFIG_LIMITS.maxFunctionNameChars);
    if (!ref || seen.has(ref)) continue;
    if (allowedFunctionNames && !allowedFunctionNames.has(ref)) continue;

    refs.push(ref);
    seen.add(ref);
    if (refs.length >= PLUGIN_CONFIG_LIMITS.maxFunctionRefs) break;
  }

  return refs;
}

export function normalizePluginIdRefs(
  value: unknown,
  allowedPluginIds?: Iterable<string>,
): string[] {
  if (!Array.isArray(value)) return [];

  const allowed = allowedPluginIds
    ? new Set(Array.from(allowedPluginIds))
    : undefined;
  const refs: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const ref = trimString(item, MARKET_LIMITS.maxPluginIdChars);
    if (!ref || seen.has(ref)) continue;
    if (allowed && !allowed.has(ref)) continue;

    refs.push(ref);
    seen.add(ref);
    if (refs.length >= PLUGIN_CONFIG_LIMITS.maxActivePlugins) break;
  }

  return refs;
}

export function normalizePluginConfig(
  config: unknown,
  allowedFunctionNames?: Iterable<string>,
): PluginConfig {
  const raw =
    config && typeof config === "object"
      ? (config as Partial<PluginConfig>)
      : {};
  const allowed = allowedFunctionNames
    ? new Set(Array.from(allowedFunctionNames))
    : undefined;

  const normalized: PluginConfig = {
    disabledFunctions: normalizeFunctionRefs(raw.disabledFunctions, allowed),
  };

  const baseUrl = normalizePluginBaseUrl(raw.baseUrl);
  if (baseUrl) {
    normalized.baseUrl = baseUrl;
  }

  const model = trimString(raw.model, PLUGIN_CONFIG_LIMITS.maxModelNameChars);
  if (model) {
    normalized.model = model;
  }

  const enabledFunctions = normalizeFunctionRefs(raw.enabledFunctions, allowed);
  if (enabledFunctions.length > 0) {
    normalized.enabledFunctions = enabledFunctions;
  }

  if (raw.auth && typeof raw.auth === "object") {
    const authType = AUTH_TYPES.has(raw.auth.type) ? raw.auth.type : "bearer";
    const authValue = trimString(
      raw.auth.value,
      PLUGIN_CONFIG_LIMITS.maxAuthValueChars,
    );
    const authKey = trimString(
      raw.auth.key,
      PLUGIN_CONFIG_LIMITS.maxAuthKeyChars,
    );
    const addTo = AUTH_LOCATIONS.has(raw.auth.addTo || "")
      ? raw.auth.addTo
      : "header";

    normalized.auth = {
      type: authType,
      ...(authValue ? { value: authValue } : {}),
      ...(isLocalEncryptedSecretEnvelope(raw.auth.localValueSecret)
        ? { localValueSecret: raw.auth.localValueSecret }
        : {}),
      ...(authKey ? { key: authKey } : {}),
      addTo,
    };
  }

  return normalized;
}

export function normalizePluginConfigs(
  configs: unknown,
  installedPlugins: Plugin[],
): Record<string, PluginConfig> {
  if (!configs || typeof configs !== "object") return {};

  const rawConfigs = configs as Record<string, unknown>;
  const normalized: Record<string, PluginConfig> = {};

  for (const plugin of installedPlugins) {
    if (!Object.prototype.hasOwnProperty.call(rawConfigs, plugin.id)) continue;

    normalized[plugin.id] = normalizePluginConfig(
      rawConfigs[plugin.id],
      plugin.functions?.map((fn) => fn.name),
    );
    if (
      Object.keys(normalized).length >= PLUGIN_CONFIG_LIMITS.maxPluginConfigs
    ) {
      break;
    }
  }

  return normalized;
}

export function isPluginAuthRequired(
  plugin: Pick<Plugin, "auth"> | undefined,
): boolean {
  return Boolean(
    plugin?.auth &&
    plugin.auth.type !== "none" &&
    plugin.auth.required !== false,
  );
}

export function normalizeActivePluginIds(
  pluginIds: unknown,
  installedPlugins: Plugin[],
  pluginConfigs: Record<string, PluginConfig>,
  options: { unauthenticatedAllowedPluginIds?: string[] } = {},
): string[] {
  const pluginsById = new Map(
    installedPlugins.map((plugin) => [plugin.id, plugin]),
  );
  const unauthenticatedAllowed = new Set(
    options.unauthenticatedAllowedPluginIds || [],
  );
  const normalized: string[] = [];

  for (const pluginId of normalizePluginIdRefs(pluginIds, pluginsById.keys())) {
    const plugin = pluginsById.get(pluginId);
    if (!plugin) continue;

    const needsAuth = isPluginAuthRequired(plugin);
    const hasAuth = hasPluginAuthValue(pluginConfigs[pluginId]?.auth);
    if (needsAuth && !hasAuth && !unauthenticatedAllowed.has(pluginId)) {
      continue;
    }

    normalized.push(pluginId);
  }

  return normalized;
}
