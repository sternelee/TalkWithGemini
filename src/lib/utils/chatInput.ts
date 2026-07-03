import { API_INPUT_LIMITS } from "../../config/limits";

export const CHAT_INPUT_TRUNCATION_NOTICE =
  "\n[Additional context truncated to fit model request limits.]";

export function clampChatInputText(
  value: string,
  maxChars: number = API_INPUT_LIMITS.maxChatTextChars,
): string {
  if (value.length <= maxChars) return value;

  const notice =
    maxChars > CHAT_INPUT_TRUNCATION_NOTICE.length
      ? CHAT_INPUT_TRUNCATION_NOTICE
      : "";
  return value.slice(0, maxChars - notice.length) + notice;
}

export function appendContextToChatInput(
  baseText: string,
  contextText: string,
  {
    separator = "\n",
    maxChars = API_INPUT_LIMITS.maxChatTextChars,
  }: {
    separator?: string;
    maxChars?: number;
  } = {},
): string {
  const safeBase = clampChatInputText(baseText, maxChars);
  if (!contextText) return safeBase;

  const available = maxChars - safeBase.length - separator.length;
  if (available <= 0) return safeBase;

  if (contextText.length <= available) {
    return `${safeBase}${separator}${contextText}`;
  }

  const notice =
    available > CHAT_INPUT_TRUNCATION_NOTICE.length
      ? CHAT_INPUT_TRUNCATION_NOTICE
      : "";
  const contextSlice = contextText.slice(0, available - notice.length);
  return `${safeBase}${separator}${contextSlice}${notice}`;
}
