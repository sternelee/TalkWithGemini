import type { VoiceLanguage } from "./types";

export function getBrowserVoiceLanguage(
  language: VoiceLanguage | string | undefined,
  fallbackLanguage = "en-US",
): string {
  if (language === "en") return "en-US";
  if (language === "zh") return "zh-CN";
  if (language === "ja") return "ja-JP";
  return fallbackLanguage || "en-US";
}

export function getProviderTranscriptionLanguage(
  language: VoiceLanguage | string | undefined,
): "en" | "zh" | "ja" | undefined {
  if (language === "en" || language === "zh" || language === "ja") {
    return language;
  }
  return undefined;
}

export function getGeminiTranscriptionPrompt(language?: VoiceLanguage): string {
  if (language === "zh") {
    return "Transcribe the speech directly into Simplified Chinese text. Do not include any other text.";
  }
  if (language === "ja") {
    return "Transcribe the speech directly into Japanese text. Do not include any other text.";
  }
  if (language === "en") {
    return "Transcribe the speech directly into English text. Do not include any other text.";
  }
  return "Generate a transcript of the speech.";
}
