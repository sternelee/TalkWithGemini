import { NextRequest } from "next/server";
import { handleChatStream } from "@/lib/api/chat-handler";
import { withStreamApiHandler, logRequest } from "@/lib/api/middleware";
import { ChatRequestSchema } from "@/lib/api/schemas";
import { resolveProviderRuntimeConfig } from "@/lib/byok/server";

export const POST = withStreamApiHandler(
  async (request: NextRequest, body: any) => {
    const parsed = ChatRequestSchema.parse(body);

    logRequest("Chat", {
      providerType: parsed.provider.type,
      modelName: parsed.modelName,
      historyLength: parsed.history.length,
    });

    return handleChatStream({
      provider: await resolveProviderRuntimeConfig(parsed.provider),
      modelName: parsed.modelName,
      history: parsed.history,
      newMessage: parsed.newMessage,
      attachments: parsed.attachments,
      config: parsed.config,
      systemInstruction: parsed.systemInstruction,
      tools: parsed.tools,
      enableImageGeneration: parsed.enableImageGeneration,
      enableGoogleSearch: parsed.enableGoogleSearch,
      enableOpenAIWebSearch: parsed.enableOpenAIWebSearch,
    });
  },
);
