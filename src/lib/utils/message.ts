import { Message } from "@/types";
import { calculateActualUserTokens } from "./tokens";

/**
 * Update user message with actual token usage
 */
export const updateUserMessageTokens = (
  messages: Message[],
  userMsgId: string,
  totalPromptTokens: number,
  format: "openai" | "gemini",
  updateMessage: (
    sessionId: string,
    msgId: string,
    updates: Partial<Message>,
  ) => void,
  sessionId: string,
): void => {
  const actualUserTokens = calculateActualUserTokens(
    messages,
    userMsgId,
    totalPromptTokens,
  );

  if (format === "openai") {
    updateMessage(sessionId, userMsgId, {
      usage: {
        prompt_tokens: actualUserTokens,
        completion_tokens: 0,
        total_tokens: actualUserTokens,
      },
    });
  } else {
    updateMessage(sessionId, userMsgId, {
      usageMetadata: {
        promptTokenCount: actualUserTokens,
        candidatesTokenCount: 0,
        totalTokenCount: actualUserTokens,
      },
    });
  }
};

/**
 * Handle token usage updates for both bot and user messages
 */
export const handleTokenUsageUpdate = (
  usage: any,
  currentMessages: Message[],
  userMsgId: string,
  botMsgId: string,
  sessionId: string,
  updateMessage: (
    sessionId: string,
    msgId: string,
    updates: Partial<Message>,
  ) => void,
): void => {
  // Update bot message with completion tokens
  updateMessage(sessionId, botMsgId, usage);

  // Calculate and update user message with actual tokens
  if (usage.usage) {
    // OpenAI format
    updateUserMessageTokens(
      currentMessages,
      userMsgId,
      usage.usage.prompt_tokens,
      "openai",
      updateMessage,
      sessionId,
    );
  } else if (usage.usageMetadata) {
    // Gemini format
    updateUserMessageTokens(
      currentMessages,
      userMsgId,
      usage.usageMetadata.promptTokenCount,
      "gemini",
      updateMessage,
      sessionId,
    );
  }
};
