import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en";
import ja from "../i18n/locales/ja";
import zh from "../i18n/locales/zh";

describe("settings UI primitives", () => {
  it("uses shadcn-style semantic tokens for select and switch controls", () => {
    const settingsUi = readFileSync(
      resolve(process.cwd(), "src/components/settings/SettingsUI.tsx"),
      "utf8",
    );

    expect(settingsUi).toContain("bg-background");
    expect(settingsUi).toContain("border-input");
    expect(settingsUi).toContain("focus-visible:ring-ring");
    expect(settingsUi).toContain("data-[state=checked]");
    expect(settingsUi).toContain("handleListboxKeyDown");
    expect(settingsUi).toContain('event.key === "ArrowDown"');
    expect(settingsUi).toContain('event.key === "Home"');
    expect(settingsUi).toContain('event.key === "End"');
    expect(settingsUi).toContain("aria-activedescendant");
    expect(settingsUi).toContain(
      "focus-visible:ring-2 focus-visible:ring-blue-500/60",
    );
  });

  it("exposes memory management as a settings tab", () => {
    const settingsPage = readFileSync(
      resolve(process.cwd(), "src/components/settings/SettingsPage.tsx"),
      "utf8",
    );

    expect(settingsPage).toContain('id: "memory"');
    expect(settingsPage).toContain("tabMemory");
  });

  it("organizes system settings into scalable grouped sections", () => {
    const systemSettings = readFileSync(
      resolve(process.cwd(), "src/components/settings/SystemSettings.tsx"),
      "utf8",
    );

    expect(systemSettings).toContain("SystemSection");
    expect(systemSettings).toContain("SettingRow");
    expect(systemSettings).toContain("ToggleRow");
    expect(systemSettings).toContain("RadioDropdown");
    expect(systemSettings).toContain("INTERFACE_LANGUAGE_OPTIONS");
    expect(systemSettings).toContain("systemInterfaceTitle");
    expect(systemSettings).toContain("systemAssistantTitle");
    expect(systemSettings).toContain("systemAutomationTitle");
    expect(systemSettings).toContain("systemDataTitle");
    expect(en.System.systemInterfaceTitle).toBeTruthy();
    expect(zh.System.systemInterfaceTitle).toBeTruthy();
    expect(ja.System.systemInterfaceTitle).toBeTruthy();
  });

  it("uses a dropdown for interface language instead of a fixed segmented control", () => {
    const systemSettings = readFileSync(
      resolve(process.cwd(), "src/components/settings/SystemSettings.tsx"),
      "utf8",
    );
    const languageAriaIndex = systemSettings.indexOf("interfaceLanguageAria");
    const languageControlIndex = systemSettings.lastIndexOf(
      "RadioDropdown",
      languageAriaIndex,
    );
    const languageSection = systemSettings.slice(
      languageControlIndex,
      systemSettings.indexOf('title={t("fontSize")}', languageControlIndex),
    );

    expect(systemSettings).toContain("INTERFACE_LANGUAGE_OPTIONS");
    expect(languageSection).toContain("RadioDropdown");
    expect(languageSection).not.toContain("SegmentedControl");
  });

  it("keeps personality selection compact and trims option descriptions on mobile", () => {
    const systemSettings = readFileSync(
      resolve(process.cwd(), "src/components/settings/SystemSettings.tsx"),
      "utf8",
    );
    const personalizationIndex = systemSettings.indexOf(
      'title={t("personalization")}',
    );
    const personalitySection = systemSettings.slice(
      personalizationIndex,
      systemSettings.indexOf('title={t("systemPrompt")}', personalizationIndex),
    );

    expect(personalitySection).toContain('controlClassName="sm:w-64"');
    expect(personalitySection).toContain("hideOptionDescriptionsOnMobile");
    expect(systemSettings).toContain("hideOptionDescriptionsOnMobile = false");
    expect(systemSettings).toContain("hidden sm:block");
  });

  it("exposes image generation as a model capability in provider settings", () => {
    const providerSettings = readFileSync(
      resolve(process.cwd(), "src/components/settings/ProviderSettings.tsx"),
      "utf8",
    );
    const modelEditor = readFileSync(
      resolve(process.cwd(), "src/components/settings/ModelEditor.tsx"),
      "utf8",
    );

    expect(providerSettings).toContain("supportsImageGeneration");
    expect(providerSettings).toContain("capImageGeneration");
    expect(providerSettings).toContain("Image as ImageIcon");
    expect(modelEditor).toContain("image_generation");
    expect(modelEditor).toContain("modalities");
    expect(modelEditor).toContain("output:");
    expect(modelEditor).toContain("capImageGeneration");
    expect(en.Providers.capImageGeneration).toBe("Image Generation");
    expect(zh.Providers.capImageGeneration).toBe("图片生成");
    expect(ja.Providers.capImageGeneration).toBe("画像生成");
    expect(en.ModelEditor.capImageGeneration).toBe("Image Generation");
    expect(zh.ModelEditor.capImageGeneration).toBe("图片生成");
    expect(ja.ModelEditor.capImageGeneration).toBe("画像生成");
  });
});
