import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en/Plugin.json";
import ja from "../i18n/locales/ja/Plugin.json";
import zh from "../i18n/locales/zh/Plugin.json";

const locales = { en, zh, ja };
const localeMessages = Object.values(locales) as Array<Record<string, string>>;

describe("Plugin i18n messages", () => {
  it("keeps the OpenAPI placeholder free of raw ICU braces", () => {
    for (const messages of localeMessages) {
      expect(messages.openApiPlaceholder).toContain("OpenAPI");
      expect(messages.openApiPlaceholder).not.toContain("{");
      expect(messages.openApiPlaceholder).not.toContain("}");
    }
  });

  it("defines the custom MCP install modal copy in all supported locales", () => {
    const requiredKeys = [
      "addCustomMcpServer",
      "closeCustomMcpInstaller",
      "installCustomMcpAria",
      "mcpServerNameLabel",
      "mcpServerNamePlaceholder",
      "mcpServerUrlLabel",
      "mcpServerUrlPlaceholder",
      "mcpServerUrlHint",
      "mcpBearerTokenLabel",
      "mcpBearerTokenPlaceholder",
      "mcpBearerTokenHint",
      "installedMcpServers",
      "installedPluginTools",
      "installedMcpTools",
      "customMcp",
    ] as const;

    for (const messages of localeMessages) {
      for (const key of requiredKeys) {
        expect(messages[key], key).toEqual(expect.any(String));
        expect(messages[key].trim(), key).not.toBe("");
      }
    }
  });
});
