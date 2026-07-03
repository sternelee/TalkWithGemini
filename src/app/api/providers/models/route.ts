import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { ProviderRuntimeConfigSchema } from "@/lib/api/schemas";
import { safeFetchJson } from "@/lib/security/safeFetch";
import { extractProviderModelIds } from "@/lib/providers/models";
import {
  getProviderApiKey,
  getProviderModelsUrl,
  getSafeUrlPolicy,
} from "@/lib/security/urlPolicy";
import { isOpenAIProviderType } from "@/lib/providers/providerTypes";
import { resolveProviderRuntimeConfig } from "@/lib/byok/server";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

const ProviderModelsRequestSchema = z.object({
  provider: ProviderRuntimeConfigSchema,
});

export async function POST(request: NextRequest) {
  try {
    const { provider: parsedProvider } = ProviderModelsRequestSchema.parse(
      await readJsonRequestBody(request),
    );
    const provider = await resolveProviderRuntimeConfig(parsedProvider);
    const apiKey = getProviderApiKey(provider);

    if (!apiKey) {
      return NextResponse.json(
        { error: `${provider.type} API key is not configured` },
        { status: 401 },
      );
    }

    const endpoint = getProviderModelsUrl(provider.baseUrl, provider.type);
    const headers: Record<string, string> = {};
    if (isOpenAIProviderType(provider.type)) {
      headers.Authorization = `Bearer ${apiKey}`;
    } else {
      headers["x-goog-api-key"] = apiKey;
    }

    const { response, data } = await safeFetchJson<any>(
      endpoint,
      { method: "GET", headers },
      {
        policy: getSafeUrlPolicy("provider"),
        timeoutMs: 20_000,
        maxResponseBytes: 4 * 1024 * 1024,
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch ${provider.type} models` },
        { status: response.status },
      );
    }

    const models = extractProviderModelIds(provider.type, data);

    return NextResponse.json({ models });
  } catch (error) {
    safeServerLogError("Provider models error:", error);
    return createApiErrorResponse(error, "Failed to fetch models");
  }
}
