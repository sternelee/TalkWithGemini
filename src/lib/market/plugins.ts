import type { Plugin } from "../../types";
import { MARKET_LIMITS } from "../../config/limits";

const PLUGIN_ID_RE = /^[A-Za-z0-9._:-]+$/;

function trimString(value: unknown, maxChars: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxChars) : "";
}

function trimWebUrl(value: unknown, maxChars: number): string {
  const candidate = trimString(value, maxChars);
  if (!candidate) return "";

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

function normalizePluginCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const categories: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const category = trimString(item, MARKET_LIMITS.maxPluginCategoryChars);
    const key = category.toLowerCase();
    if (!category || seen.has(key)) continue;

    categories.push(category);
    seen.add(key);
    if (categories.length >= MARKET_LIMITS.maxPluginCategories) break;
  }

  return categories;
}

export function normalizeMarketPlugin(value: unknown): Plugin | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const id = trimString(raw.id, MARKET_LIMITS.maxPluginIdChars);
  if (!id || !PLUGIN_ID_RE.test(id)) return null;

  const manifestUrl = trimWebUrl(
    raw.manifestUrl,
    MARKET_LIMITS.maxPluginManifestUrlChars,
  );
  if (!manifestUrl) return null;

  const categories = normalizePluginCategories(raw.categories);
  const category =
    trimString(raw.category, MARKET_LIMITS.maxPluginCategoryChars) ||
    categories[0] ||
    id.split(":")[0] ||
    "General";

  return {
    id,
    title: trimString(raw.title, MARKET_LIMITS.maxPluginTitleChars) || id,
    description:
      trimString(raw.description, MARKET_LIMITS.maxPluginDescriptionChars) ||
      "No description provided",
    logoUrl: trimWebUrl(raw.logoUrl, MARKET_LIMITS.maxPluginLogoUrlChars),
    manifestUrl,
    externalDocsUrl:
      trimWebUrl(raw.externalDocsUrl, MARKET_LIMITS.maxPluginDocsUrlChars) ||
      undefined,
    functions: [],
    category,
    categories,
    added: trimString(raw.added, MARKET_LIMITS.maxAgentCreatedAtChars),
  };
}

export function normalizeMarketPlugins(value: unknown): Plugin[] {
  if (!Array.isArray(value)) return [];

  const plugins: Plugin[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const plugin = normalizeMarketPlugin(item);
    if (!plugin || seen.has(plugin.id)) continue;

    plugins.push(plugin);
    seen.add(plugin.id);
    if (plugins.length >= MARKET_LIMITS.maxPlugins) break;
  }

  return plugins;
}

export function normalizeApiGuruPlugins(value: unknown): Plugin[] {
  if (!value || typeof value !== "object") return [];

  const rawPlugins: unknown[] = [];

  for (const [key, entryValue] of Object.entries(value)) {
    if (
      key.includes("amazonaws") ||
      key.includes("azure") ||
      key.includes("google")
    ) {
      continue;
    }

    if (!entryValue || typeof entryValue !== "object") continue;
    const entry = entryValue as Record<string, unknown>;
    const versions =
      entry.versions && typeof entry.versions === "object"
        ? (entry.versions as Record<string, unknown>)
        : {};
    const preferred = trimString(entry.preferred, 200);
    const versionValue = versions[preferred];
    if (!versionValue || typeof versionValue !== "object") continue;

    const version = versionValue as Record<string, unknown>;
    const info =
      version.info && typeof version.info === "object"
        ? (version.info as Record<string, unknown>)
        : {};
    const logo =
      info["x-logo"] && typeof info["x-logo"] === "object"
        ? (info["x-logo"] as Record<string, unknown>)
        : {};
    const externalDocs =
      version.externalDocs && typeof version.externalDocs === "object"
        ? (version.externalDocs as Record<string, unknown>)
        : {};
    const categories = normalizePluginCategories(info["x-apisguru-categories"]);

    rawPlugins.push({
      id: key,
      title: info.title,
      description: info.description,
      logoUrl: logo.url,
      manifestUrl: version.swaggerUrl,
      externalDocsUrl: externalDocs.url,
      category: categories[0],
      categories,
      added: entry.added,
    });

    if (rawPlugins.length >= MARKET_LIMITS.maxPlugins * 2) break;
  }

  return normalizeMarketPlugins(rawPlugins);
}
