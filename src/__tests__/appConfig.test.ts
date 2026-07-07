import { describe, expect, it } from "vitest";
import { CHAT_CONFIG_LIMITS, SYSTEM_SETTINGS_LIMITS } from "../config/limits";
import {
  DEFAULT_CHAT_CONFIG,
  DEFAULT_SYSTEM_SETTINGS,
} from "../config/defaults";
import {
  normalizeChatConfig,
  normalizeSystemSettings,
} from "../lib/settings/appConfig";

describe("app config normalization", () => {
  it("normalizes chat config booleans and clamps temperature", () => {
    expect(
      normalizeChatConfig({
        useSearch: "yes",
        useReasoning: true,
        reasoningMode: "medium",
        useRAG: true,
        temperature: 99,
      }),
    ).toEqual({
      useSearch: false,
      useReasoning: true,
      reasoningMode: "medium",
      useRAG: true,
      temperature: CHAT_CONFIG_LIMITS.maxTemperature,
    });

    expect(normalizeChatConfig({ temperature: Number.NaN }).temperature).toBe(
      DEFAULT_CHAT_CONFIG.temperature,
    );
  });

  it("uses shared defaults for missing app config fields", () => {
    expect(normalizeChatConfig({})).toEqual(DEFAULT_CHAT_CONFIG);
    expect(normalizeSystemSettings({})).toEqual(DEFAULT_SYSTEM_SETTINGS);
    expect(DEFAULT_SYSTEM_SETTINGS.enableHtmlVisualPrompt).toBe(true);
    expect(DEFAULT_SYSTEM_SETTINGS.personality).toBe("default");
  });

  it("migrates legacy reasoning booleans to reasoning modes", () => {
    expect(normalizeChatConfig({ useReasoning: true }).reasoningMode).toBe(
      "high",
    );
    expect(normalizeChatConfig({ useReasoning: false }).reasoningMode).toBe(
      "off",
    );
    expect(
      normalizeChatConfig({
        useReasoning: false,
        reasoningMode: "auto",
      }),
    ).toMatchObject({
      useReasoning: true,
      reasoningMode: "auto",
    });
    expect(normalizeChatConfig({ reasoningMode: "xhigh" })).toMatchObject({
      useReasoning: false,
      reasoningMode: "off",
    });
  });

  it("normalizes system settings text and numeric ranges", () => {
    const system = normalizeSystemSettings({
      systemPrompt: "x".repeat(SYSTEM_SETTINGS_LIMITS.maxSystemPromptChars + 1),
      enableAutoTitle: "yes",
      enableRelatedQuestions: false,
      enableAutoCompression: false,
      compressionThreshold: 999,
      historyKeepCount: 0,
      enableCodeCollapse: true,
      enableHtmlVisualPrompt: true,
    });

    expect(system.systemPrompt).toHaveLength(
      SYSTEM_SETTINGS_LIMITS.maxSystemPromptChars,
    );
    expect(system.enableAutoTitle).toBe(true);
    expect(system.enableRelatedQuestions).toBe(false);
    expect(system.enableAutoCompression).toBe(false);
    expect(system.compressionThreshold).toBe(
      SYSTEM_SETTINGS_LIMITS.maxCompressionThreshold,
    );
    expect(system.historyKeepCount).toBe(
      SYSTEM_SETTINGS_LIMITS.minHistoryKeepCount,
    );
    expect(system.enableCodeCollapse).toBe(true);
    expect(system.enableHtmlVisualPrompt).toBe(true);
  });

  it("normalizes system font size", () => {
    expect(normalizeSystemSettings({ fontSize: "large" }).fontSize).toBe(
      "large",
    );
    expect(normalizeSystemSettings({ fontSize: "huge" }).fontSize).toBe(
      DEFAULT_SYSTEM_SETTINGS.fontSize,
    );
  });

  it("normalizes system personality without legacy reply style fields", () => {
    expect(normalizeSystemSettings({ personality: "efficient" })).toMatchObject(
      {
        personality: "efficient",
      },
    );
    expect(normalizeSystemSettings({ personality: "verbose" })).toMatchObject({
      personality: DEFAULT_SYSTEM_SETTINGS.personality,
    });
    expect(
      normalizeSystemSettings({ replyStyle: "concise" }),
    ).not.toHaveProperty("replyStyle");
    expect(normalizeSystemSettings({ replyTone: "direct" })).not.toHaveProperty(
      "replyTone",
    );
  });
});
