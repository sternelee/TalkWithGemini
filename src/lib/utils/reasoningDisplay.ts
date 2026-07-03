import { REASONING_UI_LIMITS } from "../../config/limits";

const TRANSLATION_TRUNCATION_NOTICE =
  "\n\n[Reasoning truncated before translation.]";

export function extractReasoningTitle(text: string): string | null {
  const scanText =
    text.length > REASONING_UI_LIMITS.maxTitleScanChars
      ? text.slice(-REASONING_UI_LIMITS.maxTitleScanChars)
      : text;

  const matches = [...scanText.matchAll(/^\s*\*\*(.+?)\*\*\s*$/gm)];
  if (matches.length === 0) return null;

  return matches[matches.length - 1][1].trim() || null;
}

export function createReasoningTranslationPrompt(
  reasoning: string,
  targetLanguage: string,
): { prompt: string; truncated: boolean } {
  const truncated =
    reasoning.length > REASONING_UI_LIMITS.maxTranslationInputChars;
  const boundedReasoning = truncated
    ? `${reasoning.slice(0, REASONING_UI_LIMITS.maxTranslationInputChars)}${TRANSLATION_TRUNCATION_NOTICE}`
    : reasoning;

  return {
    truncated,
    prompt: `Translate the following thinking process to ${targetLanguage}. Maintain the original markdown formatting. Do not output anything else.\n\n${boundedReasoning}`,
  };
}
