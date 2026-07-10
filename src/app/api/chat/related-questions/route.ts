import { NextRequest } from "next/server";
import { z } from "zod";
import {
  MessageSchema,
  ModelNameSchema,
  ProviderRuntimeConfigSchema,
} from "@/lib/api/schemas";
import { generateRelatedQuestions } from "@/lib/api/auxiliary-handler";
import { withApiHandler } from "@/lib/api/middleware";
import { resolveProviderRuntimeConfig } from "@/lib/byok/server";

const RelatedQuestionsSchema = z.object({
  provider: ProviderRuntimeConfigSchema,
  modelName: ModelNameSchema,
  history: z.array(MessageSchema).max(100),
});

export const POST = withApiHandler(async (request: NextRequest, body: any) => {
  const parsed = RelatedQuestionsSchema.parse(body);

  const questions = await generateRelatedQuestions(
    await resolveProviderRuntimeConfig(parsed.provider),
    parsed.modelName,
    parsed.history,
    request.signal,
  );

  return Response.json({ questions });
});
