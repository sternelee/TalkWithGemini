import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en.json";
import zh from "../i18n/locales/zh.json";

describe("settings data export", () => {
  it("exposes local-first data export from system settings with bilingual copy", () => {
    const systemSettings = readFileSync(
      resolve(process.cwd(), "src/components/settings/SystemSettings.tsx"),
      "utf8",
    );
    const settingsStore = readFileSync(
      resolve(process.cwd(), "src/store/core/settingsStore.ts"),
      "utf8",
    );

    expect(systemSettings).toContain("handleExportAllData");
    expect(settingsStore).toContain("createBrowserAppExportPayload");
    expect(en.System.exportAllData).toBeTruthy();
    expect(zh.System.exportAllData).toBeTruthy();
    expect(en.System.exportError).toBeTruthy();
    expect(zh.System.exportError).toBeTruthy();
  });
});
