export type AgentMarketLocale = "en" | "zh" | "ja";

export function normalizeAgentMarketLocale(
  locale: string | null | undefined,
): AgentMarketLocale {
  const normalized = locale?.toLowerCase();
  if (normalized === "zh" || normalized?.startsWith("zh-")) return "zh";
  if (normalized === "ja" || normalized?.startsWith("ja-")) return "ja";
  return "en";
}
