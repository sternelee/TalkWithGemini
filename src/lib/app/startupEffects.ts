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
  appliedPresetSyncKey?: string | null,
  nextPresetSyncKey?: string | null,
): boolean {
  return (
    shouldSyncSessionPlugins(settingsHydrated, chatHydrated) &&
    Array.isArray(pluginIds) &&
    (!nextPresetSyncKey || appliedPresetSyncKey !== nextPresetSyncKey)
  );
}

export function getSessionPluginPresetSyncKey(
  sessionId: string | null | undefined,
  pluginIds: unknown,
): string | null {
  if (!sessionId || !Array.isArray(pluginIds)) {
    return null;
  }

  return `${sessionId}:${JSON.stringify([...pluginIds].sort())}`;
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
