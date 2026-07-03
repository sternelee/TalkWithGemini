import { Message } from "@/types";

/**
 * Calculate actual user message tokens by subtracting previous messages' tokens
 */
export const calculateActualUserTokens = (
  messages: Message[],
  userMsgId: string,
  totalPromptTokens: number,
): number => {
  let previousTokens = 0;

  // Sum up tokens from all previous messages (excluding the current user message)
  for (const msg of messages) {
    if (msg.id === userMsgId) break; // Stop at current user message

    if (msg.usageMetadata) {
      // Gemini format: add both prompt and completion tokens
      previousTokens += msg.usageMetadata.promptTokenCount || 0;
      previousTokens += msg.usageMetadata.candidatesTokenCount || 0;
    } else if (msg.usage) {
      // OpenAI format: add both prompt and completion tokens
      previousTokens += msg.usage.prompt_tokens || 0;
      previousTokens += msg.usage.completion_tokens || 0;
    }
  }

  return Math.max(0, totalPromptTokens - previousTokens);
};
