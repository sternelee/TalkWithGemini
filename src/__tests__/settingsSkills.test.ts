import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillCatalog, TextSkill } from "../types";

vi.mock("server-only", () => ({}));

vi.mock("@/config/api", async () => vi.importActual("../config/api"));
vi.mock("@/config/defaults", async () => vi.importActual("../config/defaults"));
vi.mock("@/config/limits", async () => vi.importActual("../config/limits"));
vi.mock("@/config/plugins", async () => vi.importActual("../config/plugins"));
vi.mock("@/lib/defaultConfig/shared", async () =>
  vi.importActual("../lib/defaultConfig/shared"),
);
vi.mock("@/lib/market/agents", async () =>
  vi.importActual("../lib/market/agents"),
);
vi.mock("@/lib/providers/metadata", async () =>
  vi.importActual("../lib/providers/metadata"),
);
vi.mock("@/lib/providers/config", async () =>
  vi.importActual("../lib/providers/config"),
);
vi.mock("@/lib/providers/providerTypes", async () =>
  vi.importActual("../lib/providers/providerTypes"),
);
vi.mock("@/lib/security/urlPolicy", async () =>
  vi.importActual("../lib/security/urlPolicy"),
);
vi.mock("@/lib/utils/defaultModels", async () =>
  vi.importActual("../lib/utils/defaultModels"),
);

const makeSkill = (id: string, title = id): TextSkill => ({
  id,
  name: id,
  title,
  description: `${title} description`,
  category: "writing",
  tags: ["writing"],
  audience: "user-facing",
  language: "en",
  outputFormat: "markdown",
  risk: {
    level: "low",
    textOnly: true,
    scriptRequired: false,
    externalToolRequired: false,
    networkRequired: false,
    reviewRequiredForHighStakes: true,
  },
  activation: {
    embeddingText: title,
    useWhen: [`Use ${title}`],
    avoidWhen: [],
    exampleQueries: [],
  },
  content: `# ${title}\n\nFollow this skill.`,
  builtIn: true,
});

describe("settings skill installation", () => {
  beforeEach(async () => {
    const { useSettingsStore } = await import("../store/core/settingsStore");
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  });

  it("installs full skill definitions and uninstalling removes active refs", async () => {
    const { useSettingsStore } = await import("../store/core/settingsStore");
    const skill = makeSkill("clarity-rewrite", "Clarity Rewrite");

    useSettingsStore.getState().installSkill(skill);
    useSettingsStore.getState().setActiveSkillIds([skill.id]);
    useSettingsStore.getState().uninstallSkill(skill.id);

    expect(useSettingsStore.getState().installedSkills).toEqual([]);
    expect(useSettingsStore.getState().activeSkillIds).toEqual([]);
  });

  it("updates installed built-in skills as local overrides", async () => {
    const { useSettingsStore } = await import("../store/core/settingsStore");
    const skill = makeSkill("translation-localization", "Translation");

    useSettingsStore.getState().installSkill(skill);
    useSettingsStore.getState().updateInstalledSkill(skill.id, {
      title: "Project Translation",
      content: "# Project Translation\n\nUse project vocabulary.",
    });

    expect(useSettingsStore.getState().installedSkills).toMatchObject([
      {
        id: skill.id,
        title: "Project Translation",
        content: "# Project Translation\n\nUse project vocabulary.",
        builtIn: true,
        isCustom: true,
      },
    ]);
  });

  it("persists installed skills in the IndexedDB-backed settings snapshot", async () => {
    const { useSettingsStore } = await import("../store/core/settingsStore");
    const skill = makeSkill("meeting-minutes", "Meeting Minutes");

    useSettingsStore.getState().installSkill(skill);
    const partialize = (useSettingsStore as any).persist.getOptions()
      .partialize;
    const persisted = partialize(useSettingsStore.getState());

    expect(persisted.installedSkills).toEqual([
      expect.objectContaining({
        id: skill.id,
        content: skill.content,
      }),
    ]);
  });

  it("persists skill market catalog and definition caches", async () => {
    const { useSettingsStore } = await import("../store/core/settingsStore");
    const skill = makeSkill("clarity-rewrite", "Clarity Rewrite");
    const catalog: SkillCatalog = {
      schemaVersion: "skills-v1",
      generatedAt: "2026-07-04",
      locale: "en",
      datasetName: "Skills",
      description: "Text skills",
      intendedRuntime: {
        environment: "browser-or-web-app",
        storage: "public-json",
        executionModel: "load catalog and selected definitions",
        supportsScripts: false,
        supportsExternalTools: false,
        supportsNetwork: false,
      },
      globalPolicy: {},
      skillCount: 1,
      categories: ["writing"],
      skills: [{ ...skill, file: "clarity-rewrite.json" }],
    };

    useSettingsStore.getState().setSkillCatalog("en", catalog);
    useSettingsStore
      .getState()
      .setSkillDefinition("en:clarity-rewrite.json", skill);
    const partialize = (useSettingsStore as any).persist.getOptions()
      .partialize;
    const persisted = partialize(useSettingsStore.getState());

    expect(persisted.skillCatalogs.en.skills).toEqual([
      expect.objectContaining({ id: skill.id }),
    ]);
    expect(persisted.skillCatalogTimestamps.en).toBeGreaterThan(0);
    expect(persisted.skillDefinitions["en:clarity-rewrite.json"]).toEqual(
      expect.objectContaining({ content: skill.content }),
    );
    expect(
      persisted.skillDefinitionTimestamps["en:clarity-rewrite.json"],
    ).toBeGreaterThan(0);
  });

  it("preserves Japanese skill catalog caches during persisted settings migration", async () => {
    const { useSettingsStore } = await import("../store/core/settingsStore");
    const skill = makeSkill("jp-writing", "JP Writing");
    const catalog: SkillCatalog = {
      schemaVersion: "skills-v1",
      generatedAt: "2026-07-04",
      locale: "ja",
      datasetName: "Skills",
      description: "Text skills",
      intendedRuntime: {
        environment: "browser-or-web-app",
        storage: "public-json",
        executionModel: "load catalog and selected definitions",
        supportsScripts: false,
        supportsExternalTools: false,
        supportsNetwork: false,
      },
      globalPolicy: {},
      skillCount: 1,
      categories: ["writing"],
      skills: [{ ...skill, file: "jp-writing.json" }],
    };
    const migrate = (useSettingsStore as any).persist.getOptions().migrate;

    const migrated = await migrate(
      {
        skillCatalogs: { ja: catalog },
        skillCatalogTimestamps: { ja: 1_700_000_000_000 },
      },
      0,
    );

    expect(migrated.skillCatalogs.ja).toMatchObject({
      locale: "ja",
      skills: [expect.objectContaining({ id: "jp-writing" })],
    });
    expect(migrated.skillCatalogTimestamps.ja).toBe(1_700_000_000_000);
  });
});
