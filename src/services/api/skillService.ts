import type {
  AppliedSkill,
  AppliedSkillInvocation,
  SkillCatalog,
  SkillCatalogEntry,
  SkillDataLocale,
  TextSkill,
} from "@/types";
import { useSettingsStore } from "@/store/core/settingsStore";
import {
  buildSkillPromptContext,
  createSkillInvocations,
  createSkillSelectionTool,
  createSkillSelectionToolPrompt,
  mergeBuiltInAndCustomSkills,
  normalizeSkillCatalog,
  normalizeSkillIdRefs,
  normalizeTextSkill,
  parseSkillSelectionToolCall,
  recallSkillCandidates,
  resolveSkillDataLocale,
  selectSkillsForMessage,
} from "../../lib/skills";
import { readJsonResponseOrThrow } from "../../lib/api/client";
import { logDevWarn } from "../../lib/utils/devLogger";
import { CACHE_CONFIG } from "../../config/api";
import { streamGenerateToolCall } from "./chatService";

const catalogRequests = new Map<string, Promise<SkillCatalog>>();
const definitionRequests = new Map<string, Promise<TextSkill>>();

function getCatalogPath(locale: SkillDataLocale) {
  if (locale === "zh-CN") return "/data/skills/skills.metadata.zh-CN.json";
  if (locale === "ja") return "/data/skills/skills.metadata.ja.json";
  return "/data/skills/skills.metadata.json";
}

function getSkillDefinitionCacheKey(
  locale: SkillDataLocale,
  file: string,
): string {
  return `${locale}:${file}`;
}

function getCachedSkillCatalog(locale: SkillDataLocale): SkillCatalog | null {
  const { skillCatalogs, skillCatalogTimestamps } = useSettingsStore.getState();
  const catalog = skillCatalogs?.[locale];
  const timestamp = skillCatalogTimestamps?.[locale] || 0;

  if (!catalog || !timestamp || Date.now() - timestamp >= CACHE_CONFIG.skills) {
    return null;
  }

  const normalized = normalizeSkillCatalog(catalog);
  return normalized.skills.length > 0 ? { ...normalized, locale } : null;
}

function getCachedSkillDefinition(cacheKey: string): TextSkill | null {
  const { skillDefinitions, skillDefinitionTimestamps } =
    useSettingsStore.getState();
  const skill = skillDefinitions?.[cacheKey];
  const timestamp = skillDefinitionTimestamps?.[cacheKey] || 0;

  if (!skill || !timestamp || Date.now() - timestamp >= CACHE_CONFIG.skills) {
    return null;
  }

  return normalizeTextSkill(skill);
}

export async function fetchSkillCatalog(
  locale?: string,
  forceRefresh = false,
): Promise<SkillCatalog> {
  const dataLocale = resolveSkillDataLocale(locale);
  const cacheKey = dataLocale;
  if (!forceRefresh) {
    const cachedCatalog = getCachedSkillCatalog(dataLocale);
    if (cachedCatalog) return cachedCatalog;
  }

  if (!forceRefresh && catalogRequests.has(cacheKey)) {
    return catalogRequests.get(cacheKey)!;
  }

  const request = (async () => {
    const response = await fetch(getCatalogPath(dataLocale), {
      cache: forceRefresh ? "no-store" : "default",
    });
    if (!response.ok) throw new Error("Failed to fetch skills catalog");
    const data = await readJsonResponseOrThrow(
      response,
      "Failed to fetch skills catalog",
    );
    const catalog = normalizeSkillCatalog(data);
    useSettingsStore.getState().setSkillCatalog?.(dataLocale, catalog);
    return catalog;
  })();

  catalogRequests.set(cacheKey, request);

  try {
    return await request;
  } catch (error) {
    catalogRequests.delete(cacheKey);
    if (dataLocale !== "en") {
      logDevWarn("Failed to load localized skills catalog:", error);
      return fetchSkillCatalog("en", forceRefresh);
    }
    throw error;
  }
}

export async function fetchSkillDefinition(
  entry: SkillCatalogEntry,
  locale?: string,
  forceRefresh = false,
): Promise<TextSkill | null> {
  const customSkill = normalizeTextSkill(entry);
  if (customSkill?.content && !entry.file) return customSkill;

  if (!entry.file) return null;
  const dataLocale = resolveSkillDataLocale(locale);
  const cacheKey = getSkillDefinitionCacheKey(dataLocale, entry.file);
  if (!forceRefresh) {
    const cachedSkill = getCachedSkillDefinition(cacheKey);
    if (cachedSkill) return { ...cachedSkill, builtIn: true };
  }

  if (!forceRefresh && definitionRequests.has(cacheKey)) {
    return definitionRequests.get(cacheKey)!;
  }

  const request = (async () => {
    const response = await fetch(`/data/skills/${entry.file}`, {
      cache: forceRefresh ? "no-store" : "default",
    });
    if (!response.ok) throw new Error("Failed to fetch skill definition");
    const data = await readJsonResponseOrThrow(
      response,
      "Failed to fetch skill definition",
    );
    const skill = normalizeTextSkill(data);
    if (!skill) throw new Error("Invalid skill definition");
    const definition = { ...skill, builtIn: true };
    useSettingsStore.getState().setSkillDefinition?.(cacheKey, definition);
    return definition;
  })();

  definitionRequests.set(cacheKey, request);

  try {
    return await request;
  } catch (error) {
    definitionRequests.delete(cacheKey);
    logDevWarn("Failed to load skill definition:", error);
    return null;
  }
}

export async function getMergedSkills({
  installedSkills,
  customSkills = [],
  locale,
  forceRefresh = false,
}: {
  installedSkills?: readonly TextSkill[];
  customSkills?: readonly TextSkill[];
  locale?: string;
  forceRefresh?: boolean;
} = {}): Promise<SkillCatalogEntry[]> {
  if (installedSkills) {
    return mergeBuiltInAndCustomSkills([], installedSkills);
  }

  try {
    const catalog = await fetchSkillCatalog(locale, forceRefresh);
    return mergeBuiltInAndCustomSkills(catalog.skills, customSkills);
  } catch (error) {
    logDevWarn("Failed to load built-in skills:", error);
    return mergeBuiltInAndCustomSkills([], customSkills);
  }
}

export function getRecommendedSkillsForInput({
  message,
  skills,
  limit = 6,
}: {
  message: string;
  skills: readonly SkillCatalogEntry[];
  locale?: string;
  limit?: number;
}) {
  return recallSkillCandidates({ message, skills, limit }).map(
    (candidate) => candidate.skill,
  );
}

export async function resolveSkillsForMessage({
  message,
  selectedModel,
  installedSkills,
  customSkills = [],
  activeSkillIds,
  autoSelect,
  signal,
}: {
  message: string;
  selectedModel: string;
  locale?: string;
  installedSkills?: readonly TextSkill[];
  customSkills?: readonly TextSkill[];
  activeSkillIds: readonly string[];
  autoSelect: boolean;
  signal?: AbortSignal;
}): Promise<{
  appliedSkills: AppliedSkill[];
  invocations: AppliedSkillInvocation[];
  context: string;
}> {
  const skills: TextSkill[] = [];
  const seenSkillIds = new Set<string>();
  for (const item of [...(installedSkills || []), ...customSkills]) {
    const skill = normalizeTextSkill(item);
    if (!skill || seenSkillIds.has(skill.id)) continue;
    seenSkillIds.add(skill.id);
    skills.push(skill);
  }

  const activeIds = normalizeSkillIdRefs(activeSkillIds, skills);
  if (activeIds.length === 0) {
    return {
      appliedSkills: [],
      invocations: [],
      context: "",
    };
  }

  const skillsById = new Map(skills.map((skill) => [skill.id, skill]));
  const activeSkills = activeIds
    .map((id) => skillsById.get(id))
    .filter((skill): skill is TextSkill => Boolean(skill));
  if (activeSkills.length === 0) {
    return {
      appliedSkills: [],
      invocations: [],
      context: "",
    };
  }

  let appliedSkills: AppliedSkill[] = [];
  if (!autoSelect) {
    appliedSkills = activeSkills.map((skill) => ({ skill, mode: "manual" }));
    const context = buildSkillPromptContext({ skills: appliedSkills });
    return {
      appliedSkills,
      invocations: createSkillInvocations(appliedSkills),
      context,
    };
  }

  let selectedSkillIds: string[] | null = null;
  try {
    const toolCall = await streamGenerateToolCall(
      selectedModel,
      createSkillSelectionToolPrompt({ message, skills: activeSkills }),
      [createSkillSelectionTool({ skills: activeSkills })],
      signal,
    );
    const selection = parseSkillSelectionToolCall(toolCall, activeSkills);

    if (selection) {
      selectedSkillIds = selection.selectedSkillIds;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    logDevWarn("Skill selection tool call failed:", error);
  }

  if (selectedSkillIds) {
    appliedSkills = selectedSkillIds
      .map((id) => skillsById.get(id))
      .filter((skill): skill is TextSkill => Boolean(skill))
      .map((skill) => ({ skill, mode: "auto" }));
  } else {
    const fallbackSelection = await selectSkillsForMessage({
      message,
      skills: activeSkills,
      manualSkillIds: [],
      autoSelect: true,
    });
    appliedSkills = fallbackSelection
      .map(({ skill }) => skillsById.get(skill.id))
      .filter((skill): skill is TextSkill => Boolean(skill))
      .map((skill) => ({ skill, mode: "auto" }));
  }

  const context = buildSkillPromptContext({ skills: appliedSkills });
  return {
    appliedSkills,
    invocations: createSkillInvocations(appliedSkills),
    context,
  };
}
