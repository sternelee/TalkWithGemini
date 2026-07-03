import { NextRequest, NextResponse } from "next/server";
import { v7 as uuidv7 } from "uuid";
import {
  assertProviderOutboundAllowed,
  createGeminiClient,
} from "@/utils/apiHelpers";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { ImageGenerateRequestSchema } from "@/lib/api/schemas";
import { safeFetchJson } from "@/lib/security/safeFetch";
import {
  getProviderApiKey,
  getSafeUrlPolicy,
  normalizeProviderBaseUrl,
} from "@/lib/security/urlPolicy";
import { resolveProviderRuntimeConfig } from "@/lib/byok/server";
import { normalizeGeneratedImageAttachments } from "@/lib/utils/generatedImages";
import { safeServerLogError } from "@/lib/utils/safeServerLog";
import { isOpenAIProviderType } from "@/lib/providers/providerTypes";

export async function POST(request: NextRequest) {
  try {
    const body = ImageGenerateRequestSchema.parse(
      await readJsonRequestBody(request),
    );
    const { modelName, prompt } = body;
    const provider = await resolveProviderRuntimeConfig(body.provider);

    if (isOpenAIProviderType(provider.type)) {
      const apiKey = getProviderApiKey(provider);
      if (!apiKey) {
        return NextResponse.json(
          { error: "OpenAI API key is not configured" },
          { status: 401 },
        );
      }
      const baseUrl = normalizeProviderBaseUrl(provider.baseUrl, "OpenAI");
      const url = `${baseUrl}/images/generations`;

      const { response, data } = await safeFetchJson<any>(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            prompt: prompt,
            n: 1,
            size: "1024x1024",
            response_format: "b64_json",
          }),
        },
        {
          policy: getSafeUrlPolicy("provider"),
          timeoutMs: 60_000,
          maxResponseBytes: 20 * 1024 * 1024,
        },
      );

      if (!response.ok) {
        throw new Error(
          `OpenAI Image Error: ${data.error?.message || response.statusText}`,
        );
      }

      if (data.data && data.data.length > 0) {
        const images = normalizeGeneratedImageAttachments(
          data.data.map((item: any) => ({
            id: uuidv7(),
            mimeType: "image/png",
            data: item.b64_json,
            fileName: `generated-${Date.now()}.png`,
          })),
        );

        if (images.length > 0) {
          return NextResponse.json({
            images,
            message: `Generated ${images.length} image(s) for prompt: "${prompt}"`,
          });
        }
      }

      return NextResponse.json({
        images: [],
        message: "No images generated.",
      });
    } else {
      // Gemini
      await assertProviderOutboundAllowed(provider);
      const ai = createGeminiClient(provider);

      const response: any = await ai.models.generateImages({
        model: modelName,
        prompt: prompt,
        config: {
          numberOfImages: 1,
          aspectRatio: "1:1",
        },
      });

      if (response.generatedImages && response.generatedImages.length > 0) {
        const images = normalizeGeneratedImageAttachments(
          response.generatedImages.map((img: any) => ({
            id: uuidv7(),
            mimeType: img.image?.mimeType || "image/png",
            data: img.image?.imageBytes,
            fileName: `imagen-${Date.now()}.png`,
          })),
        );

        if (images.length > 0) {
          return NextResponse.json({
            images,
            message: `Generated image for: "${prompt}"`,
          });
        }
      }

      return NextResponse.json({
        images: [],
        message: "No images generated.",
      });
    }
  } catch (error: any) {
    safeServerLogError("Image generation error:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return createApiErrorResponse(error, "Invalid image generation request");
    }
    return createApiErrorResponse(error, "Image generation failed");
  }
}
