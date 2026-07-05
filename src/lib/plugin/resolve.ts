import type { Plugin, PluginFunction } from "@/types";

export interface ResolvedPluginFunction {
  plugin: Plugin;
  functionDef: PluginFunction;
}

export function resolvePluginFunction(
  installedPlugins: Plugin[],
  functionName: string,
  allowedPluginIds?: string[],
): ResolvedPluginFunction | null {
  const allowed = allowedPluginIds?.length ? new Set(allowedPluginIds) : null;

  for (const plugin of installedPlugins) {
    if (allowed && !allowed.has(plugin.id)) continue;

    const functionDef = plugin.functions?.find(
      (fn) => fn.name === functionName,
    );
    if (functionDef) {
      return { plugin, functionDef };
    }
  }

  return null;
}

export function getEnabledPluginFunctions(
  plugin: Plugin,
  pluginConfig?: {
    enabledFunctions?: string[];
    disabledFunctions?: string[];
  },
): PluginFunction[] {
  let functionsToAdd = plugin.functions || [];

  if (pluginConfig?.enabledFunctions) {
    functionsToAdd = functionsToAdd.filter((fn) =>
      pluginConfig.enabledFunctions!.includes(fn.name),
    );
  } else if (pluginConfig?.disabledFunctions) {
    functionsToAdd = functionsToAdd.filter(
      (fn) => !pluginConfig.disabledFunctions!.includes(fn.name),
    );
  }

  return functionsToAdd;
}

export function getPluginFunctionNameCollisions(
  installedPlugins: Plugin[],
  activePluginIds: string[] | undefined,
  pluginConfigs: Record<
    string,
    { enabledFunctions?: string[]; disabledFunctions?: string[] } | undefined
  > = {},
): Array<{ name: string; pluginIds: string[] }> {
  const active = activePluginIds?.length ? new Set(activePluginIds) : null;
  const names = new Map<string, string[]>();

  for (const plugin of installedPlugins) {
    if (active && !active.has(plugin.id)) continue;
    for (const fn of getEnabledPluginFunctions(
      plugin,
      pluginConfigs[plugin.id],
    )) {
      const pluginIds = names.get(fn.name) || [];
      if (!pluginIds.includes(plugin.id)) {
        pluginIds.push(plugin.id);
      }
      names.set(fn.name, pluginIds);
    }
  }

  return Array.from(names.entries())
    .filter(([, pluginIds]) => pluginIds.length > 1)
    .map(([name, pluginIds]) => ({ name, pluginIds }));
}
