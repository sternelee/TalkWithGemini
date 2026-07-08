import { useSettingsStore } from "../store/core/settingsStore";
import { UNSPLASH_PLUGIN } from "../config/plugins";
import {
  getPluginFunctionNameCollisions,
  resolvePluginFunction,
} from "../lib/plugin/resolve";
import { readJsonResponseOrThrow, signedApiFetch } from "../lib/api/client";
import {
  getPluginExecutionArgsError,
  getPluginExecutionFunctionNameError,
  serializePluginExecutionPayload,
  type PluginExecutionPayload,
  type PluginExecutionRequestPayload,
  type PluginExecutionAuthConfig,
} from "../lib/plugin/execution";
import { encryptSecret, fetchWithByokRetry } from "../lib/byok/client";
import { BYOK_CONTEXTS } from "../lib/byok/shared";
import type { Plugin, PluginConfig, PluginFunction } from "../types";
import {
  hasPluginAuthValue,
  resolvePluginAuthValue,
} from "../lib/security/localSecretResolvers";

type PluginExecutionResponse = {
  error?: string;
  result?: any;
};

async function postPluginExecution(
  buildPayload: () => Promise<
    PluginExecutionPayload | PluginExecutionRequestPayload
  >,
  signal?: AbortSignal,
) {
  return fetchWithByokRetry(async () => {
    const payload = await buildPayload();
    return signedApiFetch("/api/plugins/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: serializePluginExecutionPayload(payload),
      signal,
    });
  });
}

async function postPluginExecutionWithLegacyFallback(
  buildPrimaryPayload: () => Promise<PluginExecutionRequestPayload>,
  buildLegacyPayload: () => Promise<PluginExecutionPayload>,
  signal?: AbortSignal,
) {
  const response = await postPluginExecution(buildPrimaryPayload, signal);
  if (response.status !== 404) return response;
  return postPluginExecution(buildLegacyPayload, signal);
}

async function buildPluginAuthConfig(
  pluginId: string,
  authConfig?: PluginExecutionAuthConfig | PluginConfig["auth"],
  baseUrl?: string,
  model?: string,
): Promise<PluginExecutionAuthConfig | undefined> {
  if (!authConfig && !baseUrl && !model) return undefined;
  if (!authConfig) {
    return {
      ...(baseUrl ? { baseUrl } : {}),
      ...(model ? { model } : {}),
    };
  }

  const value = await resolvePluginAuthValue(pluginId, authConfig);

  return {
    type: authConfig?.type,
    key: authConfig?.key,
    addTo: authConfig?.addTo,
    ...(baseUrl ? { baseUrl } : {}),
    ...(model ? { model } : {}),
    valueSecret: await encryptSecret(value, BYOK_CONTEXTS.pluginAuth(pluginId)),
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function executeBackendPluginFunction(
  plugin: Plugin,
  functionDef: PluginFunction,
  args: Record<string, unknown>,
  authConfig: PluginExecutionAuthConfig | undefined,
  signal?: AbortSignal,
): Promise<any> {
  const response = await postPluginExecutionWithLegacyFallback(
    async () => ({
      pluginId: plugin.id,
      functionName: functionDef.name,
      args,
      authConfig,
    }),
    async () => ({
      plugin,
      functionDef,
      args,
      authConfig,
    }),
    signal,
  );

  const data = await readJsonResponseOrThrow<PluginExecutionResponse>(
    response,
    "Plugin execution failed",
  );

  if (data.error) {
    return { error: data.error };
  }

  return data.result;
}

/**
 * Executes a specific function from an installed plugin.
 * Uses backend API to avoid CORS issues.
 */
export const executePluginFunction = async (
  functionName: string,
  args: any,
  authOverride?: any,
  allowedPluginIds?: string[],
  signal?: AbortSignal,
): Promise<any> => {
  const functionNameError = getPluginExecutionFunctionNameError(functionName);
  if (functionNameError) {
    return { error: functionNameError };
  }

  const argsError = getPluginExecutionArgsError(args);
  if (argsError) {
    return { error: argsError };
  }
  const executionArgs = args as Record<string, unknown>;

  const { installedPlugins, pluginConfigs } = useSettingsStore.getState();
  const collision = getPluginFunctionNameCollisions(
    installedPlugins,
    allowedPluginIds,
    pluginConfigs,
  ).find((item) => item.name === functionName);
  if (collision) {
    return {
      error: `Function ${functionName} is provided by multiple active plugins: ${collision.pluginIds.join(", ")}.`,
    };
  }

  const resolved = resolvePluginFunction(
    installedPlugins,
    functionName,
    allowedPluginIds,
  );

  if (!resolved) {
    return { error: `Function ${functionName} not found.` };
  }

  const { plugin: foundPlugin, functionDef: foundFn } = resolved;
  const config = pluginConfigs[foundPlugin.id];

  // --- Special Handling for Unsplash ---
  if (foundPlugin.id === UNSPLASH_PLUGIN.id) {
    if (functionName === "search_photos") {
      try {
        const hasAuth =
          !!authOverride?.value || hasPluginAuthValue(config?.auth);

        // Prepare modified args for Unsplash
        const modifiedArgs = { ...executionArgs };
        const modifiedPlugin = { ...foundPlugin };

        if (hasAuth) {
          modifiedPlugin.baseUrl = "https://api.unsplash.com";
          // Auth will be handled by backend
        } else {
          modifiedPlugin.baseUrl = "https://unsplash.com/napi";
        }

        const buildAuth = () =>
          buildPluginAuthConfig(
            modifiedPlugin.id,
            hasAuth ? authOverride || config?.auth : undefined,
            config?.baseUrl,
            config?.model,
          );
        const response = await postPluginExecutionWithLegacyFallback(
          async () => ({
            pluginId: modifiedPlugin.id,
            functionName: foundFn.name,
            args: modifiedArgs,
            authConfig: await buildAuth(),
          }),
          async () => ({
            plugin: modifiedPlugin,
            functionDef: foundFn,
            args: modifiedArgs,
            authConfig: await buildAuth(),
          }),
          signal,
        );

        const data = await readJsonResponseOrThrow<PluginExecutionResponse>(
          response,
          "Plugin execution failed",
        );

        if (data.error) {
          return { error: data.error };
        }

        const json = data.result;

        if (json.results && Array.isArray(json.results)) {
          return json.results.map((item: any) => ({
            alt_description: item.alt_description,
            created_at: item.created_at,
            likes: item.likes,
            url: item.urls?.regular,
          }));
        }

        return json;
      } catch (e) {
        if (isAbortError(e)) throw e;
        return { error: String(e) };
      }
    }
  }

  // --- Standard Generic Execution via Backend API ---
  try {
    const authConfig = await buildPluginAuthConfig(
      foundPlugin.id,
      authOverride || config?.auth,
      config?.baseUrl,
      config?.model,
    );
    return await executeBackendPluginFunction(
      foundPlugin,
      foundFn,
      executionArgs,
      authConfig,
      signal,
    );
  } catch (e) {
    if (isAbortError(e)) throw e;
    return { error: String(e) };
  }
};
