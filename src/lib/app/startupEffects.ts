export function shouldRunSettingsStartupEffects(
  settingsHydrated: boolean,
): boolean {
  return settingsHydrated;
}

export function shouldSyncSessionPlugins(
  settingsHydrated: boolean,
  chatHydrated: boolean,
): boolean {
  return settingsHydrated && chatHydrated;
}

export function shouldApplySessionPluginPreset(
  settingsHydrated: boolean,
  chatHydrated: boolean,
  pluginIds: unknown,
): boolean {
  return (
    shouldSyncSessionPlugins(settingsHydrated, chatHydrated) &&
    Array.isArray(pluginIds) &&
    pluginIds.length > 0
  );
}

export function shouldResolveSelectedModelAfterBootstrap({
  chatHydrated,
  settingsHydrated,
  coreHydrated,
  serverModelBootstrapReady,
}: {
  chatHydrated: boolean;
  settingsHydrated: boolean;
  coreHydrated: boolean;
  serverModelBootstrapReady: boolean;
}): boolean {
  return (
    chatHydrated &&
    settingsHydrated &&
    coreHydrated &&
    serverModelBootstrapReady
  );
}
