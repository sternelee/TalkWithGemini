import { NextRequest } from "next/server";
import { handleChatStream } from "@/lib/api/chat-handler";
import { withStreamApiHandler } from "@/lib/api/middleware";
import { SimpleGenerateRequestSchema } from "@/lib/api/schemas";
import { resolveProviderRuntimeConfig } from "@/lib/byok/server";

export const POST = withStreamApiHandler(
  async (request: NextRequest, body: any) => {
    const parsed = SimpleGenerateRequestSchema.parse(body);

    return handleChatStream({
      provider: await resolveProviderRuntimeConfig(parsed.provider),
      modelName: parsed.modelName,
      history: [],
      newMessage: parsed.prompt,
      attachments: [],
      config: { temperature: 0.7 },
      signal: request.signal,
    });
  },
);
