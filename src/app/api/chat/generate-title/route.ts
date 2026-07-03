import { NextRequest } from "next/server";
import { z } from "zod";
import {
  MessageSchema,
  ModelNameSchema,
  ProviderRuntimeConfigSchema,
} from "@/lib/api/schemas";
import { generateTitle } from "@/lib/api/auxiliary-handler";
import { withApiHandler } from "@/lib/api/middleware";
import { resolveProviderRuntimeConfig } from "@/lib/byok/server";

const GenerateTitleSchema = z.object({
  provider: ProviderRuntimeConfigSchema,
  modelName: ModelNameSchema,
  history: z.array(MessageSchema).max(100),
});

export const POST = withApiHandler(async (request: NextRequest, body: any) => {
  const parsed = GenerateTitleSchema.parse(body);

  const title = await generateTitle(
    await resolveProviderRuntimeConfig(parsed.provider),
    parsed.modelName,
    parsed.history,
  );

  return Response.json({ title });
});
