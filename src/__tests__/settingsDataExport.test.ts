import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en";
import ja from "../i18n/locales/ja";
import zh from "../i18n/locales/zh";

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

  it("uses one personality dropdown instead of separate style and tone controls", () => {
    const systemSettings = readFileSync(
      resolve(process.cwd(), "src/components/settings/SystemSettings.tsx"),
      "utf8",
    );

    expect(systemSettings).toContain("PERSONALITY_OPTIONS");
    expect(systemSettings).toContain("personalityDropdown");
    expect(systemSettings).toContain("system.personality");
    expect(systemSettings).toMatch(/updateSystemSettings\(\{\s*personality:/);
    expect(systemSettings).not.toContain("replyStyle");
    expect(systemSettings).not.toContain("replyTone");
    expect(en.System.personalityProfessional).toBeTruthy();
    expect(zh.System.personalityProfessional).toBe("专业可靠");
    expect(ja.System.personalityProfessional).toBeTruthy();
  });

  it("keeps data cleanup hidden behind a disclosure by default", () => {
    const systemSettings = readFileSync(
      resolve(process.cwd(), "src/components/settings/SystemSettings.tsx"),
      "utf8",
    );

    expect(systemSettings).toContain("isDataCleanupOpen");
    expect(systemSettings).toContain("aria-expanded={isDataCleanupOpen}");
    expect(systemSettings).toContain("{isDataCleanupOpen ? (");
    expect(en.System.showDataCleanup).toBeTruthy();
    expect(zh.System.showDataCleanup).toBeTruthy();
  });

  it("groups cleanup sources for scalable data management", () => {
    const systemSettings = readFileSync(
      resolve(process.cwd(), "src/components/settings/SystemSettings.tsx"),
      "utf8",
    );

    expect(systemSettings).toContain("DATA_SOURCE_GROUPS");
    expect(systemSettings).toContain("dataGroupStorage");
    expect(systemSettings).toContain("dataGroupConversations");
    expect(systemSettings).toContain("dataGroupKnowledge");
    expect(systemSettings).toContain("group.sources.map");
    expect(en.System.dataGroupStorage).toBeTruthy();
    expect(zh.System.dataGroupStorage).toBeTruthy();
    expect(ja.System.dataGroupStorage).toBeTruthy();
  });
});
