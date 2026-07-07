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
  });

  it("exposes memory management as a settings tab", () => {
    const settingsPage = readFileSync(
      resolve(process.cwd(), "src/components/settings/SettingsPage.tsx"),
      "utf8",
    );

    expect(settingsPage).toContain('id: "memory"');
    expect(settingsPage).toContain("tabMemory");
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
