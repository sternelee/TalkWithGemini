/**
 * Localized display copy for built-in plugins.
 *
 * Built-in plugin `title`/`description` are product copy shown in the UI, so we
 * translate them via the `Config` message namespace. They are matched by the
 * plugin `id` (a stable identifier), never by the displayed text. Everything
 * else stays as-is: `category` is an identifier used for filtering/matching, and
 * `functions[].description` plus parameter schemas are sent to the model as tool
 * declarations and must remain in English to keep tool-calling behavior stable.
 */

export type ConfigPluginKey =
  | "pluginJinaTitle"
  | "pluginJinaDescription"
  | "pluginWeatherTitle"
  | "pluginWeatherDescription"
  | "pluginUnsplashTitle"
  | "pluginUnsplashDescription"
  | "pluginAgnesImageTitle"
  | "pluginAgnesImageDescription"
  | "pluginGeminiImageTitle"
  | "pluginGeminiImageDescription"
  | "pluginOpenAIImageTitle"
  | "pluginOpenAIImageDescription"
  | "pluginOpenAIResponsesImageTitle"
  | "pluginOpenAIResponsesImageDescription"
  | "pluginAgnesVideoTitle"
  | "pluginAgnesVideoDescription";

const BUILT_IN_PLUGIN_I18N: Record<
  string,
  { titleKey: ConfigPluginKey; descriptionKey: ConfigPluginKey }
> = {
  "jina-web-reader": {
    titleKey: "pluginJinaTitle",
    descriptionKey: "pluginJinaDescription",
  },
  "weather-gpt": {
    titleKey: "pluginWeatherTitle",
    descriptionKey: "pluginWeatherDescription",
  },
  unsplash: {
    titleKey: "pluginUnsplashTitle",
    descriptionKey: "pluginUnsplashDescription",
  },
  "agnes-image-generation": {
    titleKey: "pluginAgnesImageTitle",
    descriptionKey: "pluginAgnesImageDescription",
  },
  "gemini-image-generation": {
    titleKey: "pluginGeminiImageTitle",
    descriptionKey: "pluginGeminiImageDescription",
  },
  "openai-image-generation": {
    titleKey: "pluginOpenAIImageTitle",
    descriptionKey: "pluginOpenAIImageDescription",
  },
  "openai-responses-image-processing": {
    titleKey: "pluginOpenAIResponsesImageTitle",
    descriptionKey: "pluginOpenAIResponsesImageDescription",
  },
  "agnes-video-generation": {
    titleKey: "pluginAgnesVideoTitle",
    descriptionKey: "pluginAgnesVideoDescription",
  },
};

/**
 * Returns a copy of the plugin with its `title`/`description` replaced by the
 * localized strings from the `Config` namespace. Non-built-in plugins (remote /
 * custom) are returned unchanged.
 */
export function localizePluginMeta<
  T extends { id: string; title: string; description: string },
>(plugin: T, t: (key: ConfigPluginKey) => string): T {
  const mapping = BUILT_IN_PLUGIN_I18N[plugin.id];
  if (!mapping) return plugin;
  return {
    ...plugin,
    title: t(mapping.titleKey),
    description: t(mapping.descriptionKey),
  };
}
