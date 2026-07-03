import { describe, expect, it } from "vitest";
import {
  shouldApplySessionPluginPreset,
  shouldResolveSelectedModelAfterBootstrap,
  shouldRunSettingsStartupEffects,
  shouldSyncSessionPlugins,
} from "../lib/app/startupEffects";

describe("app startup effects", () => {
  it("waits for settings hydration before running settings writes", () => {
    expect(shouldRunSettingsStartupEffects(false)).toBe(false);
    expect(shouldRunSettingsStartupEffects(true)).toBe(true);
  });

  it("waits for chat and settings hydration before syncing session plugins", () => {
    expect(shouldSyncSessionPlugins(false, false)).toBe(false);
    expect(shouldSyncSessionPlugins(true, false)).toBe(false);
    expect(shouldSyncSessionPlugins(false, true)).toBe(false);
    expect(shouldSyncSessionPlugins(true, true)).toBe(true);
  });

  it("applies session plugin presets only when a non-empty preset exists", () => {
    expect(shouldApplySessionPluginPreset(false, true, ["weather-gpt"])).toBe(
      false,
    );
    expect(shouldApplySessionPluginPreset(true, true, undefined)).toBe(false);
    expect(shouldApplySessionPluginPreset(true, true, [])).toBe(false);
    expect(shouldApplySessionPluginPreset(true, true, ["weather-gpt"])).toBe(
      true,
    );
  });

  it("waits for server model bootstrap before auto-selecting a model", () => {
    expect(
      shouldResolveSelectedModelAfterBootstrap({
        chatHydrated: true,
        settingsHydrated: true,
        coreHydrated: true,
        serverModelBootstrapReady: false,
      }),
    ).toBe(false);
  });

  it("allows auto-selection after server model bootstrap succeeds or fails", () => {
    expect(
      shouldResolveSelectedModelAfterBootstrap({
        chatHydrated: true,
        settingsHydrated: true,
        coreHydrated: true,
        serverModelBootstrapReady: true,
      }),
    ).toBe(true);
  });
});
