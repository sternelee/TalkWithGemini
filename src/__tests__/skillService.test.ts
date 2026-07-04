import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillCatalog, TextSkill } from "../types";

const storeMock = vi.hoisted(() => ({
  state: {} as {
    skillCatalogs: Partial<Record<"en" | "zh-CN", SkillCatalog>>;
    skillCatalogTimestamps: Partial<Record<"en" | "zh-CN", number>>;
    skillDefinitions: Record<string, TextSkill>;
    skillDefinitionTimestamps: Record<string, number>;
    setSkillCatalog: ReturnType<typeof vi.fn>;
    setSkillDefinition: ReturnType<typeof vi.fn>;
  },
}));

const chatServiceMock = vi.hoisted(() => ({
  streamGenerateToolCall: vi.fn(),
}));

vi.mock("@/store/core/settingsStore", () => ({
  useSettingsStore: {
    getState: () => storeMock.state,
  },
}));

vi.mock("../services/api/chatService", () => ({
  streamGenerateToolCall: chatServiceMock.streamGenerateToolCall,
}));

const baseRisk = {
  level: "low",
  textOnly: true,
  scriptRequired: false,
  externalToolRequired: false,
  networkRequired: false,
  reviewRequiredForHighStakes: true,
};

const zhCatalog = {
  schemaVersion: "skills-v1",
  generatedAt: "2026-07-04",
  locale: "zh-CN",
  datasetName: "Skills Starter Set",
  description: "纯文本 skills。",
  intendedRuntime: {
    environment: "browser-or-web-app",
    storage: "public-json",
    executionModel: "load catalog, select skill, fetch selected definitions",
    supportsScripts: false,
    supportsExternalTools: false,
    supportsNetwork: false,
  },
  globalPolicy: {},
  skillCount: 1,
  categories: ["writing"],
  skills: [
    {
      id: "translation-localization",
      name: "translation-localization",
      title: "翻译与本地化",
      description: "翻译文本。",
      category: "writing",
      tags: ["翻译"],
      audience: "user-facing",
      language: "zh-CN",
      outputFormat: "markdown",
      risk: baseRisk,
      activation: {
        embeddingText: "翻译 本地化",
        useWhen: ["用户要求翻译"],
        avoidWhen: [],
        exampleQueries: ["翻译成英文"],
      },
      file: "translation-localization.zh-CN.json",
    },
  ],
};

const zhDefinition = {
  ...zhCatalog.skills[0],
  content: "# 翻译与本地化\n\n保留术语和占位符。",
  builtIn: true,
};

const inactiveDefinition: TextSkill = {
  id: "inactive-summary",
  name: "inactive-summary",
  title: "Inactive Summary",
  description: "Summarize text.",
  category: "reading",
  tags: ["summary"],
  audience: "user-facing",
  language: "zh-CN",
  outputFormat: "markdown",
  risk: baseRisk,
  activation: {
    embeddingText: "summary",
    useWhen: ["用户要求总结"],
    avoidWhen: [],
    exampleQueries: ["总结一下"],
  },
  content: "# Inactive Summary\n\nSummarize tightly.",
  builtIn: true,
};

const emailDefinition: TextSkill = {
  id: "email-draft",
  name: "email-draft",
  title: "Email Draft",
  description: "Draft email replies.",
  category: "writing",
  tags: ["email"],
  audience: "user-facing",
  language: "zh-CN",
  outputFormat: "markdown",
  risk: baseRisk,
  activation: {
    embeddingText: "email reply",
    useWhen: ["用户要求写邮件"],
    avoidWhen: [],
    exampleQueries: ["写一封邮件"],
  },
  content: "# Email Draft\n\nWrite concise email copy.",
  builtIn: true,
};

const toneDefinition: TextSkill = {
  id: "tone-adapter",
  name: "tone-adapter",
  title: "Tone Adapter",
  description: "Adjust tone.",
  category: "writing",
  tags: ["tone"],
  audience: "user-facing",
  language: "zh-CN",
  outputFormat: "markdown",
  risk: baseRisk,
  activation: {
    embeddingText: "tone voice",
    useWhen: ["用户要求调整语气"],
    avoidWhen: [],
    exampleQueries: ["语气更专业"],
  },
  content: "# Tone Adapter\n\nAdjust tone without changing facts.",
  builtIn: true,
};

const privacyDefinition: TextSkill = {
  id: "privacy-redaction",
  name: "privacy-redaction",
  title: "Privacy Redaction",
  description: "Redact sensitive details.",
  category: "safety",
  tags: ["privacy"],
  audience: "user-facing",
  language: "zh-CN",
  outputFormat: "markdown",
  risk: baseRisk,
  activation: {
    embeddingText: "privacy redact pii",
    useWhen: ["用户要求脱敏"],
    avoidWhen: [],
    exampleQueries: ["帮我脱敏"],
  },
  content: "# Privacy Redaction\n\nRemove sensitive identifiers.",
  builtIn: true,
};

function jsonResponse(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("skill service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    chatServiceMock.streamGenerateToolCall.mockReset();
    storeMock.state = {
      skillCatalogs: {},
      skillCatalogTimestamps: {},
      skillDefinitions: {},
      skillDefinitionTimestamps: {},
      setSkillCatalog: vi.fn((locale: "en" | "zh-CN", catalog: SkillCatalog) => {
        storeMock.state.skillCatalogs[locale] = catalog;
        storeMock.state.skillCatalogTimestamps[locale] = Date.now();
      }),
      setSkillDefinition: vi.fn((key: string, skill: TextSkill) => {
        storeMock.state.skillDefinitions[key] = skill;
        storeMock.state.skillDefinitionTimestamps[key] = Date.now();
      }),
    };
  });

  it("loads the localized catalog while chat resolution skips when no active installed skills exist", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/data/skills/skills.metadata.zh-CN.json") {
          return jsonResponse(zhCatalog);
        }
        if (url === "/data/skills/translation-localization.zh-CN.json") {
          return jsonResponse(zhDefinition);
        }
        return jsonResponse({ message: "not found" }, { status: 404 });
      });
    const { fetchSkillCatalog, resolveSkillsForMessage } =
      await import("../services/api/skillService");

    const catalog = await fetchSkillCatalog("zh");
    const result = await resolveSkillsForMessage({
      message: "请翻译成英文",
      selectedModel: "openai:gpt-4",
      locale: "zh",
      customSkills: [],
      activeSkillIds: ["translation-localization"],
      autoSelect: false,
    });

    expect(catalog.locale).toBe("zh-CN");
    expect(result.context).toBe("");
    expect(result.appliedSkills).toEqual([]);
    expect(result.invocations).toEqual([]);
    expect(chatServiceMock.streamGenerateToolCall).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "/data/skills/skills.metadata.zh-CN.json",
    ]);
  });

  it("uses active skills as candidates and injects only model-selected skills", async () => {
    chatServiceMock.streamGenerateToolCall.mockResolvedValue({
      id: "call_candidates",
      name: "select_text_skills",
      args: {
        skill_ids: ["translation-localization", "tone-adapter"],
        reason: "translation with tone adjustment",
      },
      status: "pending",
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/data/skills/skills.metadata.zh-CN.json") {
          return jsonResponse(zhCatalog);
        }
        return jsonResponse({ message: "not found" }, { status: 404 });
      });
    const { resolveSkillsForMessage } =
      await import("../services/api/skillService");

    const result = await resolveSkillsForMessage({
      message: "请翻译成英文，并让语气更专业",
      selectedModel: "openai:gpt-4",
      locale: "zh",
      installedSkills: [
        zhDefinition,
        inactiveDefinition,
        emailDefinition,
        toneDefinition,
        privacyDefinition,
      ],
      activeSkillIds: [
        "translation-localization",
        "inactive-summary",
        "email-draft",
        "tone-adapter",
        "privacy-redaction",
      ],
      autoSelect: false,
    });

    const [, prompt, tools] = chatServiceMock.streamGenerateToolCall.mock
      .calls[0];
    expect(prompt).toContain("翻译与本地化");
    expect(prompt).toContain("Inactive Summary");
    expect(prompt).toContain("Email Draft");
    expect(prompt).toContain("Tone Adapter");
    expect(prompt).toContain("Privacy Redaction");
    expect(JSON.stringify(tools)).toContain("translation-localization");
    expect(JSON.stringify(tools)).toContain("tone-adapter");
    expect(result.context).toContain("Text-only skills guidance");
    expect(result.context).toContain("# 翻译与本地化");
    expect(result.context).toContain("保留术语和占位符");
    expect(result.context).toContain("# Tone Adapter");
    expect(result.context).not.toContain("# Inactive Summary");
    expect(result.context).not.toContain("# Email Draft");
    expect(result.context).not.toContain("# Privacy Redaction");
    expect(result.appliedSkills).toMatchObject([
      { mode: "auto", skill: { id: "translation-localization" } },
      { mode: "auto", skill: { id: "tone-adapter" } },
    ]);
    expect(result.invocations).toEqual([
      {
        id: "translation-localization",
        title: "翻译与本地化",
        category: "writing",
        mode: "auto",
      },
      {
        id: "tone-adapter",
        title: "Tone Adapter",
        category: "writing",
        mode: "auto",
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(chatServiceMock.streamGenerateToolCall).toHaveBeenCalledTimes(1);
  });

  it("skips metadata and tool selection when no skills are active", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("skill resolution should not fetch"),
    );
    const { resolveSkillsForMessage } =
      await import("../services/api/skillService");

    const result = await resolveSkillsForMessage({
      message: "请翻译成英文",
      selectedModel: "openai:gpt-4",
      locale: "zh",
      installedSkills: [zhDefinition],
      activeSkillIds: [],
      autoSelect: true,
    });

    expect(result.context).toBe("");
    expect(result.appliedSkills).toEqual([]);
    expect(result.invocations).toEqual([]);
    expect(chatServiceMock.streamGenerateToolCall).not.toHaveBeenCalled();
  });

  it("injects no skill context when the model selects no candidate skills", async () => {
    chatServiceMock.streamGenerateToolCall.mockResolvedValue({
      id: "call_none",
      name: "select_text_skills",
      args: {
        skill_ids: [],
        reason: "no skill applies",
      },
      status: "pending",
    });
    const { resolveSkillsForMessage } =
      await import("../services/api/skillService");

    const result = await resolveSkillsForMessage({
      message: "普通闲聊",
      selectedModel: "openai:gpt-4",
      locale: "zh",
      installedSkills: [zhDefinition],
      activeSkillIds: ["translation-localization"],
      autoSelect: false,
    });

    expect(result.context).toBe("");
    expect(result.appliedSkills).toEqual([]);
    expect(result.invocations).toEqual([]);
    expect(chatServiceMock.streamGenerateToolCall).toHaveBeenCalledTimes(1);
  });

  it("auto-selects only from active installed skills with an internal tool call", async () => {
    chatServiceMock.streamGenerateToolCall.mockResolvedValue({
      id: "call_1",
      name: "select_text_skills",
      args: {
        skill_ids: ["translation-localization", "inactive-summary"],
        reason: "translation request",
      },
      status: "pending",
    });
    const { resolveSkillsForMessage } =
      await import("../services/api/skillService");

    const result = await resolveSkillsForMessage({
      message: "请翻译成英文",
      selectedModel: "openai:gpt-4",
      locale: "zh",
      installedSkills: [inactiveDefinition, zhDefinition],
      activeSkillIds: ["translation-localization"],
      autoSelect: true,
    });

    const [, prompt, tools] = chatServiceMock.streamGenerateToolCall.mock
      .calls[0];
    expect(prompt).toContain("翻译与本地化");
    expect(prompt).not.toContain("Inactive Summary");
    expect(JSON.stringify(tools)).toContain("translation-localization");
    expect(JSON.stringify(tools)).not.toContain("inactive-summary");
    expect(result.context).toContain("# 翻译与本地化");
    expect(result.context).not.toContain("# Inactive Summary");
    expect(result.invocations).toEqual([
      {
        id: "translation-localization",
        title: "翻译与本地化",
        category: "writing",
        mode: "auto",
      },
    ]);
  });

  it("uses persisted skill catalog cache after the service module reloads", async () => {
    storeMock.state.skillCatalogs["zh-CN"] = zhCatalog as SkillCatalog;
    storeMock.state.skillCatalogTimestamps["zh-CN"] = Date.now();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("network should not be used when cache is fresh"),
    );

    const { fetchSkillCatalog } = await import("../services/api/skillService");
    await expect(fetchSkillCatalog("zh")).resolves.toMatchObject({
      locale: "zh-CN",
      skills: [expect.objectContaining({ id: "translation-localization" })],
    });

    vi.resetModules();
    const reloaded = await import("../services/api/skillService");
    await expect(reloaded.fetchSkillCatalog("zh")).resolves.toMatchObject({
      locale: "zh-CN",
      skills: [expect.objectContaining({ id: "translation-localization" })],
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reuses cached catalog and definition requests until force refresh", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url === "/data/skills/skills.metadata.zh-CN.json") {
          return jsonResponse(zhCatalog);
        }
        if (url === "/data/skills/translation-localization.zh-CN.json") {
          return jsonResponse(zhDefinition);
        }
        return jsonResponse({ message: "not found" }, { status: 404 });
      });
    const { fetchSkillCatalog, fetchSkillDefinition } =
      await import("../services/api/skillService");

    await fetchSkillCatalog("zh");
    await fetchSkillCatalog("zh");
    await fetchSkillDefinition(zhCatalog.skills[0], "zh");
    await fetchSkillDefinition(zhCatalog.skills[0], "zh");

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "/data/skills/skills.metadata.zh-CN.json",
      "/data/skills/translation-localization.zh-CN.json",
    ]);

    await fetchSkillCatalog("zh", true);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "/data/skills/skills.metadata.zh-CN.json",
      "/data/skills/translation-localization.zh-CN.json",
      "/data/skills/skills.metadata.zh-CN.json",
    ]);
  });
});
