import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("market hydration composition", () => {
  it("gates assistant and plugin market network loads on settings hydration", () => {
    const assistantHub = readFileSync(
      resolve(process.cwd(), "src/components/assistant/AssistantHub.tsx"),
      "utf8",
    );
    const pluginMarket = readFileSync(
      resolve(process.cwd(), "src/components/plugin/PluginMarket.tsx"),
      "utf8",
    );

    expect(assistantHub).toContain("_hasHydrated");
    expect(assistantHub).toContain("getCachedAgentsForLocale");
    expect(assistantHub).toContain("if (!_hasHydrated) return");
    expect(pluginMarket).toContain("_hasHydrated");
    expect(pluginMarket).toContain("getCachedPlugins");
    expect(pluginMarket).toContain("if (!_hasHydrated) return");
  });

  it("keeps image plugin endpoint configuration user-controlled", () => {
    const pluginMarket = readFileSync(
      resolve(process.cwd(), "src/components/plugin/PluginMarket.tsx"),
      "utf8",
    );

    expect(pluginMarket).toContain("ENDPOINT_CONFIG_PLUGIN_IDS");
    expect(pluginMarket).toContain('"openai-image-generation"');
    expect(pluginMarket).toContain('"gemini-image-generation"');
    expect(pluginMarket).toContain('"openai-responses-image-processing"');
    expect(pluginMarket).toContain("baseUrl: endpointValue");
    expect(pluginMarket).toContain('t("endpointLabel")');
    expect(pluginMarket).toContain('t("endpointHint")');
    expect(pluginMarket).toContain("getEndpointPlaceholder");
    expect(pluginMarket).toContain("MODEL_CONFIG_PLUGIN_IDS");
    expect(pluginMarket).toContain('"agnes-video-generation"');
    expect(pluginMarket).toContain("modelValue");
    expect(pluginMarket).toContain("model: modelValue");
    expect(pluginMarket).toContain('t("modelLabel")');
    expect(pluginMarket).toContain('t("modelHint")');
    expect(pluginMarket).toContain("getModelPlaceholder");
    expect(pluginMarket).toContain('"agnes-video-v2.0"');
  });
});
