import { NextRequest } from "next/server";
import { z } from "zod";
import { API_INPUT_LIMITS } from "@/config/limits";
import {
  ModelNameSchema,
  ProviderRuntimeConfigSchema,
} from "@/lib/api/schemas";
import { generateRAGQueries } from "@/lib/api/auxiliary-handler";
import { withApiHandler, validateRequestBody } from "@/lib/api/middleware";
import { resolveProviderRuntimeConfig } from "@/lib/byok/server";

export const POST = withApiHandler(async (request: NextRequest, body: any) => {
  validateRequestBody(body, ["provider", "modelName"]);

  const parsed = z
    .object({
      provider: ProviderRuntimeConfigSchema,
      modelName: ModelNameSchema,
      userMessage: z
        .string()
        .min(1)
        .max(API_INPUT_LIMITS.maxAuxiliaryTextChars)
        .optional(),
      userPrompt: z
        .string()
        .min(1)
        .max(API_INPUT_LIMITS.maxAuxiliaryTextChars)
        .optional(),
    })
    .refine((value) => value.userMessage || value.userPrompt, {
      message: "Missing required field: userMessage",
    })
    .parse(body);

  const queries = await generateRAGQueries(
    await resolveProviderRuntimeConfig(parsed.provider),
    parsed.modelName,
    parsed.userMessage || parsed.userPrompt || "",
  );

  return Response.json({ queries });
});
