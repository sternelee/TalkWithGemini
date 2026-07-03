export type AgentMarketLocale = "en" | "zh";

export function normalizeAgentMarketLocale(
  locale: string | null | undefined,
): AgentMarketLocale {
  return locale === "zh" || locale?.toLowerCase().startsWith("zh-")
    ? "zh"
    : "en";
}
